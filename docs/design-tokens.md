# Site design tokens

The documentation site, Playground and Gallery share one token set,
[`docs/.vitepress/theme/tokens.css`](https://github.com/SonghaiFan/visdelta/blob/main/docs/.vitepress/theme/tokens.css).
The values were extracted from what the site's components already had in
common: canvas and surface tones, a single divider line, the monospace label,
eight-pixel panels and one accent.

These tokens style the **site**. Charts keep their own `--vd-*` tokens, which
belong to the library's [themes](/chart-style); the two sets never alias each
other.

Tokens come in three tiers:

1. **Primitives** are raw palette steps and scales (`--ui-gray-200`,
   `--ui-space-4`). Components never read them directly.
2. **Semantic** tokens name a role (`--ui-color-surface`,
   `--ui-color-accent`). Dark mode redefines only this tier.
3. **Component** tokens name a recurring composition (`--ui-type-label`,
   `--ui-panel-head`, `--ui-control-md`).

The swatches below read the live computed values, so they follow the current
light or dark appearance.

<DesignTokens />

## Shared primitives

A few classes compose the tokens for new UI:

| Class | Use |
| --- | --- |
| `.ui-label` | Uppercase monospace label for panel and section names. |
| `.ui-panel`, `.ui-panel-head` | Surface with an 8px radius and a 40px header. |
| `.ui-button` (`.is-primary`) | The one control shape; 32px tall, 6px radius. |
| `.ui-tabs` | Segmented choice for chart types and filters. |
| `.ui-chip` | Small outlined metadata tag. |
| `.state-icon-tile` | Accent tile carrying a state-change category icon. |

Keep corners small and geometric, keep shadows for floating surfaces only, and
add a token before adding a literal value.
