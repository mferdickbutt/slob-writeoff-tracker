#!/usr/bin/env bash
# SLOB tracker checks: pure math edge cases + static first-paint HTML.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0

pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "FAIL: $1"
  FAIL=$((FAIL + 1))
}

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required"
  echo "Summary: 0 passed, 1 failed"
  exit 1
fi

MATH_OUT="$(node << 'NODE'
const fs = require("fs");
const Slob = require("./js/slob.js");

function isPoison(value) {
  if (typeof value === "number") return !Number.isFinite(value);
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return value.some(isPoison);
    return Object.keys(value).some((k) => isPoison(value[k]));
  }
  return false;
}

function check(name, cond) {
  process.stdout.write((cond ? "PASS: " : "FAIL: ") + name + "\n");
}

check("null input totalSlob returns null", Slob.totalSlob(null) === null);
check("empty SKU series totalSlob returns null", Slob.totalSlob([]) === null);
check("null input writeOffTotal returns null", Slob.writeOffTotal(null) === null);
check("empty SKU series writeOffTotal returns null", Slob.writeOffTotal([]) === null);
check("null input topSkuShare returns null", Slob.topSkuShare(null) === null);
check("empty SKU series topSkuShare returns null", Slob.topSkuShare([]) === null);

const zeroSlob = [
  { sku: "A", onHandValue: 0, daysSinceLastMovement: 200, writeOffAmount: 0 },
  { sku: "B", onHandValue: 0, daysSinceLastMovement: 180, writeOffAmount: 0 },
];
check("zero SLOB total is 0 not null", Slob.totalSlob(zeroSlob) === 0);
check("zero SLOB top-SKU share is null", Slob.topSkuShare(zeroSlob) === null);
check("zero write-offs total is 0 not null", Slob.writeOffTotal(zeroSlob) === 0);
check("zero SLOB write-off rate is null", Slob.writeOffRate(0, 0) === null);
check("zero write-offs vs positive SLOB rate is 0", Slob.writeOffRate(0, 500) === 0);

const single = [{ sku: "ONLY", onHandValue: 2500, daysSinceLastMovement: 140, writeOffAmount: 0 }];
check("single-SKU month totalSlob equals the one SKU", Slob.totalSlob(single) === 2500);
check("single-SKU month top-SKU share is null", Slob.topSkuShare(single) === null);
check("single-SKU month writeOffTotal is 0", Slob.writeOffTotal(single) === 0);

check("MoM with previous zero SLOB returns null", Slob.monthOverMonth(100, 0) === null);
check("MoM with previous zero write-offs returns null", Slob.monthOverMonth(40, 0) === null);
check("MoM with null inputs returns null", Slob.monthOverMonth(null, null) === null);
check("MoM 110 vs 100 is 0.1", Slob.monthOverMonth(110, 100) === 0.1);

const two = [
  { sku: "A", onHandValue: 80, daysSinceLastMovement: 120, writeOffAmount: 10 },
  { sku: "B", onHandValue: 20, daysSinceLastMovement: 90, writeOffAmount: 0 },
];
check("two-SKU top-SKU share is 0.8", Slob.topSkuShare(two) === 0.8);
check("two-SKU total SLOB is 100", Slob.totalSlob(two) === 100);
check("two-SKU write-off total is 10", Slob.writeOffTotal(two) === 10);

const empty = Slob.analyzeSeries({ months: [] });
check("empty series latest is null", empty.latest === null && empty.mom === null && Array.isArray(empty.months) && empty.months.length === 0);
check("null series analyzeSeries returns empty months", Slob.analyzeSeries(null).months.length === 0);

check("compareToTarget with zero target returns null", Slob.compareToTarget(10, 0) === null);
check("compareToTarget 90 vs 100 is under by 10%", Slob.compareToTarget(90, 100).overTarget === false && Slob.compareToTarget(90, 100).deltaPct === -0.1);

