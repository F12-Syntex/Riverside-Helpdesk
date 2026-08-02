---
category: Primitives
---

# Svg

`Svg` is the icon frame. It renders a `24×24` viewBox SVG with the product's
stroke conventions already set — round caps, round joins, no fill, stroke taken
from the current text colour — and the glyph geometry is passed as children.

The geometry itself lives in the `Icons` export: a plain object whose values are
the inner `<path>` / `<circle>` / `<line>` elements of each icon. So an icon is
always two parts, a frame and a glyph:

```jsx
<Svg w={16}>{Icons.search}</Svg>
```

There is deliberately no `<Icon name="search" />` component. Keeping the frame
and the glyph separate is what lets one icon be drawn at any size and stroke
weight without a variant prop, and it is how every icon in the product is
written.

## Props

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `w` | `number` | `24` | Width in px. Also the height unless `h` is given. |
| `h` | `number` | `w` | Height in px. Rarely needed — icons are square. |
| `stroke` | `string` | `'currentColor'` | Stroke colour. Leave it alone and set `color` on the parent instead. |
| `sw` | `number` | `2` | Stroke width, in viewBox units. Nudged up (`2.2`) for small or heavy icons. |
| `fill` | `string` | `'none'` | Fill colour. The icon set is stroke-only; overriding this is unusual. |
| `style` | `CSSProperties` | — | Inline style on the `<svg>` element. |
| `children` | `ReactNode` | — | The glyph geometry, normally `{Icons.<name>}`. |

Sizes used in the product: `16` inside buttons and tabs, `22` for the mobile
menu button, `24` at rest.

## Icons

38 glyphs, all drawn on the same 24×24 grid:

**Status** — `check` · `alertCircle` · `infoCircle` · `triangle` · `shield` ·
`lock` · `spinner`

**Navigation** — `arrow` · `arrowLeft` · `up` · `chevronLeft` · `chevronRight` ·
`home` · `menu` · `close` · `external` · `sitemap`

**Actions** — `plus` · `edit` · `trash` · `copy` · `refresh` · `undo` · `redo` ·
`search` · `paperclip`

**Content** — `file` · `fileLines` · `folder` · `book` · `chat` · `image` ·
`calendar` · `globe`

**Domain** — `stethoscope` · `pill` · `phone` · `sparkle`

## Usage

Icon plus label inside a control:

```jsx
<Hover
  tag="button"
  base="display:inline-flex;align-items:center;gap:7px;border:none;background:none;color:#005eb8;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;"
>
  <Svg w={16}>{Icons.copy}</Svg>
  <span>Copy</span>
</Hover>
```

A status glyph in a tinted disc (from the notification toast):

```jsx
<span style={s('width:26px;height:26px;border-radius:50%;background:#e6f3ec;color:#007f3b;display:inline-flex;align-items:center;justify-content:center;')}>
  <Svg w={16} sw={2.2}>{Icons.check}</Svg>
</span>
```

## Notes

- Colour icons through the parent's `color`, not the `stroke` prop — that is
  what makes an icon inherit a button's hover colour for free.
- `.riva-ico` in `app/globals.css` is the wrapper class for an icon that sits
  inline with text and needs to stay flush with it.
- The glyphs are stroke-only line icons; do not mix a filled icon set in.
- `spinner` is a three-quarter ring meant to be spun, not drawn static. Pair it
  with the `rivaSpin` keyframes from `styles.css`, exactly as the product does:
  `<Svg w={17} sw={2.2} style={s('animation:rivaSpin .9s linear infinite;')}>{Icons.spinner}</Svg>`.
