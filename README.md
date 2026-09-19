# SLOB Write-Off Tracker

Public SKU-level slow-moving and obsolete inventory (SLOB) ledger: total SLOB value, write-off total, top-SKU SLOB share, month-over-month change, and target comparisons. **First paint is fully baked HTML** — a static `curl -sL` of `index.html` already contains every required metric, all month rows, and SKU content. No JavaScript, and no `Loading…` shell.

## Data

[`data/slob.json`](data/slob.json) is **sample data** (see `meta.sample` / `meta.note`): 18 months (April 2025–September 2026) of SKU-level SLOB with on-hand value, days since last movement, write-off amount, and comparison targets. Twelve SKUs keep the top-SKU share statistic coherent (not a trivial 100% book).

## Formulas

All math lives in [`js/slob.js`](js/slob.js). Invalid, missing, or undefined results are **`null`**, never `NaN` or `Infinity`.

**Total SLOB value** for month \(t\):

\[
T_t = \sum_i v_{t,i}
\]

Null or missing on-hand values are skipped. If the SKU series is empty or every on-hand value is missing, \(T_t\) is `null`. Explicit zeros are a valid total of `0`.

**Write-off total**:

\[
W_t = \sum_i w_{t,i}
\]

Same missing-value rules as total SLOB. Explicit zeros are a valid write-off total of `0`.

**Top-SKU SLOB share**:

\[
s_t = \frac{\max_i v_{t,i}}{T_t}
\]

`null` when \(T_t\) is null or `0` (zero SLOB), the SKU series is empty, or the month has a single SKU (share is not a meaningful concentration statistic).

**MoM change** (on total SLOB):

\[
\Delta_t = \frac{T_t - T_{t-1}}{T_{t-1}}
\]

`null` when \(T_t\) is null, \(T_{t-1}\) is null, or \(T_{t-1} = 0\) (zero SLOB). Write-off MoM uses the same rule and is `null` when the prior write-off total is `0` (zero write-offs).

**Target comparisons** for an actual \(A\) and goal \(G\):

\[
d = A - G, \qquad d\% = \frac{A - G}{G}
\]

`null` when \(A\) or \(G\) is null, or \(G = 0\). The UI treats SLOB value, write-offs, and top-SKU share as “lower is better”: over target is a warning.

## How to re-render

```bash
node scripts/render-static.js
```

That reads `data/slob.json`, runs `js/slob.js`, and overwrites `index.html` with baked summary cards, SKU mix, spark bars, the monthly table, and the SKU table. Progressive enhancement in `js/app.js` (sortable columns, row select) is optional and must not replace first paint.

```bash
bash scripts/test.sh
```

Expect `Summary: N passed, 0 failed` and exit code 0. Checks cover zero write-offs, empty SKU series, null inputs, single-SKU months, zero SLOB, and static HTML first paint (including `curl -sL`).

## Suggested next improvements

- Replace the sample series with a live export (inventory aging or write-off register) and keep the same JSON shape.
- Add trailing-twelve-month write-offs and a days-idle band, still baked at render time.
- Split targets by category (MRO vs spares) so lumpy obsolescence reviews are compared fairly.
- Publish to GitHub Pages as-is (`.nojekyll` is already in the repo).
