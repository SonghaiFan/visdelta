# VisDelta agent guide

VisDelta declares immutable chart states and renders seekable, reversible
transitions between them. Preserve that idea before adding features or UI.

## Source of truth

- `docs/language-framework.md` is the semantic constitution.
- `src/types/index.ts` defines the public state-change vocabulary.
- `src/grammar/state-changes.ts` implements its classification.
- Tests must demonstrate every public claim. A build alone does not prove
  transition behavior or browser appearance.
- Document only behavior that exists in the current checkout. Mark uncertain
  behavior as unsupported; do not turn roadmap ideas into present-tense claims.

## Keep the four layers separate

1. **Identity and correspondence** answer what continues. `.datumKey()`
   identifies source records; `.key()` identifies marks at the current grain.
   Lineage is evidence, not an animation command.
2. **State difference** answers what changed and in which direction.
3. **Transition plan** chooses route, phase order, and complete intermediate
   states. Category order never determines playback order.
4. **Frame and control** evaluate the route at a progress value and control it
   through time, scroll, sliders, or other input.

Builder history is not an animation script. Directional actions such as
`split`, `remap`, and `restyle` are emitted semantic facts, not fluent methods.

## State-change ontology

The seven non-exclusive categories are a closed vocabulary:

- **Data** — source-record membership or values: `add`, `remove`, `update`.
- **Grain** — which records form one mark and how its measure is calculated:
  `split`, `merge`, `reaggregate`, `change-reducer`.
- **Encoding** — data-field bindings to visual channels: `bind`, `unbind`,
  `remap`.
- **Coordinate** — positional scales, domains, and orientation: `rescale`,
  `reorient`.
- **Layout** — arrangement, order, or connection of the same objects:
  `reorder`, `rearrange`, `reconnect`.
- **Attention** — emphasis or camera framing: `enter`, `exit`, `shift`, with
  target `focus` or `highlight`.
- **Appearance** — fixed visual style or form: `restyle`, `reshape`.

Important boundaries:

- Identity is foundational evidence, not an eighth change category.
- Grain includes both grouping and measure semantics. `sum -> mean` is
  `change-reducer`, not an ordinary value update or conserved reaggregation.
- `.color("region")` is Encoding; `.color("#3366ff")` is Appearance.
- Remapping `.y()` to another field is Encoding; changing its scale/domain is
  Coordinate; `.flip()` is Coordinate.
- `.where()` changes Data membership. `.highlight()` changes emphasis.
  `.focus()` moves the camera while preserving data and mark identity.
- Unit `unitValue` belongs to Grain because it changes the quantity represented
  by one mark.

Do not add ontology terms casually. Add one only when the distinction is
observable in state, emitted by `delta().stateChanges`, represented in the
public type, and protected by tests. Remove terms that no implemented state
difference can emit. Update constitution, types, classifier, reference, and
tests together.

## Architecture

- Keep Core chart-agnostic. Core owns shared state, difference,
  correspondence, progress, frame evaluation, lifecycle, and camera math.
- Area, Bar, Line, Point, and Unit are peers. Each chart module owns its
  builder, compiler, renderer, geometry, matching, transition paths,
  intermediates, examples, and tests.
- Do not add chart-name branches to the generic transition runtime.
- Generated intermediate states must be complete, truthful chart states. They
  must not invent encodings. If no color is declared, marks remain black;
  explicit constant or field color remains authored.

## Transition contracts

- Every frame must agree with the scales and axes that explain it.
- Bar marks always use square corners. Do not add chart-style corner radii or
  radius transition geometry to simple, grouped, or stacked Bars.
- Prefer one canonical path evaluated backward for reverse playback. Do not add
  unrelated forward/reverse geometry rules.
- Correspondence does not guarantee a particular motion. Use split/merge or
  conserved motion only when identity, lineage, and measure compatibility
  support it; otherwise keep the chart's honest fallback.
- For grouping changes, communicate the structural relationship without
  inventing aggregation-specific meaning. Chart plugins decide the visible
  intermediate form.
- Preserve author-supplied `sequence()` boundaries. Automatic waypoints may be
  inserted only inside each adjacent authored pair.

## Product and documentation

- The homepage should show the result immediately: code changes drive the real
  VisDelta transition. Keep ontology explanation in the documentation.
- Homepage chart-type tabs choose the demonstration; the selected demo then
  auto-plays. The chart is a projection of the changing code, not a separately
  synchronized fake animation.
- In the ontology UI, label public syntax and emitted actions separately.
- Organize playground and lab examples by the seven state-change categories.
  Categories are the primary navigation; do not collapse the example system
  back into one undifferentiated dropdown. A composite example may declare one
  primary teaching category while its inspector reports every emitted change.
- Prefer concise, geometric, restrained UI with small corner radii. Preserve
  VisDelta's own visual identity rather than copying another design system.
- Keep responsive order legible: source data -> chart code -> animated chart.
- Keep live examples and the playground together around ontology and transition
  contracts; avoid duplicate inspectors or decorative controls.

## Working rules

- Preserve unrelated changes in a dirty worktree.
- Put shared behavior in shared modules and chart behavior in chart modules.
- Avoid hard-coded visual fixes when behavior can be derived from data,
  geometry, or container size.
- For transition changes, test forward play, reverse play, and progress
  scrubbing in the relevant local lab. Test narrow and desktop layouts for docs
  UI changes.
- Run the narrowest relevant tests first, then the available release gates.
  Report environment or pre-existing failures separately from regressions.
