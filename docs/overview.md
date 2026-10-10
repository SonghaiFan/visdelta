# Documentation

VisDelta treats a chart change as data. You declare two immutable chart states;
the library reports what changed between them and renders one seekable
transition that can play, reverse, pause, or follow any progress input.

The documentation has two tracks. **Philosophy** explains the model the library
reasons with. **Syntax** documents the builders, options and runtime you write
against. Both describe only behavior that exists in the current checkout.

<div class="docs-tracks">
  <section class="docs-track">
    <span class="ui-label">Philosophy</span>
    <h2>The model</h2>
    <p>Identity, state difference, transition plan, and frame stay separate layers. Seven closed categories name every difference.</p>
    <ul>
      <li><a href="./language-framework.html">Ontology and contracts <span>constitution</span></a></li>
      <li><a href="./language-framework.html#the-seven-state-change-categories">Seven state-change categories <span>vocabulary</span></a></li>
      <li><a href="./chart-types.html#shared-grammar">Shared grammar across charts <span>boundaries</span></a></li>
    </ul>
  </section>
  <section class="docs-track">
    <span class="ui-label">Syntax</span>
    <h2>The language</h2>
    <p>Chainable, immutable builders for Bar, Line, Area, Point and Unit, plus <code>delta()</code>, <code>transition()</code> and <code>sequence()</code>.</p>
    <ul>
      <li><a href="./getting-started.html">Getting started <span>first transition</span></a></li>
      <li><a href="./data-sources-and-transforms.html">Data and transforms <span>rows, urls, where</span></a></li>
      <li><a href="./chart-types.html">Chart types <span>five modules</span></a></li>
      <li><a href="./reference.html">API reference <span>every method</span></a></li>
      <li><a href="./runtime-api.html">Transition runtime <span>controller</span></a></li>
    </ul>
  </section>
</div>

## Where to go next

- Edit two states and watch the difference in the [Playground](/playground).
  Examples there are organized by the seven state-change categories.
- Browse every visual idiom VisDelta can express, each reached by a real
  transition, in the [Gallery](/gallery).
- Extend VisDelta with your own chart module in
  [Add a chart type](/extending-with-plugins).

The category reported for a change describes the state difference, not
playback order. Identity and lineage provide evidence for correspondence; each
chart module still owns its visible route and intermediate states.
