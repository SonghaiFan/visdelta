# Bar transition lab

These fourteen scenarios are the executable transition matrix for VisDelta's
current bar implementation. Edit either endpoint, run the code, scrub any
frame, reverse playback, and inspect the computed semantic delta.

The lab uses a bundled [tidy US population by state and age CSV](/data/us-population-state-age-tidy.csv)
instead of toy A/B/C rows. Its 468 observations have only three fields:
`state`, `age`, and `population`. The supplied wide source was reshaped before
it entered VisDelta; data cleaning is not part of the visualization runtime.
Segmented examples use `.breakdown("age")`, then explicitly encode
`.color("age", ...)` with an ordered domain and palette.

The ranked and stacked overviews keep all 52 regions. Examples that need wider
marks name a fixed six- or eight-state subset in the editable code, keeping the
filter visible and every animation frame readable. The data-replacement example
adds unchanged rows from the same CSV; it does not invent replacement values.

<SyntaxPlayground mode="bar-lab" initial="measure" />

The lab is intentionally limited to transitions between bar-chart states. A successful
render demonstrates this pair, not an undocumented guarantee for every possible
combination of transforms and encodings.

Open [Split → move → merge](#reaggregate) to inspect a many-to-many lineage
transition directly. Two year totals split into four source-record
contributions, move across the common `year × location` refinement, and merge
into two location totals. The same slider drives the exact path in reverse.
