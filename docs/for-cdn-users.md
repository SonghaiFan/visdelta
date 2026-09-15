# Browser ESM without a bundler

VisDelta can run directly from versioned ESM files. This template creates a
transition controlled by a slider.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/visdelta@0.2.0/dist/visdelta.css">
  </head>
  <body>
    <div id="chart"></div>
    <input id="progress" type="range" min="0" max="1" step="0.01" value="0">

    <script type="module">
      import { bar } from "https://cdn.jsdelivr.net/npm/visdelta@0.2.0/dist/bar.js";
      import { transition } from "https://cdn.jsdelivr.net/npm/visdelta@0.2.0/dist/transition-entry.js";

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

Pin exact versions for durable pages. The `0.2.0` URLs describe this release
candidate and become available only after publication.

VisDelta includes its D3 runtime and executes declared transforms itself. Use
`.where()`, `.sort()`, `.breakdown()`, and `.rollup()` directly; authors do not
import or pass another runtime.

The browser-global build exposes the same chart and transition API as
`window.VisDelta`.
