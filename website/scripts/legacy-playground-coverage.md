# Playground story coverage for legacy scenarios

Each former VitePress `chart/scenario` is mapped to an exact story edit, or retained as a focused chart-specific Lab regression with its reason. The executable mapping is maintained in [legacy-playground-coverage.mjs](./legacy-playground-coverage.mjs) and completeness is checked by `npm run examples:check`.

| Legacy scenario | New story coverage |
| --- | --- |
| `area/add` | Regression only: Area observation entry and its reverse remain covered by Area Lab endpoint checks; the curated membership story uses Line. |
| `area/baseline` | Regression only: A numeric baseline is specific to the Area measure and remains protected by its existing Lab regression. |
| `area/color` | Regression only: A constant fill replacement has no analytical purpose in the service story; retain the Area appearance regression. |
| `area/curve` | Regression only: Area boundary interpolation has chart-specific geometry; keep the exact curve transition in the Area Lab regression. |
| `area/data` | **Did demand move between services?**, edit 2 |
| `area/filter` | **Did a sensor fault create the spike?**, edit 1 |
| `area/focus` | **Where did the recent shift happen?**, edit 2 |
| `area/highlight` | **Which months stand out within the full service trend?**, edit 1 |
| `area/highlight-range` | **Which months stand out within the full service trend?**, edit 1 |
| `area/labels` | **Can the service layers be read without a legend?**, edit 1 |
| `area/merge` | **Which services account for the demand increase?**, edit 1 |
| `area/remove` | Regression only: Area observation exit is the reverse endpoint of the same retained Area Lab membership regression. |
| `area/repeat` | Regression only: The repeat() sequence remains in the Area Lab regression suite; it has no distinct service-demand question. |
| `area/restore` | **Did a sensor fault create the spike?**, edit 2 |
| `area/split` | **Which services account for the demand increase?**, edit 1 |
| `area/stream` | **When do industry unemployment totals peak?**, edit 1 |
| `area/x` | **Where did the recent shift happen?**, edit 1 |
| `area/y` | **Did service composition change as demand grew?**, edit 3 |
| `line/add` | Regression only: The forward add and reverse remove are one observation-membership story; the line Lab retains exact endpoint assertions. |
| `line/color` | Regression only: Constant color changes have no analytical purpose in the service-demand questions; retain their style regression. |
| `line/data` | **Did demand move between services?**, edit 2 |
| `line/filter` | **Did a sensor fault create the spike?**, edit 1 |
| `line/focus` | **Where did the recent shift happen?**, edit 2 |
| `line/highlight` | **Which months stand out within the full service trend?**, edit 1 |
| `line/log` | **What is hidden in the crowded low-power range?**, edit 1 |
| `line/merge` | **Which services contribute to the changing request total?**, edit 1 |
| `line/remove` | Regression only: The reverse of line/add is covered by the same add/remove regression pair. |
| `line/repeat` | Regression only: The repeat() sequence remains in the Line Lab regression suite; it duplicates the story timeline mechanic. |
| `line/restore` | **Did a sensor fault create the spike?**, edit 2 |
| `line/shift` | **Did demand move between services?**, edit 2 |
| `line/split` | **Which services contribute to the changing request total?**, edit 1 |
| `line/style` | **Does a valve setting change between update events?**, edit 1 |
| `line/x` | **Does weekly averaging hide daily variation in AAPL?**, edit 1 |
| `line/xy` | Regression only: Simultaneous x/y measure remapping remains in the Line Lab regression; changing both measures has no purpose in the single-stock weekly averaging story. |
| `line/y` | **Does the highest revenue channel earn the most profit?**, edit 1 |
| `point/add` | Regression only: Point identity on enter remains covered by the Point Lab; the curated add/remove narrative uses a time series. |
| `point/breakdown` | **Does the average car represent either group?**, edit 1 |
| `point/color` | **Is engine power related to fuel economy?**, edit 2 |
| `point/data` | **Did demand move between services?**, edit 2 |
| `point/filter` | **Which states clear the planning threshold?**, edit 1 |
| `point/flip` | Regression only: The Point-specific paired-axis flip stays as a geometry regression; the readable-name orientation story uses Bar. |
| `point/focus` | **Is the four-cylinder pattern global or local?**, edit 1 |
| `point/highlight` | **Is the four-cylinder pattern global or local?**, edit 2 |
| `point/repeat` | Regression only: The repeat() sequence remains in the Point Lab regression suite; it adds no separate analysis question. |
| `point/rollup` | **Does the average car represent either group?**, edit 1 |
| `point/size` | **Does the average car represent either group?**, edit 1 |
| `point/x` | **Is engine power related to fuel economy?**, edit 1 |
| `point/xy` | **Is engine power related to fuel economy?**, edit 1 |
| `point/y` | **Is engine power related to fuel economy?**, edit 1 |
| `transition/appearance` | Regression only: A constant bar recolor has no analytical purpose in this population question; retain its appearance transition in the Lab. |
| `transition/color` | Regression only: Quantitative color binding has no decision question in this dataset; retain the Lab case for the encoding contract. |
| `transition/data` | Regression only: Adding source rows is the inverse half of the observation-add story; keep the expanded-state fixture as a chart-specific regression. |
| `transition/filter` | **Which states clear the planning threshold?**, edit 1 |
| `transition/flip` | **How can long car names stay readable?**, edit 2 |
| `transition/focus` | **Is the four-cylinder pattern global or local?**, edit 1 |
| `transition/grouped-merge` | **Which age groups make up each state total?**, edit 2 |
| `transition/grouped-split` | **Which age groups make up each state total?**, edit 1 |
| `transition/highlight` | **Which months stand out within the full service trend?**, edit 1 |
| `transition/layout` | **Which age groups make up each state total?**, edit 2 |
| `transition/measure` | Regression only: Cohort substitution is a data-membership check already covered by the shared filtering story; retain the eight-state age-cohort Lab regression. |
| `transition/merge` | **Which age groups make up each state total?**, edit 1 |
| `transition/reaggregate` | **Does the same total change by year or by place?**, edit 1 |
| `transition/repeat` | Regression only: The reusable repeat() sequence remains covered by its existing transition regression; it does not add a distinct data question. |
| `transition/sort` | **Which states have the largest under-ten populations?**, edit 2 |
| `transition/split` | **Which age groups make up each state total?**, edit 1 |
| `unit/add` | Regression only: Unit identity on enter remains asserted by the Unit Lab add/remove pair. |
| `unit/all` | Regression only: The initial 50-to-150 expansion is a fixture setup, not a separate analysis question; keep it as a Unit Lab membership regression. |
| `unit/bar` | **Do petal lengths separate the Iris flowers?**, edit 1 |
| `unit/beeswarm` | **Do petal lengths separate the Iris flowers?**, edit 2 |
| `unit/color` | **Do petal lengths separate the Iris flowers?**, edit 1 |
| `unit/columns` | Regression only: Grid column count is a container/layout control, not an analysis story; retain the Unit Lab sizing regression. |
| `unit/filter` | **Which states clear the planning threshold?**, edit 1 |
| `unit/focus` | **Is the four-cylinder pattern global or local?**, edit 1 |
| `unit/force` | Regression only: Force-layout dynamics are a distinct layout mode without a current decision question; keep the Unit Lab regression. |
| `unit/grid` | **Do petal lengths separate the Iris flowers?**, edit 2 |
| `unit/highlight` | **Is the four-cylinder pattern global or local?**, edit 2 |
| `unit/measure` | **Do petal lengths separate the Iris flowers?**, edit 2 |
| `unit/radius` | Regression only: Constant unit radius has no data question; retain its Unit appearance regression. |
| `unit/remove` | Regression only: The reverse of Unit add remains asserted by the Unit Lab pair. |
| `unit/repeat` | Regression only: The repeat() sequence remains in the Unit Lab regression suite; it does not add an independent observation question. |
| `unit/unit-value` | **How many observations does each circle represent?**, edit 1 |
