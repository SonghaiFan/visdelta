# Line transition lab

These sixteen scenarios are the executable transition matrix for VisDelta's
line chart. They cover temporal granularity, y mappings, filtering, data
changes, highlighting, focus, color, line style, axis order, sliding time
windows, and reversible single-line/series changes.

Every scenario uses the same tidy stock dataset. Each row is one trading day
for one company, with explicit `date`, `ticker`, `open`, `high`, `low`, `close`,
and `volume` fields. The lab selects short AAPL and GOOG windows so individual
observations and intermediate frames remain readable. The source files were
reshaped before being added to the demo; VisDelta receives tidy rows and does
not clean or reshape them at runtime.

The first example keeps `date` on x and changes the temporal grain from daily
observations to weekly OHLC summaries. Each weekly row uses the first open, the
highest high, the lowest low, the final close, and summed volume; its x position
is the week's final trading date. The combined example changes daily close to
weekly high without turning the time-series line into a price-versus-price
trajectory.

Edit either state, run the code, scrub any frame, or play it in both directions.
Observations are matched by `.key()`. A Line chart is path-first: ordinary
endpoints do not show point marks. Adding and restoring observations use one
shared transition: the axis, existing line, and new segment reach the new
geometry together. Removing and filtering evaluate those exact frames backward.

Split and merge also use one shared transition evaluated in opposite
directions. Here the single line is the equal-weight mean of the AAPL and GOOG
closing prices, not a meaningless sum of stock prices. Merge first draws a
thinnest grid-colored dashed reference line at that mean. It grows along
the target path like a normal Line enter, so readers can compare the completed
target shape with both original lines before either moves. The two solid series then accelerate
onto the reference in x order like a zipper and resolve crisply to the single
mean line. Split shows those exact frames backward. No point marks or dashed
styles are changed; the dashed treatment belongs only to the temporary guide.

The line-style example also tests path matching. Changing from `curveLinear` to
`curveStep` changes the structure of the SVG path; the preview matches points on
the two visible paths before moving them, so intermediate frames stay continuous
instead of pairing unrelated numbers from the two `d` strings.

The time-window example combines the same Add and Remove behavior. VisDelta
matches observations by `.key()`: the leaving segment retracts, shared
observations move with the axis, and the entering segment reaches its new
position. The same keyed observation matcher handles both changes; there is no
separate time-window transition.

Filter and focus are deliberately separate. Filter removes observations; when
it removes observations from the middle, the default `connect("adjacent")`
keeps a gap. Focus keeps all observations and the full line, fits one 2D camera,
and clips what falls outside it. Line and Area share the same connected-stretch
rule: a stretch needs at least two observations. An isolated Line observation
keeps its point mark but does not create a line path.

<SyntaxPlayground mode="line-lab" initial="x" />

Every example imports the focused Line module and the generic transition entry.
It does not load the complete chart collection.
