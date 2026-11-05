# Story examples

These are ordinary websites using VisDelta, not a narrative language or editor.

- `network/index.html`: one self-contained fictional network story. Serve the directory with any static server. Its only dependencies are pinned public VisDelta JS/CSS.
- `weather/`: the archived Melbourne case as a plain website. Chart declarations are in `chart.mjs`; `main.mjs` owns scroll, controls, resize and cleanup. Tidy data is prepared offline by `prepare-data.mjs`; the original archive and provenance remain beside the example.

From the repository, run `npm run studio:build` and `npm start`. Open `/story/` to preview either page, or open the complete example directly. To use the weather example elsewhere, bundle `main.mjs` with an installed `visdelta` package, copy the stylesheet and serve it beside `index.html` and `data.json`.

Use stable record keys, construct controllers outside scroll handlers, send progress through requestAnimationFrame, resize the existing controller and destroy it when leaving. Cache requested endpoints and legs when the page needs repeated seeking. A page does not need MDX, a parser or a second chart model.
