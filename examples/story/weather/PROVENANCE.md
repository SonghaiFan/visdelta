# Melbourne archive from case_David_2

This is a local archive from the user's predecessor case study, not a live feed.

- Original: `case_David_2/src/data/rich_mel_data.csv`
- Original SHA-256: `9c26a773b23d96d3398c2f44c547d6785beacc8dcf5794ecc6c1db21fa19a27a`
- 82,033 records; city `Melbourne` only; unique `(date, type)`.
- `tmax`: 41,016 records, 1910-01-01 through 2022-04-19.
- `tmin`: 41,017 records, 1910-01-01 through 2022-04-20.
- Original source labels: 80,354 `acorn`, 1,679 `raw`.
- No empty temperatures, no imputation, no downsampling.

Each tuple in `archive.json` follows its `columns` declaration:
`date, metric, temperature, percentile, source, day_of_year`.
The numeric values and ranks are preserved from the original CSV. Other original
derived columns are omitted because they are not used by this story.

The original preparation script, full upstream attribution and percentile reference
population have not been recovered. The story calls these archived observations
and archived percentile ranks; it does not claim an independently verified climate
baseline. These city-level records are not identified solely with the station ID
shown in the separate location list.


`prepare-data.mjs` selects the January 31–February 14 window and emits tidy
`data.json` for this website. The original full archive remains in the repository;
the website serves the prepared rows without the full archive download.