const infGuard = Slob.analyzeSeries({
  targets: { monthlySlob: 0, monthlyWriteOff: 0, topSkuShare: 0 },
  months: [
    { month: "2026-01", skus: [
      { sku: "A", onHandValue: 0, daysSinceLastMovement: 100, writeOffAmount: 0 },
      { sku: "B", onHandValue: 0, daysSinceLastMovement: 100, writeOffAmount: 0 },
    ]},
    { month: "2026-02", skus: [] },
    { month: "2026-03", skus: null },
    { month: "2026-04", skus: [{ sku: "ONLY", onHandValue: 1000, daysSinceLastMovement: 90, writeOffAmount: 0 }] },
  ]
});
check("zero/empty/null/single-SKU series never yields NaN or Infinity", !isPoison(infGuard));
check("zero SLOB month top-SKU share is null", infGuard.months[0] && infGuard.months[0].topSkuShare === null);
check("zero write-offs month writeOffTotal is 0", infGuard.months[0] && infGuard.months[0].writeOffTotal === 0);
check("empty SKU series month totals are null", infGuard.months[1] && infGuard.months[1].total === null && infGuard.months[1].writeOffTotal === null);
check("null SKU series month totals are null", infGuard.months[2] && infGuard.months[2].total === null);
check("single-SKU month in mixed series has null top-SKU share", infGuard.months[3] && infGuard.months[3].topSkuShare === null && infGuard.months[3].total === 1000);
check("MoM after zero SLOB is null", infGuard.months[1] && infGuard.months[1].mom === null);
check("write-off MoM after zero write-offs is null", infGuard.months[3] && infGuard.months[3].writeOffMom === null);

const sample = JSON.parse(fs.readFileSync("./data/slob.json", "utf8"));
const series = Slob.analyzeSeries(sample);
check("sample series has 15–18 months", series.months.length >= 15 && series.months.length <= 18);
check("sample data is labeled as sample", sample.meta && (sample.meta.sample === true || /sample/i.test(sample.meta.note || "")));
check("sample includes targets", sample.targets && sample.targets.monthlySlob != null && sample.targets.monthlyWriteOff != null && sample.targets.topSkuShare != null);
check("sample latest total SLOB is finite", Slob.isFiniteNumber(series.latest && series.latest.total));
check("sample latest write-off total is finite", Slob.isFiniteNumber(series.latest && series.latest.writeOffTotal));
check("sample latest top-SKU SLOB share is finite", Slob.isFiniteNumber(series.latest && series.latest.topSkuShare));
check("sample latest MoM is finite", Slob.isFiniteNumber(series.latest && series.latest.mom));
check("sample months have 8–15 SKUs", series.months.every((row) => row.skuCount >= 8 && row.skuCount <= 15));
check("sample SKUs include on-hand, days idle, and write-off", series.latest.mix.every((row) => Slob.isFiniteNumber(row.onHandValue) && Slob.isFiniteNumber(row.daysSinceLastMovement) && Slob.isFiniteNumber(row.writeOffAmount)));
check("sample top-SKU share is coherent (not 100%)", series.latest.topSkuShare > 0 && series.latest.topSkuShare < 1);
check("sample never yields NaN or Infinity", !isPoison(series));
NODE
)"

printf '%s\n' "$MATH_OUT"
while IFS= read -r line; do
  case "$line" in
    PASS:*) PASS=$((PASS + 1)) ;;
    FAIL:*) FAIL=$((FAIL + 1)) ;;
  esac
done <<< "$MATH_OUT"

# --- Static first-paint HTML ---
if [[ ! -f "$ROOT/index.html" ]]; then
  fail "index.html exists for first paint"
else
  pass "index.html exists for first paint"
fi

HTML="$(cat "$ROOT/index.html")"

if grep -q -E 'Loading…|Loading\.\.\.|Loading\.\.|id="loading"' "$ROOT/index.html"; then
  fail "static HTML has no Loading shell"
else
  pass "static HTML has no Loading shell"
fi

echo "$HTML" | grep -q "Total SLOB value" && pass "static HTML includes Total SLOB value" || fail "static HTML includes Total SLOB value"
echo "$HTML" | grep -q "Write-off total" && pass "static HTML includes Write-off total" || fail "static HTML includes Write-off total"
echo "$HTML" | grep -q "Top-SKU SLOB share" && pass "static HTML includes Top-SKU SLOB share" || fail "static HTML includes Top-SKU SLOB share"
echo "$HTML" | grep -q "MoM change" && pass "static HTML includes MoM change" || fail "static HTML includes MoM change"
echo "$HTML" | grep -q "Target comparisons" && pass "static HTML includes Target comparisons" || fail "static HTML includes Target comparisons"

ROW_COUNT="$(grep -c 'data-month="' "$ROOT/index.html" || true)"
if [[ "$ROW_COUNT" -ge 15 && "$ROW_COUNT" -le 18 ]]; then
  pass "static HTML has 15–18 month rows (${ROW_COUNT})"
