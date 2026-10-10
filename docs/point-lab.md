# Point transition behavior

Try these scenarios in the unified [Playground](/playground#point/x).

These thirteen scenarios are the executable transition matrix for VisDelta's
point chart. They cover position, membership, emphasis, color, size, data,
axis, focus, and summary/detail changes.

The lab uses the bundled [tidy `mtcars` dataset](/data/mtcars.csv): one row per
car and one column per measured variable. The default view plots vehicle weight
against fuel economy. Cylinder count drives the explicit categorical examples,
and horsepower drives the explicit size example. Every added, removed, or
replaced observation comes from the same CSV; the examples do not fabricate
values or perform data cleaning inside VisDelta.

Edit either chart state, run the code, scrub any frame, reverse playback, and
inspect the computed difference. The same point is matched by `.key()` instead
of its array position.

The summary/detail examples also include an experimental **Clean / Blend**
control. Blend adds a temporary liquid-like connection while points gather or
spread. It is a deterministic Point Lab rendering experiment, not public
grammar, and it never changes the real point positions or the computed delta.
Dots stay fully opaque: the renderer hands visibility from the clean dots to
the blended shape during movement, then hands it back at the endpoint.
Each child contributes an equal share of its summary circle's final radius, so
the summary grows and shrinks with the number of children currently connected.
Combining starts slowly and accelerates as the points converge; revealing detail
uses the same motion in reverse.

The lab tests transitions between point-chart states only. Every example uses
the real package from this checkout; it is not a separate demo renderer.
