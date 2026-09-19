#!/usr/bin/env node
/**
 * Bake SLOB summary metrics, monthly rows, and SKU tables into index.html.
 * First paint does not require JavaScript.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Slob = require("../js/slob.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data", "slob.json");
const OUT_PATH = path.join(ROOT, "index.html");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attr(value) {
  return value == null || !Number.isFinite(Number(value)) ? "" : String(value);
}

function toneClass(value, invert) {
  if (!Slob.isFiniteNumber(value) || value === 0) return "";
  const upIsBad = invert !== false;
  if (value > 0) return upIsBad ? "up" : "down good";
  return upIsBad ? "down good" : "up";
}

function targetCopy(comparison, unit) {
  if (!comparison) return "No target comparison (missing actual or target).";
  const verb = comparison.overTarget ? "over" : "under";
  const cls = comparison.overTarget ? "warn" : "good";
  const relative = Slob.formatPercent(Math.abs(comparison.deltaPct), false, 1);
  if (unit === "money") {
    return (
      '<span class="' +
      cls +
      '">' +
      verb +
      " target by " +
      Slob.formatMoney(Math.abs(comparison.delta)) +
      " (" +
      relative +
      ")</span>"
    );
  }
  return (
    '<span class="' +
    cls +
    '">' +
    verb +
    " target by " +
    Slob.formatPercent(Math.abs(comparison.delta), false, 1) +
    " pts (" +
    relative +
    " relative)</span>"
  );
}

function pill(comparison) {
  if (!comparison) return '<span class="pill">—</span>';
  const cls = comparison.overTarget ? "over" : "under";
  const label = comparison.overTarget ? "Over" : "Under";
  return (
    '<span class="pill ' +
    cls +
    '">' +
    label +
    " " +
    Slob.formatPercent(Math.abs(comparison.deltaPct), false, 1) +
    "</span>"
  );
}

function mixRows(latest) {
  const rows = latest && Array.isArray(latest.mix) ? latest.mix : [];
  if (!rows.length) {
    return '<div class="mix-row"><div>No SKUs</div><div class="mix-bar"><span style="width:0%"></span></div><div>—</div><div class="sub">empty SKU series</div></div>';
  }
  return rows
    .map(function (row) {
      const share = row.share;
      const width = Slob.isFiniteNumber(share) ? Math.max(0, Math.min(100, share * 100)).toFixed(1) : "0";
      const days = Slob.formatDays(row.daysSinceLastMovement);
      const label = row.sku ? row.sku + (row.name && row.name !== row.sku ? " · " + row.name : "") : row.name || "—";
      return (
        '<div class="mix-row" data-sku="' +
        escapeHtml(row.sku || "") +
        '"><div>' +
        escapeHtml(label) +
        '</div><div class="mix-bar" title="' +
        escapeHtml(Slob.formatPercent(share, false, 1)) +
        '"><span style="width:' +
        width +
        '%"></span></div><div>' +
        Slob.formatPercent(share, false, 1) +
        '</div><div class="sub">' +
        escapeHtml(Slob.formatMoney(row.onHandValue) + " · " + days + " idle") +
        "</div></div>"
      );
    })
    .join("\n");
}

function sparkBars(months) {
  const totals = months.map(function (row) {
    return Slob.isFiniteNumber(row.total) ? row.total : 0;
  });
  const max = totals.reduce(function (acc, n) {
    return n > acc ? n : acc;
  }, 0);
  return months
    .map(function (row, index) {
      const height = max > 0 && Slob.isFiniteNumber(row.total) ? (row.total / max) * 100 : 0;
      const latest = index === months.length - 1 ? " is-latest" : "";
      return (
        '<div class="bar' +
        latest +
        '" style="height:' +
        height.toFixed(1) +
        '%" title="' +
        escapeHtml(Slob.monthLabel(row.month) + " " + Slob.formatMoney(row.total)) +
        '"></div>'
      );
    })
    .join("");
}

function monthRows(months) {
  return months
    .map(function (row) {
      const topId = row.topSku && row.topSku.sku ? row.topSku.sku : "";
      return (
        '<tr data-month="' +
        escapeHtml(row.month || "") +
        '" data-label="' +
        escapeHtml(Slob.monthLabel(row.month)) +
        '" data-total="' +
        escapeHtml(Slob.formatMoney(row.total)) +
        '">' +
        '<td data-key="month" data-value="' +
        escapeHtml(row.month || "") +
        '">' +
        escapeHtml(Slob.monthLabel(row.month)) +
        "</td>" +
        '<td data-key="skuCount" data-value="' +
        attr(row.skuCount) +
        '">' +
        (Slob.isFiniteNumber(row.skuCount) ? String(row.skuCount) : "—") +
        "</td>" +
        '<td data-key="total" data-value="' +
        attr(row.total) +
        '">' +
        Slob.formatMoney(row.total) +
        "</td>" +
        '<td data-key="writeOff" data-value="' +
        attr(row.writeOffTotal) +
        '">' +
        Slob.formatMoney(row.writeOffTotal) +
        "</td>" +
        '<td data-key="topSku" data-value="' +
        escapeHtml(topId) +
        '">' +
        escapeHtml(topId || "—") +
        "</td>" +
        '<td data-key="topSkuShare" data-value="' +
        attr(row.topSkuShare) +
        '">' +
        Slob.formatPercent(row.topSkuShare, false, 1) +
        "</td>" +
        '<td data-key="mom" data-value="' +
        attr(row.mom) +
        '">' +
        Slob.formatPercent(row.mom, true, 1) +
        "</td>" +
        '<td data-key="target">' +
        pill(row.vsSlobTarget) +
        "</td>" +
        "</tr>"
      );
    })
    .join("\n");
}

function skuRows(latest) {
  const rows = latest && Array.isArray(latest.mix) ? latest.mix : [];
  return rows
    .map(function (row) {
      return (
        '<tr data-sku="' +
        escapeHtml(row.sku || "") +
        '">' +
        '<td data-key="sku" data-value="' +
        escapeHtml(row.sku || "") +
        '">' +
        escapeHtml(row.sku || "—") +
        "</td>" +
        '<td data-key="name" data-value="' +
        escapeHtml(row.name || "") +
        '">' +
        escapeHtml(row.name || "—") +
        "</td>" +
        '<td data-key="onHand" data-value="' +
        attr(row.onHandValue) +
        '">' +
        Slob.formatMoney(row.onHandValue) +
        "</td>" +
        '<td data-key="days" data-value="' +
        attr(row.daysSinceLastMovement) +
        '">' +
        Slob.formatDays(row.daysSinceLastMovement) +
        "</td>" +
        '<td data-key="writeOff" data-value="' +
        attr(row.writeOffAmount) +
        '">' +
        Slob.formatMoney(row.writeOffAmount) +
        "</td>" +
        '<td data-key="share" data-value="' +
        attr(row.share) +
        '">' +
        Slob.formatPercent(row.share, false, 1) +
        "</td>" +
        "</tr>"
      );
    })
    .join("\n");
}

function render(data) {
  const series = Slob.analyzeSeries(data);
  const latest = series.latest;
  const coverage = data.meta && data.meta.coverage ? data.meta.coverage : "";
  const monthCount = series.months.length;
  const skuCount = latest ? latest.skuCount : 0;
  const latestLabel = latest ? Slob.monthLabel(latest.month) : "—";
  const totalText = latest ? Slob.formatMoney(latest.total) : "—";
  const writeOffText = latest ? Slob.formatMoney(latest.writeOffTotal) : "—";
  const shareText = latest ? Slob.formatPercent(latest.topSkuShare, false, 1) : "—";
  const momText = latest ? Slob.formatPercent(latest.mom, true, 1) : "—";
  const topName =
    latest && latest.topSku
      ? Slob.skuLabel(latest.topSku)
      : "no top SKU";
  const momHint =
    latest && series.previous
      ? "vs " + Slob.monthLabel(series.previous.month) + " (" + Slob.formatMoney(series.previous.total) + ")"
      : "MoM change needs a prior month with non-zero SLOB";
  const targetSlob = series.targets ? Slob.formatMoney(series.targets.monthlySlob) : "—";
  const targetWriteOff = series.targets ? Slob.formatMoney(series.targets.monthlyWriteOff) : "—";
  const targetShare = series.targets ? Slob.formatPercent(series.targets.topSkuShare, false, 1) : "—";
  const sparkCols = Math.max(monthCount, 1);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SLOB Write-Off Tracker</title>
  <meta name="description" content="SKU-level SLOB write-off trend tracker with total SLOB value, write-off total, top-SKU SLOB share, MoM change, and target comparisons. First paint is fully baked HTML.">
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div class="kicker">SKU-level inventory ledger</div>
      <h1>SLOB Write-Off Tracker</h1>
      <p>
        ${monthCount} months of sample slow-moving and obsolete inventory (${escapeHtml(coverage)}),
        ${skuCount} SKUs in the latest month. Summary metrics, the monthly table, and SKU rows
        below are baked into this HTML so a static <code>curl -sL</code> first paint shows
        Total SLOB value, Write-off total, Top-SKU SLOB share, MoM change, Target comparisons,
        and every month/SKU row with no JavaScript placeholder.
      </p>
    </header>

    <section class="metrics" aria-label="Summary metrics">
      <article class="card" id="metric-total-slob">
        <h2>Total SLOB value</h2>
        <p class="value">${totalText}</p>
        <p class="hint">${escapeHtml(latestLabel)}</p>
      </article>
      <article class="card" id="metric-write-off-total">
        <h2>Write-off total</h2>
        <p class="value">${writeOffText}</p>
        <p class="hint">${latest ? "Write-off rate " + Slob.formatPercent(latest.writeOffRate, false, 1) + " of SLOB" : "—"}</p>
      </article>
      <article class="card" id="metric-top-sku-share">
        <h2>Top-SKU SLOB share</h2>
        <p class="value">${shareText}</p>
        <p class="hint">${escapeHtml(topName)}</p>
      </article>
      <article class="card" id="metric-mom">
        <h2>MoM change</h2>
        <p class="value ${toneClass(latest && latest.mom)}">${momText}</p>
        <p class="hint">${escapeHtml(momHint)}</p>
      </article>
      <article class="card" id="metric-targets">
        <h2>Target comparisons</h2>
        <p class="sub">SLOB target ${targetSlob}: ${latest ? targetCopy(latest.vsSlobTarget, "money") : "—"}</p>
        <p class="sub">Write-off target ${targetWriteOff}: ${latest ? targetCopy(latest.vsWriteOffTarget, "money") : "—"}</p>
        <p class="sub">Top-SKU share target ${targetShare}: ${latest ? targetCopy(latest.vsTopSkuShareTarget, "share") : "—"}</p>
      </article>
    </section>

    <section class="mix" id="sku-mix" aria-label="SKU SLOB mix">
      <h2>SKU SLOB mix</h2>
      <p class="hint">On-hand SLOB share by SKU for ${escapeHtml(latestLabel)}.</p>
      <div class="mix-grid">
        ${mixRows(latest)}
      </div>
    </section>

    <section class="trend" aria-label="SLOB sparkline">
      <h2>Monthly SLOB</h2>
      <div class="spark" style="grid-template-columns: repeat(${sparkCols}, 1fr)">${sparkBars(series.months)}</div>
    </section>

    <section aria-label="Monthly table">
      <h2>Monthly table</h2>
      <p class="hint">Click a column header to sort after JavaScript loads. Rows and values are already in the markup.</p>
      <p id="selected-month"></p>
      <div class="table-wrap">
        <table id="monthly-table">
          <thead>
            <tr>
              <th data-sort="month" data-type="string">Month</th>
              <th data-sort="skuCount" data-type="number">SKUs</th>
              <th data-sort="total" data-type="number">Total SLOB value</th>
              <th data-sort="writeOff" data-type="number">Write-off total</th>
              <th data-sort="topSku" data-type="string">Top SKU</th>
              <th data-sort="topSkuShare" data-type="number">Top-SKU SLOB share</th>
              <th data-sort="mom" data-type="number">MoM</th>
              <th>vs SLOB target</th>
            </tr>
          </thead>
          <tbody>
${monthRows(series.months)}
          </tbody>
        </table>
      </div>
    </section>

    <section aria-label="SKU table">
      <h2>SKU table</h2>
      <p class="hint">On-hand value, days since last movement, and write-off amount for each SKU in ${escapeHtml(latestLabel)}.</p>
      <p id="selected-sku"></p>
      <div class="table-wrap">
        <table id="sku-table">
          <thead>
            <tr>
              <th data-sort="sku" data-type="string">SKU</th>
              <th data-sort="name" data-type="string">Name</th>
              <th data-sort="onHand" data-type="number">On-hand value</th>
              <th data-sort="days" data-type="number">Days since last movement</th>
              <th data-sort="writeOff" data-type="number">Write-off amount</th>
              <th data-sort="share" data-type="number">SLOB share</th>
            </tr>
          </thead>
          <tbody>
${skuRows(latest)}
          </tbody>
        </table>
      </div>
    </section>

    <footer>
      <p>Sample source data: <a href="data/slob.json"><code>data/slob.json</code></a>. Re-render with <code>node scripts/render-static.js</code>.</p>
    </footer>
  </div>
  <script src="js/slob.js" defer></script>
  <script src="js/app.js" defer></script>
</body>
</html>
`;
}

function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const html = render(data);
  fs.writeFileSync(OUT_PATH, html);
  const series = Slob.analyzeSeries(data);
  process.stdout.write(
    "Wrote " +
      path.relative(ROOT, OUT_PATH) +
      " with " +
      series.months.length +
      " month rows and " +
      (series.latest ? series.latest.skuCount : 0) +
      " SKUs; latest SLOB " +
      (series.latest ? Slob.formatMoney(series.latest.total) : "—") +
      "\n"
  );
}

main();
