# Demo CSV data

`stock.csv` and `unemployment.csv` remain the original repository inputs.
`line-lab.csv` and `area-lab.csv` are deterministic teaching-size subsets,
generated with `node scripts/prepare-lab-data.mjs` from the repository root.
Run the same command with `--check` to verify checked-in outputs.

`line-lab.csv` has 40 rows. One row is one trading day for one ticker: the last
20 AAPL observations and the matching 20 GOOG observations. `week` is the UTC
Monday for that row and supports the grain examples without a second dataset.

`area-lab.csv` has 54 rows. One row is one month for one industry: eighteen
months each for Manufacturing, Leisure and hospitality, and Construction. The
original `share` values are retained.

Every tab in a Lab loads the same tidy CSV. Scenario differences are expressed
with VisDelta declarations such as `.where()` and `.rollup()` rather than with
scenario-specific files or JavaScript preparation pipelines.

# Public example data

The existing `iris.csv`, `mtcars.csv`, population, unemployment, and stock
files retain their upstream provenance described alongside their source
examples.

## Playground-only teaching data

- `service-demand-monthly.csv` is simulated. Each row is one service's request
  total for one month, January through June 2025. `requests` is a count;
  `share` is `requests / sum(requests for that month)`. Monthly totals are
  250, 260, 279, 301, 318, and 332. The share denominator is therefore explicit
  and changes by month.
- `sensor-readings.csv` is simulated. Each row is one daily reading from one
  sensor, in arbitrary instrument units, from 1–10 January 2025. The value 94
  is retained in the source but marked `valid=false`; it is not silently
  converted to zero or removed. The other readings are valid observations.
- `channel-finance.csv` is simulated. Each row is one channel for one quarter
  in 2025 Q1. `units` counts sales, `revenue` and `cost` are US dollars, and
  `profit = revenue - cost`. The channel with the largest revenue is not the
  channel with the largest profit in this sample.
- `valve-updates.csv` is simulated event data. Each row records a setting change
  in arbitrary units; the setting persists until the next timestamp. This
  makes a step curve a truthful representation of the measurement process.

These small tables are constructed to make the shown comparisons inspectable;
they do not describe a real service or sensor system.
