# Design language — Riverside Helpdesk

The look every tool shares. **Referrals (`/`) is the reference page**; Contacts,
Ask, Notes and Settings are written to match it. When this file and a page
disagree, fix whichever is wrong in the same commit. The shared pieces live in
the `rv-` block at the end of `app/globals.css`; read that block before writing
CSS for a page, and add to it rather than copying it.

Where it came from: a full pass over all five tools (see `docs/LESSONS.md`),
informed by 21st.dev components and videos and by Mobbin flows
(`docs/research/`).

## 1. Principles

1. **One screen, no window scroll.** A page is `position:relative; height:100%;
   overflow:hidden` with class `riva-page-fill`. Never `100vh` inside the shell
   (the shell body is shorter than the viewport: that clipped Settings). Only a
   card, a pane or the shell body scrolls, inside itself.
2. **One backdrop, one column, one card.** The backdrop is drawn once, behind
   everything, by `PageBackground`. A centred page is a 688px column: heading,
   input, one white card. No boxed panels on the light; white surfaces float on
   soft shadows, no borders.
3. **Colour has jobs.** White = surface. NHS blue (`--rv-accent`) = action,
   selection, the heading's one word, focus. Text uses the ink ladder. The
   palette never changes with the theme.
4. **Shapes.** 999px pills for anything clicked; 22px surfaces (cards, drawers,
   dialogs); 14px inset tiles; 10–11px fields; 50% icon discs.
5. **Motion says what changed.** Enter once with a staggered rise, afterwards
   only height, opacity and glide. House easing `cubic-bezier(.22,1,.36,1)`
   (`EASE = [0.22, 1, 0.36, 1]`). Reduced motion keeps fades, drops travel.
6. **Copy voice.** Sentence case, curly quotes. State titles are full sentences
   ending in a full stop. Buttons are verbs. Captions say what the card holds.
7. **Every data surface has every state**: loading (skeleton), empty, no
   results, error (with a way out), partial/degraded. Never a zero-height card,
   never a skeleton after a failure.

## 2. Tokens (`:root` in `app/globals.css`)

Ink ladder — text sits on `--rv-ink` or `--rv-ink-2`. `--rv-ink-3` (3.75:1) is
for large or non-text things only; `--rv-ink-4` (2.9:1) for placeholders only.
Small text in ink-3 was the single most common review finding.

| Token | Job |
| --- | --- |
| `--rv-page #f8fafc` | page and backdrop base |
| `--rv-ink / -2 / -3 / -4` | text / secondary / large labels / placeholders |
| `--rv-accent #005eb8`, `-hi #003087`, `-dim #e8f1f8`, `-line` | NHS blue; pressed; selected tint; hairline |
| `--rv-line`, `--rv-line-soft`, `--rv-divider #eef1f3` | borders; card dividers |
| `--rv-hl #f4f7f9` | the row the keys or pointer are on |
| `--rv-chip #f1f4f6`, `--rv-surface-3` | icon discs, filled controls on a card |
| `--rv-danger / -ink / -bg`, `--rv-warn-*`, `--rv-green` | states |
| `--rv-r-card 22px`; `--rv-sh-card / -box / -box-focus / -pop` | radius and shadows |
| `--rv-ease` | the house curve |
| `--rv-top-h` | the bar: 80px, 60px at ≤700px; always use the variable |
| `--rv-sky-a/b/c` | **Mist's three colours**, fixed, for anything CSS draws from the backdrop |

Font: Hanken Grotesk, **variable range 400..800 loaded** (the URL used to ask
for five discrete weights, so 450/550/650 silently rendered as the next one up).
Tabular numerals for counts, numbers and money.

## 3. Type scale

| Role | Desktop | ≤700px |
| --- | --- | --- |
| H1 (`.rv-h1`) | 56 / 800 / −.04em, centred, one `<em>` accent word, mb 36 | 38, mb 24 |
| Panel title | 23 / 750 | 21 |
| Dialog title | 17 / 650 | |
| Box input | 19 | 16 (never lower: iOS zooms) |
| Row primary | 16.5 / 450 | 15.5, wraps |
| Caption | 13 / 550, ink-2 | |
| Button | 14.5 / 600 | |

Heading pattern: a short verb phrase plus one accent noun — "Find a *referral*",
"Find a *number*", "Practice *notes*", "Notebook *saves*". Settings has none (it
does not fit at 1280×720 without forcing a scroll).

