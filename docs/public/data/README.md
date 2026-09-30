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
