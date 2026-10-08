# D&D application color palette

A dark "dungeon at torchlight" palette with five colors. Red is reserved exclusively for destructive actions.

| Role | Hex | Use |
|---|---|---|
| Background | `#1B1814` | Main app background; text color on gold buttons |
| Ornaments / panels | `#2E2922` | Background ornaments (dragon silhouette, knotwork, map textures), cards, panels |
| Text (parchment) | `#E8DCC2` | Body text, headings, outlined neutral buttons, text on red buttons |
| Accent (gold) | `#C9A24A` | Primary actions, links, highlights, stats like HP or level |
| Danger (blood red) | `#A8322D` | Destructive actions only: delete, delete confirmation, reset, leave campaign |

## CSS variables

```css
:root {
  --color-bg: #1B1814;
  --color-ornament: #2E2922;
  --color-text: #E8DCC2;
  --color-accent: #C9A24A;
  --color-danger: #A8322D;
}
```

## Contrast

| Pair | Approx. ratio | Notes |
|---|---|---|
| Parchment text on background | ~12:1 | Comfortable for long reading (spells, character sheets) |
| Gold on background | ~7:1 | Also applies to background-colored text on gold buttons |
| Parchment text on red | ~4.9:1 | Passes WCAG AA for normal text |
| Ornament on background | ~1.3:1 | Intentionally subtle so decorations don't compete with content |

## Why it works

- **Ornaments** are only slightly lighter than the background, so they read as atmosphere rather than content.
- **Gold** is the single positive accent, giving primary actions a clear but thematic emphasis.
- **Red stays exclusive** to destructive actions. Avoid it in decorations or logos (e.g. no red dragon), or it stops meaning "careful."

## Destructive action guidelines

- Pair red with an icon (trash, warning) and an explicit label such as "Delete character"; don't rely on color alone, since about 8% of men have some form of color blindness.
- In confirmation dialogs, make **Cancel** the neutral outlined button (parchment border, transparent fill) and the default focus, so the red button requires a deliberate click.
- For lighter in-list delete actions (e.g. a trash icon on a row), use red text or a red outline; save the filled red button for the final confirmation.

## Optional sixth color

If a success color is needed later ("saved" messages, healing effects), a muted green like `#5E8C5A` fits the mood.