## 4. The shared classes (`rv-`)

`.rv-h1`, `.rv-card`, `.rv-btn` (+`--primary` `--quiet` `--plain` `--danger`
`--sm`; 40px pills), `.rv-ibtn` (34px round, `.is-on`), `.rv-chip` (+tones),
`.rv-skel`, `.rv-state` (`__ico` `__title` `__text` `__acts`), `.rv-field`
(filled, own blue ring, `.is-bad` / `[aria-invalid]`), `.rv-label`, `.rv-hint`,
`.rv-err`, `.rv-alert`, `.rv-toast`, `.rv-sr`.

- **Primary button**: one per view, the most useful next step.
- **State**: round icon disc, sentence title, one line of help, then actions
  (quiet "Reload" + primary alternative). Enter with opacity/y 6, .3s.
- **Inputs**: the global rule paints a yellow 3px outline on any `input` with
  focus-visible. A new-language input must set `outline:none !important` and
  draw its own ring (`.rv-field` does).
- **Overrides**: an Ask or Notes rule that refines an `rv-` class must name both
  classes (`.rv-state.riva-answer-state`) or it loses the cascade.

## 5. Page scaffold

```
<MotionConfig reducedMotion="user">
  <div className="xx-page riva-page-fill">
    <AppHeader subtitle="…" />            // no backdrop here
    <main className="xx">                 // 688px column, padding clamp(20px,11vh,140px) 24px 24px
      <motion.h1 className="rv-h1">Find a <em>…</em></motion.h1>
      <motion.div className="xx-box">…</motion.div>      // 64px pill, shadow, focus ring
      <motion.div className="xx-cap">…</motion.div>      // caption: what the card holds
      <Card>…rows or a State…</Card>                       // animated height, "more below" veil
      <motion.div className="xx-foot">…</motion.div>      // one quiet centred line
    </main>
  </div>
</MotionConfig>
```

Entrances: opacity 0, y 12 → 0, .6s EASE, delays 0 / .07 / .14 (box / card), caption
and foot opacity only. Rows: opacity/y 6, .32s, stagger .2+.03i (cap 10) on the
first list, .02i afterwards. Card height animates .38s (ResizeObserver on the
inner div). The row highlight is one element that glides (.32s) to the row the
keys or pointer are on, measured after every render.

**The card's "more below" cue** is a white veil `::after` with `position:sticky;
bottom:0`, shown while `scrollTop + clientHeight < scrollHeight`. Not a
`mask-image`: a mask clips the card's own shadow. Arrow-key scrolling keeps a row
clear of it (`scroll-margin-bottom`).

**Breakpoints.** One phone breakpoint: **700px** (the header and every sheet
switch there; pages used to switch at 600 and a 601–700 band broke). Also
`max-height:520px` for a phone on its side (tighter heading, card keeps ≥2 rows)
and `pointer:coarse` for touch (quiet actions always visible, 44px targets).

## 6. Backgrounds and the theme

A theme is **which background**, never a colour. Palette = Mist
(`#8fa6b8 #c3d1dc #7fa7c9` on `#f8fafc`), constant.

- `theme.js`: `THEMES`, `MIST`, key `riva-background`, `<html data-bg>`, boot
  script (clears the old `riva-theme` key). Default **Swirl**.