else
  fail "static HTML has 15–18 month rows (found ${ROW_COUNT})"
fi

echo "$HTML" | grep -q 'data-month="2025-04"' && pass "static HTML includes first month 2025-04" || fail "static HTML includes first month 2025-04"
echo "$HTML" | grep -q 'data-month="2026-09"' && pass "static HTML includes last month 2026-09" || fail "static HTML includes last month 2026-09"

SKU_MARKS="$(grep -c 'data-sku="' "$ROOT/index.html" || true)"
if [[ "$SKU_MARKS" -ge 8 ]]; then
  pass "static HTML includes SKU content (${SKU_MARKS} data-sku marks)"
else
  fail "static HTML includes SKU content (found ${SKU_MARKS} data-sku marks)"
fi

echo "$HTML" | grep -q "SKU-4102" && pass "static HTML includes sample SKU-4102" || fail "static HTML includes sample SKU-4102"

LATEST_TOTAL="$(node -e 'const S=require("./js/slob.js");const d=require("./data/slob.json");const s=S.analyzeSeries(d);process.stdout.write(S.formatMoney(s.latest.total));')"
LATEST_WO="$(node -e 'const S=require("./js/slob.js");const d=require("./data/slob.json");const s=S.analyzeSeries(d);process.stdout.write(S.formatMoney(s.latest.writeOffTotal));')"
LATEST_SHARE="$(node -e 'const S=require("./js/slob.js");const d=require("./data/slob.json");const s=S.analyzeSeries(d);process.stdout.write(S.formatPercent(s.latest.topSkuShare,false,1));')"
echo "$HTML" | grep -F -q "$LATEST_TOTAL" && pass "baked Total SLOB value ${LATEST_TOTAL} is in HTML" || fail "baked Total SLOB value ${LATEST_TOTAL} is in HTML"
echo "$HTML" | grep -F -q "$LATEST_WO" && pass "baked Write-off total ${LATEST_WO} is in HTML" || fail "baked Write-off total ${LATEST_WO} is in HTML"
echo "$HTML" | grep -F -q "$LATEST_SHARE" && pass "baked Top-SKU SLOB share ${LATEST_SHARE} is in HTML" || fail "baked Top-SKU SLOB share ${LATEST_SHARE} is in HTML"

# curl -sL against a static server (no JS execution)
PORT=8769
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/slob-http.log 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" >/dev/null 2>&1 || true; }
trap cleanup EXIT
sleep 0.4

CURL_HTML="$(curl -sL "http://127.0.0.1:${PORT}/")"
if [[ -z "$CURL_HTML" ]]; then
  fail "curl -sL returns HTML"
else
  pass "curl -sL returns HTML"
fi

echo "$CURL_HTML" | grep -q "Total SLOB value" && echo "$CURL_HTML" | grep -q "Write-off total" && echo "$CURL_HTML" | grep -q "Top-SKU SLOB share" && echo "$CURL_HTML" | grep -q "MoM change" && echo "$CURL_HTML" | grep -q "Target comparisons" \
  && pass "curl -sL first paint includes Total SLOB value / Write-off total / Top-SKU SLOB share / MoM change / Target comparisons" \
  || fail "curl -sL first paint includes Total SLOB value / Write-off total / Top-SKU SLOB share / MoM change / Target comparisons"

CURL_ROWS="$(printf '%s\n' "$CURL_HTML" | grep -c 'data-month="' || true)"
if [[ "$CURL_ROWS" -ge 15 && "$CURL_ROWS" -le 18 ]]; then
  pass "curl -sL first paint includes ${CURL_ROWS} month rows"
else
  fail "curl -sL first paint includes 15–18 month rows (found ${CURL_ROWS})"
fi

echo "$CURL_HTML" | grep -q "SKU-4102" && pass "curl -sL first paint includes SKU content" || fail "curl -sL first paint includes SKU content"

if echo "$CURL_HTML" | grep -q -E 'Loading…|Loading\.\.\.|Loading\.\.|id="loading"'; then
  fail "curl -sL HTML has no Loading shell"
else
  pass "curl -sL HTML has no Loading shell"
fi

if [[ -f "$ROOT/.nojekyll" ]]; then
  pass ".nojekyll present for GitHub Pages"
else
  fail ".nojekyll present for GitHub Pages"
fi

echo "Summary: ${PASS} passed, ${FAIL} failed"
if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
exit 0
