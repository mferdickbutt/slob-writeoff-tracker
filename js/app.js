/**
 * Progressive enhancement only. First paint is already complete in index.html.
 * Adds table sorting and a live selected-row readout without replacing baked metrics.
 */
(function () {
  "use strict";

  function initSortableTable(tableId) {
    var table = document.getElementById(tableId);
    if (!table) return;
    var tbody = table.tBodies[0];
    var headers = table.querySelectorAll("thead th[data-sort]");
    if (!tbody || !headers.length) return;

    var current = { key: headers[0].getAttribute("data-sort") || "month", dir: "asc" };

    function cellValue(row, key, type) {
      var cell = row.querySelector('[data-key="' + key + '"]');
      if (!cell) return null;
      if (type === "number") {
        var raw = cell.getAttribute("data-value");
        if (raw == null || raw === "") return null;
        var n = Number(raw);
        return Number.isFinite(n) ? n : null;
      }
      return cell.getAttribute("data-value") || cell.textContent || "";
    }

    function compare(a, b, key, type, dir) {
      var av = cellValue(a, key, type);
      var bv = cellValue(b, key, type);
      var mul = dir === "desc" ? -1 : 1;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (type === "number") return (av - bv) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    }

    headers.forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        var type = th.getAttribute("data-type") || "string";
        if (current.key === key) {
          current.dir = current.dir === "asc" ? "desc" : "asc";
        } else {
          current.key = key;
          current.dir = key === "month" || key === "sku" || key === "name" ? "asc" : "desc";
        }
        headers.forEach(function (h) {
          h.removeAttribute("aria-sort");
        });
        th.setAttribute("aria-sort", current.dir === "asc" ? "ascending" : "descending");
        var rows = Array.prototype.slice.call(tbody.rows);
        rows.sort(function (a, b) {
          return compare(a, b, key, type, current.dir);
        });
        rows.forEach(function (row) {
          tbody.appendChild(row);
        });
      });
    });
  }

  function initRowHighlight(tableId, noteId, builder) {
    var table = document.getElementById(tableId);
    var note = document.getElementById(noteId);
    if (!table || !note) return;
    table.addEventListener("click", function (event) {
      var row = event.target.closest("tbody tr");
      if (!row) return;
      Array.prototype.forEach.call(table.querySelectorAll("tbody tr"), function (tr) {
        tr.classList.remove("is-selected");
      });
      row.classList.add("is-selected");
      note.textContent = builder(row);
    });
  }

  function init() {
    initSortableTable("monthly-table");
    initSortableTable("sku-table");
    initRowHighlight("monthly-table", "selected-month", function (row) {
      var label = row.getAttribute("data-label") || "";
      var total = row.getAttribute("data-total") || "";
      return label ? "Selected: " + label + (total ? " · " + total : "") : "";
    });
    initRowHighlight("sku-table", "selected-sku", function (row) {
      var sku = row.getAttribute("data-sku") || "";
      return sku ? "Selected SKU: " + sku : "";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
