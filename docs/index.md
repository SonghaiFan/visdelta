---
layout: home

hero:
  name: VisDelta
  text: Make data changes feel obvious.
  tagline: Declare the before and after. VisDelta turns the difference into a reversible, scrubbable chart transition.
  actions:
    - theme: brand
      text: Try the live demo
      link: '#showcase'
    - theme: alt
      text: Get started
      link: /getting-started

features:
  - title: Declare endpoints
    details: Branch from an immutable chart state and describe exactly what changed.
  - title: Seek any frame
    details: Time, scroll, sliders, gestures, and tests can all drive the same progress value.
  - title: Keep the chart honest
    details: Marks, scales, axes, and labels move together through every frame.
---

<div class="home-content">

<section id="showcase" class="home-section home-section--demo">
  <p class="home-eyebrow">Live transition</p>
  <div class="home-section-heading">
    <div>
      <h2>Pull the timeline. The chart stays truthful.</h2>
      <p>VisDelta resolves the semantic difference between two states, then lets your application control every frame. Scrub, reverse, pause, or hand progress to scroll.</p>
    </div>
    <a class="home-inline-link" href="./examples">Explore editable examples <span aria-hidden="true">→</span></a>
  </div>
</section>

</div>

<div class="home-content">

<section class="home-section home-section--code">
  <div class="home-section-heading">
    <div>
      <p class="home-eyebrow">The small idea</p>
      <h2>Many states in. One controllable story out.</h2>
    </div>
    <p class="home-aside">No animation timeline to manually synchronize. Adjacent state differences are the source of truth.</p>
  </div>

```js
import * as d3 from "d3";
import { bar } from "visdelta/bar";
import { sequence } from "visdelta/transition";
import "visdelta/style.css";

const revenue = bar(rows)
  .x("category")
  .y("sales")
  .key("category");

const profit = revenue.y("profit");
const ranked = revenue.sort("sales", "descending");
const story = await sequence([revenue, profit, ranked, revenue], { target: "#chart", d3 });

story.progress(1.42);
story.play({ duration: 800 });
```

  <div class="home-flow" aria-label="VisDelta transition pipeline">
    <span>Chart state</span><i aria-hidden="true">→</i><span>Difference</span><i aria-hidden="true">→</i><span>Transition</span><i aria-hidden="true">→</i><span>Frame</span>
  </div>
</section>

<section class="home-section home-section--paths">
  <p class="home-eyebrow">Choose a path</p>
  <div class="home-path-grid">
    <a href="./getting-started"><strong>Build your first transition</strong><span>Install VisDelta and make a state change in a few minutes.</span><b>Getting started →</b></a>
    <a href="./examples"><strong>Experiment in the playground</strong><span>Edit real endpoint code, run it locally, and inspect the computed delta.</span><b>Open examples →</b></a>
    <a href="./reference"><strong>Read the runtime contract</strong><span>Understand lifecycle, progress control, sizing, data, and cleanup.</span><b>API reference →</b></a>
  </div>
</section>

</div>