- `backgrounds.js`: one shared GLSL prelude/main and a `shade()` per background —
  Swirl (tom_ui Animated Gradient), Mesh, Grain, Waves, Dots (Paper Shaders via
  the 21st.dev Shader Builder), Aurora (Aceternity's CSS, redrawn as a shader),
  Metaballs; **Still** is CSS only (`.riva-sky`). Per-background `speed`,
  `amount` (how far towards colour), `calm` (quieter in the middle), `grain`,
  `res`. On narrow screens the whole field is quietened (captions sit straight
  on the light and must hold 4.5:1).
- `PageBackground.jsx`: ONE canvas behind the shell. Theme change = fade out,
  rebuild the programme on the same context, fade in. Busy (`<html data-busy>`)
  eases an energy uniform. Reduced motion = one frame. No WebGL / lost context =
  the CSS light. 30fps, paused when hidden.
- Picker (`ThemePicker.jsx`): radiogroup grid of tiles; each thumbnail is a real
  still drawn once by the background's own shader.
- **Pages must not draw their own background.**
- The window never scrolls, so there is no `scrollbar-gutter` on `html` (it
  reserved a strip the fixed backdrop could not reach: the "white line on the
  right").

## 7. Per-tool notes

- **Referrals / Contacts** are twins: rows full-bleed with dividers, one gliding
  highlight, trailing tag or phone pill, caption with the count, footer link in
  ink-2. Contacts adds category headers, a CQC register box and a web lookup.
- **Ask**: the answer is one white card (working line → streamed text →
  finished answer) in the same 688px column; the prose stays one element so
  nothing re-draws on settle. Question flies from the field into the heading
  (only when it is one line). Action row (Copy / Ask again / thumbs) arrives
  after the text; thumbs-down opens reasons in place. Stop, error card (Try
  again / Edit question), jump-to-end pill, history folded to two rows plus
  "N earlier questions". Opening screen heading and field align with Referrals.
  The composer bar holds the mode pill, then **Fast · Think · Deep**
  (`ThinkingSwitch`, `.riva-think`): a radio group on a `--rv-surface-3` track,
  the chosen segment a white tab in the accent, one Tab stop, arrows choose,
  44px segments under 700px. It is only ever a model switch (`lib/thinking.mjs`);
  a question asked on Think or Deep carries an "Asked on …" chip.
  **Suggestions as you type** (`SuggestList`, `.riva-suggest`,
  `lib/autocomplete.mjs`): the mode menu's surface, as wide as the field, up out
  of the dock or down into the empty page. Rows are a 30px icon tile, the label
  with the matched words bold, and a kind tag (Notebook, Contact, EMIS guide,
  Asked earlier, Mode). The field is the combobox (`aria-activedescendant`);
  ↑↓ choose, Enter asks, Tab fills in, Esc closes the list only. The rest of the
  top suggestion is drawn faintly after the typed words (`.riva-ghost`).
  Q&A only, or after a "/"; nothing typed is sent or stored to suggest.
  **Start with a task** (`QuickStart`, `.riva-quick`): six glass tiles under the
  centred field on the opening screen — AccurX, Consultation, Repeat medication,
  Referral form (each arms its mode, never asks), Phone numbers (opens the
  directory sheet) and the Notebook (a link). Absolute, so the opening geometry
  is untouched; three columns, two under 900px, hidden under 700px and while
  typing. "/" anywhere focuses the field. Under a finished answer, **Related in
  the Notebook** chips (`.riva-related`, quiet small buttons) offer up to three
  pages sharing a distinctive word with the question that the answer did not
  already name.
- **Notes**: two white cards (tree + page) with a 28px gutter; one pane at a
  time on a phone (list → page, "All notes" back pill). The page's reading width
  is ~720px. Honest save caption (Saving… / Saved · time / Couldn't save ·
  Retry). Keyboard tree (tree/treeitem roles, one tab stop, arrows, F2, Delete,
  Shift+F10, "Move to" submenu). Table actions are a menu on the table button so
  the toolbar never shifts. Titles validated by `lib/notebook/title-check.mjs`.
- **Settings**: one 760px card (wider than 688: id + price columns), only the
  rows scroll over a save bar that stays visible; counts unsaved changes; Save
  sends changed rows only; combobox picker portalled to the body.

## 8. Accessibility rules we enforce

- Focus ring 2px accent (offset 2px pills/buttons, 1px small icon buttons, −2px
  inside clipped containers). Headings given programmatic focus show no ring.
- Move focus on purpose: when a control removes itself (Retry, Try again, a
  verdict, a closed panel, a deleted row), hand focus to its replacement or a
  sensible neighbour — never let it fall to `<body>`. Esc in any popover closes
  only that popover and returns focus to its opener.
- Combobox/listbox semantics for search lists (`aria-activedescendant`); trees
  use tree roles; menus that are just links are a `<nav>`, not `role="menu"`.
- One SR-only `role="status"` per page for searching/counts/"Answer ready".
- 44px touch targets at ≤700px (pad with `::after{inset:-9px}`).
- Validation: validate on blur and on submit; `aria-invalid` + message under the
  field via `aria-describedby`; focus the first invalid field; server errors in
  one `role="alert"`; destructive actions confirm in the shared dialog, naming
  what goes.
- Guard unsaved work: `beforeunload`, a capture-phase click guard on internal
  links, and the cancellable `riva-before-navigate` event the ⌘K palette fires.
