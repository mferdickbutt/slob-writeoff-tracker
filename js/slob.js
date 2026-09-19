/**
 * Pure SKU-level SLOB / write-off analytics. Safe on zero write-offs, zero SLOB,
 * empty SKU series, null inputs, and single-SKU months: never returns NaN or
 * Infinity (null instead).
 *
 * Works in Node (CommonJS) and the browser (global `Slob`).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.Slob = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function asNumber(value) {
    if (value == null || value === "") return null;
    if (typeof value === "boolean") return null;
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
      var trimmed = value.trim();
      if (!trimmed) return null;
      var parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function finiteOrNull(value) {
    return isFiniteNumber(value) ? value : null;
  }

  function skuId(row) {
    if (row == null || typeof row !== "object") return null;
    if (typeof row.sku === "string" && row.sku.trim()) return row.sku.trim();
    if (typeof row.id === "string" && row.id.trim()) return row.id.trim();
    if (typeof row.code === "string" && row.code.trim()) return row.code.trim();
    return null;
  }

  function skuName(row) {
    if (row == null || typeof row !== "object") return null;
    if (typeof row.name === "string" && row.name.trim()) return row.name.trim();
    return skuId(row);
  }

  function asSkuList(skus) {
    if (skus == null || !Array.isArray(skus)) return null;
    return skus;
  }

  /**
   * Sum of SKU on-hand (SLOB) values.
   * Missing/null on-hand values are skipped. All-missing or empty series → null.
   * Explicit zeros sum to 0 (zero SLOB is a valid total).
   */
  function totalSlob(skus) {
    var list = asSkuList(skus);
    if (list == null || list.length === 0) return null;
    var sum = 0;
    var seen = false;
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (row == null || typeof row !== "object") continue;
      if (!Object.prototype.hasOwnProperty.call(row, "onHandValue")) continue;
      if (row.onHandValue == null || row.onHandValue === "") continue;
      var n = asNumber(row.onHandValue);
      if (n == null) return null;
      sum += n;
      seen = true;
    }
    return seen ? finiteOrNull(sum) : null;
  }

  /**
   * Sum of SKU write-off amounts.
   * Empty SKU series / all-missing → null. Explicit zeros sum to 0.
   */
  function writeOffTotal(skus) {
    var list = asSkuList(skus);
    if (list == null || list.length === 0) return null;
    var sum = 0;
    var seen = false;
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (row == null || typeof row !== "object") continue;
      if (!Object.prototype.hasOwnProperty.call(row, "writeOffAmount")) continue;
      if (row.writeOffAmount == null || row.writeOffAmount === "") continue;
      var n = asNumber(row.writeOffAmount);
      if (n == null) return null;
      sum += n;
      seen = true;
    }
    return seen ? finiteOrNull(sum) : null;
  }

  /**
   * Write-offs as a share of SLOB. Null when SLOB is null or 0 (zero SLOB).
   * Zero write-offs against positive SLOB → 0.
   */
  function writeOffRate(writeOffs, slob) {
    var w = asNumber(writeOffs);
    var s = asNumber(slob);
    if (w == null || s == null || s === 0) return null;
    return finiteOrNull(w / s);
  }

  /**
   * Largest SKU on-hand / total SLOB.
   * Null when total is null or 0, the series is empty, or the month has a
   * single SKU (share is not a meaningful concentration statistic).
   */
  function topSkuShare(skus, total) {
    var list = asSkuList(skus);
    if (list == null || list.length < 2) return null;
    var t = arguments.length > 1 ? asNumber(total) : totalSlob(list);
    if (t == null || t === 0) return null;
    var top = topSku(list);
    if (!top || !isFiniteNumber(top.onHandValue)) return null;
    return finiteOrNull(top.onHandValue / t);
  }

  function topSku(skus) {
    var list = asSkuList(skus);
    if (list == null || list.length === 0) return null;
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (row == null || typeof row !== "object") continue;
      var n = asNumber(row.onHandValue);
      if (n == null) continue;
      if (!best || n > best.onHandValue) {
        best = {
          sku: skuId(row),
          name: skuName(row),
          onHandValue: n,
          daysSinceLastMovement: asNumber(row.daysSinceLastMovement),
          writeOffAmount: asNumber(row.writeOffAmount),
        };
      }
    }
    return best;
  }

  /**
   * Per-SKU share of total SLOB (0–1). Empty, single-SKU, or zero SLOB → [].
   */
  function skuMix(skus, total) {
    var list = asSkuList(skus);
    if (list == null || list.length === 0) return [];
    var t = arguments.length > 1 ? asNumber(total) : totalSlob(list);
    var mix = [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (row == null || typeof row !== "object") continue;
      var n = asNumber(row.onHandValue);
      var share = null;
      if (list.length >= 2 && t != null && t !== 0 && n != null) {
        share = finiteOrNull(n / t);
      }
      mix.push({
        sku: skuId(row),
        name: skuName(row),
        onHandValue: n,
        daysSinceLastMovement: asNumber(row.daysSinceLastMovement),
        writeOffAmount: asNumber(row.writeOffAmount),
        share: share,
      });
    }
    mix.sort(function (a, b) {
      var av = isFiniteNumber(a.onHandValue) ? a.onHandValue : -Infinity;
      var bv = isFiniteNumber(b.onHandValue) ? b.onHandValue : -Infinity;
      return bv - av;
    });
    return mix;
  }

  /**
   * Month-over-month change as a ratio: (current - previous) / previous.
   * Null when either side is null or previous is 0 (zero SLOB / zero write-offs).
   */
  function monthOverMonth(current, previous) {
    var cur = asNumber(current);
    var prev = asNumber(previous);
    if (cur == null || prev == null || prev === 0) return null;
    return finiteOrNull((cur - prev) / prev);
  }

  /**
   * Actual vs target: delta and delta as a share of target.
   * Null when actual/target is null or target is 0.
   */
  function compareToTarget(actual, target) {
    var a = asNumber(actual);
    var g = asNumber(target);
    if (a == null || g == null || g === 0) return null;
    var delta = a - g;
    var deltaPct = delta / g;
    if (!Number.isFinite(delta) || !Number.isFinite(deltaPct)) return null;
    return {
      actual: a,
      target: g,
      delta: delta,
      deltaPct: deltaPct,
      overTarget: a > g,
    };
  }

  function analyzeMonth(row, previous, targets) {
    if (row == null || typeof row !== "object") return null;
    var skus = Array.isArray(row.skus) ? row.skus : [];
    var total = totalSlob(skus.length ? skus : null);
    var writeOffs = writeOffTotal(skus.length ? skus : null);
    var share = topSkuShare(skus, total);
    var lead = topSku(skus);
    var mix = skuMix(skus, total);
    var prevTotal = previous && typeof previous === "object" ? previous.total : previous;
    var prevWriteOff =
      previous && typeof previous === "object" && Object.prototype.hasOwnProperty.call(previous, "writeOffTotal")
        ? previous.writeOffTotal
        : null;
    var mom = monthOverMonth(total, prevTotal);
    var writeOffMom = monthOverMonth(writeOffs, prevWriteOff);
    var rate = writeOffRate(writeOffs, total);
    var vsSlobTarget = null;
    var vsWriteOffTarget = null;
    var vsTopSkuShareTarget = null;
    if (targets && typeof targets === "object") {
      if (targets.monthlySlob != null) {
        vsSlobTarget = compareToTarget(total, targets.monthlySlob);
      }
      if (targets.monthlyWriteOff != null) {
        vsWriteOffTarget = compareToTarget(writeOffs, targets.monthlyWriteOff);
      }
      if (targets.topSkuShare != null) {
        vsTopSkuShareTarget = compareToTarget(share, targets.topSkuShare);
      }
    }
    return {
      month: typeof row.month === "string" ? row.month : null,
      skus: skus,
      skuCount: mix.length,
      total: total,
      totalSlob: total,
      writeOffTotal: writeOffs,
      topSkuShare: share,
      topSku: lead,
      mix: mix,
      writeOffRate: rate,
      mom: mom,
      writeOffMom: writeOffMom,
      vsSlobTarget: vsSlobTarget,
      vsWriteOffTarget: vsWriteOffTarget,
      vsTopSkuShareTarget: vsTopSkuShareTarget,
    };
  }

  /**
   * Analyze a full data document `{ meta, targets, months }`.
   * Empty/null series → `{ months: [], latest: null, mom: null }`.
   */
  function analyzeSeries(data) {
    var empty = {
      months: [],
      latest: null,
      previous: null,
      mom: null,
      targets: null,
      currency: "USD",
      meta: null,
    };
    if (data == null || typeof data !== "object") return empty;
    var targets = data.targets && typeof data.targets === "object" ? data.targets : null;
    var rows = Array.isArray(data.months) ? data.months.filter(Boolean) : [];
    var sorted = rows.slice().sort(function (a, b) {
      return String((a && a.month) || "").localeCompare(String((b && b.month) || ""));
    });
    var months = [];
    var prev = null;
    for (var i = 0; i < sorted.length; i++) {
      var analyzed = analyzeMonth(sorted[i], prev, targets);
      if (analyzed) {
        months.push(analyzed);
        prev = analyzed;
      }
    }
    var latest = months.length ? months[months.length - 1] : null;
    var previous = months.length > 1 ? months[months.length - 2] : null;
    return {
      months: months,
      latest: latest,
      previous: previous,
      mom: latest ? latest.mom : null,
      targets: targets,
      currency: (data.meta && data.meta.currency) || "USD",
      meta: data.meta || null,
    };
  }

  function monthLabel(iso) {
    if (iso == null || typeof iso !== "string") return "—";
    var parts = iso.split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    if (!year || month < 1 || month > 12) return iso;
    return MONTH_NAMES[month - 1] + " " + year;
  }

  function formatMoney(value) {
    if (!isFiniteNumber(value)) return "—";
    var abs = Math.abs(value);
    var formatted = abs.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
    return value < 0 ? "-" + formatted : formatted;
  }

  function formatPercent(ratio, signed, digits) {
    if (!isFiniteNumber(ratio)) return "—";
    var places = isFiniteNumber(digits) ? digits : 1;
    var pct = ratio * 100;
    var body = pct.toFixed(places) + "%";
    if (signed && pct > 0) return "+" + body;
    return body;
  }

  function formatDays(value) {
    if (!isFiniteNumber(value)) return "—";
    return Math.round(value) + "d";
  }

  function skuLabel(rowOrId) {
    if (rowOrId == null) return "—";
    if (typeof rowOrId === "string") return rowOrId;
    var id = skuId(rowOrId);
    var name = skuName(rowOrId);
    if (id && name && name !== id) return id + " · " + name;
    return id || name || "—";
  }

  return {
    isFiniteNumber: isFiniteNumber,
    asNumber: asNumber,
    totalSlob: totalSlob,
    writeOffTotal: writeOffTotal,
    writeOffRate: writeOffRate,
    topSkuShare: topSkuShare,
    topSku: topSku,
    skuMix: skuMix,
    monthOverMonth: monthOverMonth,
    compareToTarget: compareToTarget,
    analyzeMonth: analyzeMonth,
    analyzeSeries: analyzeSeries,
    monthLabel: monthLabel,
    formatMoney: formatMoney,
    formatPercent: formatPercent,
    formatDays: formatDays,
    skuLabel: skuLabel,
    skuId: skuId,
    skuName: skuName,
  };
});
