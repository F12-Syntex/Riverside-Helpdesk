---
category: Primitives
---

# Hover

`Hover` is the interactive element of this design system. Buttons, links, tabs,
icon buttons and menu rows are all `Hover` — there is no separate `Button`
component, and adding one would not match how the product is built.

It exists because this codebase styles with **inline style strings** rather than
CSS classes, and an inline style cannot express `:hover` or `:active`. `Hover`
takes those two states as strings, registers them once as a real CSS rule in a
`<style>` element, and hands the element a generated class. The hover state is
therefore a genuine CSS pseudo-class — it can never get stuck after a click,
a drag, or a re-render, which a JS `onMouseEnter` approach cannot guarantee.

## Props

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `tag` | `React.ElementType` | `'button'` | The element or component to render. Pass `'a'`, `'div'`, `'li'`, or a component such as `next/link`'s `Link`. |
| `base` | `string` | `''` | Resting styles as a CSS declaration string (`'padding:7px 15px;color:#005eb8;'`). Parsed by `s()`. |
| `hover` | `string` | `''` | Styles applied on `:hover`. Emitted with `!important` so they beat the inline `base`. |
| `active` | `string` | `''` | Styles applied on `:active` (pressed). Same `!important` treatment. |
| `className` | `string` | `''` | Extra classes, appended before the generated hover class. Use this for the `.riva-*` responsive helpers. |
| `children` | `ReactNode` | — | Content. |

Any other prop (`onClick`, `href`, `aria-label`, `type`, `disabled`, …) is
spread straight onto the rendered element.

`hover` and `active` are cached by their string value, so two elements sharing
the same hover styles share one CSS rule — repeating the same string across a
list costs nothing.

## Usage

A tab pill in its active state (from the app header):

```jsx
<Hover
  tag="button"
  onClick={() => onSelect('assistant')}
  base="display:inline-flex;align-items:center;gap:7px;border:none;border-radius:7px;padding:7px 15px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;background:#fff;color:#005eb8;box-shadow:0 1px 2px rgba(33,43,50,.14);"
>
  <Svg w={16}>{Icons.chat}</Svg>
  <span>Assistant</span>
</Hover>
```

An icon button that tints on hover:

```jsx
<Hover
  tag="button"
  aria-label="Open menu"
  base="display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:10px;background:#f0f4f5;border:1px solid #d8dde0;color:#212b32;cursor:pointer;"
  hover="background:#e8f1f8;border-color:#005eb8;"
>
  <Svg w={22} sw={2.2}>{Icons.menu}</Svg>
</Hover>
```

A link rendered through another component:

```jsx
<Hover tag={Link} href="/" base="display:flex;align-items:center;" hover="opacity:.85;">
  <img src="/assets/nhs-logo.png" alt="NHS" style={s('height:30px;')} />
</Hover>
```

## Notes

- The generated rule is injected into `document.head` on mount, so the hover
  state is inert during server rendering and appears on hydration. The resting
  `base` style is server-rendered and correct from the first paint.
- `hover`/`active` are emitted with `!important`. Anything that needs to *win*
  over a hover state must be `!important` too, or live in `hover` itself.
- Give every icon-only `Hover` an `aria-label`; the app does. Focus styling is
  global (`app/globals.css`), so do not add a focus ring of your own.
