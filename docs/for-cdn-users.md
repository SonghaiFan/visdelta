# Browser ESM without a bundler

VisDelta can run directly from versioned ESM files. This template creates a
transition controlled by a slider.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/visdelta@0.3.0/dist/visdelta.css">
  </head>
  <body>
    <div id="chart"></div>
    <input id="progress" type="range" min="0" max="1" step="0.01" value="0">

    <script type="module">
      import { bar } from "https://cdn.jsdelivr.net/npm/visdelta@0.3.0/dist/bar.js/+esm";
      import { transition } from "https://cdn.jsdelivr.net/npm/visdelta@0.3.0/dist/transition-entry.js/+esm";

      const rows = [
        { category: "A", revenue: 12, profit: 5 },
        { category: "B", revenue: 18, profit: 11 },
        { category: "C", revenue: 9, profit: 7 }
      ];

      const from = bar(rows).x("category").y("revenue").key("category");
      const to = from.y("profit");
      const change = await transition(from, to, { target: "#chart" });

      progress.addEventListener("input", event => {
        change.progress(event.currentTarget.valueAsNumber);
      });
    </script>
  </body>
</html>
```

The `/+esm` suffix matters: VisDelta's ESM files import the `d3-*` modules by
bare name, which a browser cannot resolve on its own. jsDelivr's `+esm` endpoint
rewrites those imports to CDN URLs. Pin exact versions for durable pages.

## Global script

For a page without modules, load the self-contained global bundle. The `d3-*`
modules VisDelta uses are compiled in; nothing else is needed.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/visdelta@0.3.0/dist/visdelta.css">
<script src="https://cdn.jsdelivr.net/npm/visdelta@0.3.0"></script>
<script>
  const { bar, transition } = VisDelta;
  // same authoring code as above
</script>
```

A complete slider-driven page using this route is in
[`examples/cdn-demo.html`](https://github.com/SonghaiFan/visdelta/blob/main/examples/cdn-demo.html).

VisDelta executes declared transforms itself. Use `.where()`, `.sort()`,
`.breakdown()`, and `.rollup()` directly; authors do not import or pass another
runtime.

The browser-global build exposes the same chart and transition API as
`window.VisDelta`.
