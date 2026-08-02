# How to build with the Riverside Helpdesk UI

This is the UI layer of The Riverside Practice's staff helpdesk — an NHS
general practice tool. It is a **small primitive kit, not a component
catalogue**: two components plus the palette, type scale and global stylesheet
the product is actually built from. Compose everything else yourself, in the
idiom below.

## Setup

No provider, no theme context, no wrapper. Import `styles.css` once and render:
it carries the brand font (Hanken Grotesk, loaded from Google Fonts), the
`--riva-*` custom properties, and the app's real global stylesheet.

## The styling idiom: inline style strings

This product does **not** use utility classes, CSS modules, or styled
components. It styles with CSS declaration **strings**, converted to React
style objects by the exported helper `s()`:

```jsx
<div style={s('display:flex;align-items:center;gap:14px;padding:0 24px;background:#fff;')}>
```

Write your own layout the same way. Do not introduce Tailwind, `className`
utilities, or a CSS-in-JS library — none of it resolves here.

**Anything interactive is `Hover`.** There is no `Button`. `Hover` exists
because an inline style cannot express `:hover` — it takes `base`, `hover` and
`active` as strings and registers a real CSS rule. Use `tag` to pick the
element (`'button'`, `'a'`, `'div'`, or a component such as `Link`).

**Icons are `Svg` plus a glyph from `Icons`** — `<Svg w={16}>{Icons.search}</Svg>`.
There is no `<Icon name="…" />`. Colour them through the parent's `color`.

Exports: `Hover`, `Svg`, `Icons` (38 glyphs), `s`, `assetSrc`.

## Colour and type

Use the literal NHS hex the product uses, or the equivalent `var(--riva-*)`
token — both resolve. The core set: `#005eb8` blue (primary), `#003087` dark
blue (pressed), `#212b32` text, `#4c6272` secondary text, `#768692` tertiary,
`#d8dde0` borders, `#eef1f2` hairlines, `#f0f4f5` page background, `#fff`
surfaces. Status: `#007f3b`/`#e6f3ec` green, `#d5281b`/`#fbeae8` red,
`#946800`/`#fff6cc` amber — each accent over its own tint.

Type is Hanken Grotesk at `14.5px` for controls, `15.5px` body, `16.5px` prose,
`18px`/`20px` headings; `600` for control labels, `700` for headings. Radii:
`7px` pills, `10px` controls, `12px` cards, `16px` dialogs. The control height
is `42px` — keep it; these are tap targets used at a reception desk.

## Global classes (the escape hatch)

Inline strings cannot hold media queries or pseudo-elements, so those live as
`.riva-*` classes in `styles.css`. Use them rather than reinventing them:

- Layout/responsive — `.riva-header`, `.riva-head-text`, `.riva-head-title`,
  `.riva-tabs-desktop`, `.riva-nav-btn`, `.riva-grid-2`, `.riva-grid-desktop`,
  `.riva-grid-mobile`, `.riva-hero-h1`
- Overlays — `.riva-modal-overlay` + `.riva-sheet` (centred dialog on desktop,
  bottom sheet under 600px)
- Toasts — `.riva-notify-host`, `.riva-notify`
- Prose — `.riva-md` (assistant answers: numbered steps as blue discs, tables,
  callouts), `.riva-ico` (icon flush with text)
- Animation — `@keyframes rivaUp`, `rivaSpin`, `rivaBlink`, `rivaNotifyIn`,
  `rivaSheetUp`, `rivaStepIn`

Focus styling is global (a yellow `#ffeb3b` block on `:focus-visible`) — never
add your own focus ring.

## Read the source

`styles.css` and its imports are the truth for classes and tokens; each
component's `.prompt.md` is the truth for its props. Read them before styling.

## A representative build

```jsx
<div style={s('background:#fff;border:1px solid #d8dde0;border-radius:12px;padding:18px;')}>
  <h2 style={s('margin:0 0 12px;font-size:20px;font-weight:700;color:#212b32;')}>
    Repeat prescriptions
  </h2>
  <p style={s('margin:0 0 16px;font-size:15.5px;line-height:1.6;color:#4c6272;')}>
    Requests are checked against the patient’s record before they reach the GP.
  </p>
  <Hover
    tag="button"
    base="display:inline-flex;align-items:center;gap:7px;border:none;border-radius:10px;padding:0 18px;height:42px;background:#005eb8;color:#fff;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;"
    hover="background:#003087;"
  >
    <Svg w={16}>{Icons.check}</Svg>
    <span>Approve request</span>
  </Hover>
</div>
```
