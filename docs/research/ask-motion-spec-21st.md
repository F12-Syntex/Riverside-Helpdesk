# Ask flow — motion spec (Riverside Helpdesk `/ask`)

A motion spec for the Ask page, built from 21st.dev patterns (sources are in the `*.txt` files in
this folder). It is written for this repo's stack: Next.js 14 App Router, React 18, plain JS/JSX,
no Tailwind, inline style strings via `s()`, classes in `app/globals.css`, and `motion` v12
imported from `'motion/react'`.

**Tone:** calm and premium. This is an NHS reception tool used all day on shared machines, so
nothing here bounces, glows or calls for attention. Motion is only used to show where something
came from and what is happening right now.

**What the page does today** (read from the repo, unchanged by this spec):
- One question at a time. The question is the page's `<h1>` with a 68px blue rule under it
  (`ChatView.jsx → TurnQuestion`). Earlier questions shrink to numbered lines with "Show answer".
- The composer is a fixed dock (`.riva-dock`). It sits in the middle of the page while the page
  is empty (`.riva-dock-center`, which lifts it with `translateY(-var(--riva-dock-lift))`) and
  drops to the bottom on the first send. Its width also changes from 688px to 820px.
- An "emit" bar rises out of the dock when a question is sent (`.riva-dock-strip` / `rivaEmit`).
- Working state: `chat/WorkingState.jsx` shows a single shimmering title line (`TextShimmer` →
  `.riva-shimmer`), stage segments and an elapsed time. It sets `<html data-busy>`, which makes
  the Mist background move faster.
- Draft answers stream as markdown blocks (`AiAnswer.jsx → Draft → Md`). `Md` renders a flat
  list of blocks with `key={i}`, so a block that has just arrived mounts fresh.
- The finished answer uses `.riva-answer-flow`, which staggers its children with `rivaFlowIn`
  (14px + blur 5px). `.is-settled` turns this off when the answer was already streamed in.
- `ReferralsPage.jsx` already wraps itself in `<MotionConfig reducedMotion="user">`. That is the
  precedent this spec follows.

---

## 0. Shared tokens

Put these in one module, e.g. `lib/motion.mjs`, and mirror them as CSS custom properties.

```js
// lib/motion.mjs
export const EASE      = [0.22, 1, 0.36, 1];   // house curve — every entrance
export const EASE_EXIT = [0.7, 0, 0.84, 0];    // ease-in, for things leaving (from message-scroller)
export const EASE_SOFT = [0.4, 0, 0.2, 1];     // colour / opacity-only changes

export const DUR = { xs: 0.12, s: 0.18, m: 0.26, l: 0.42, xl: 0.62 };

export const SPRING = {
  press:  { type: 'spring', stiffness: 500, damping: 30 },            // tap feedback, no overshoot visible
  swap:   { type: 'spring', stiffness: 380, damping: 30 },            // icon / label swaps, chevrons
  chip:   { type: 'spring', bounce: 0.1, duration: 0.25 },            // suggestion + source chips (ai-suggestions)
  dock:   { type: 'spring', stiffness: 170, damping: 26, mass: 1 },   // ~critically damped, ~0.5s on a 300px drop
  layout: { type: 'spring', stiffness: 260, damping: 32 },            // layout="position" reflows
  check:  { type: 'spring', stiffness: 300, damping: 25 },            // pathLength check draw (motion-copy-button)
};

// The blur-in used for every content block (text-generate-effect, softened).
export const BLOCK_IN = {
  initial: { opacity: 0, y: 6, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: DUR.l, ease: EASE },
};
```

```css
/* app/globals.css — next to the existing keyframes */
:root {
  --rv-ease: cubic-bezier(.22,1,.36,1);
  --rv-ease-exit: cubic-bezier(.7,0,.84,0);
  --rv-ease-soft: cubic-bezier(.4,0,.2,1);
}
@keyframes rivaBlockIn { from { opacity: 0; transform: translateY(6px); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes rivaFadeIn  { from { opacity: 0; } to { opacity: 1; } }
@keyframes rivaFadeUp  { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes rivaPopIn   { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }
@keyframes rivaBreath  { 0%, 100% { opacity: .45; transform: scale(.8); } 50% { opacity: 1; transform: scale(1); } }
```

**Rules that apply to every pattern**
1. Things arriving use `EASE` and are quick (180–420ms). Things leaving use `EASE_EXIT` and are
   quicker still (120–180ms).
2. Elements travel at most 6px, except the question heading (24px) and the dock (its real drop).
   Blur goes no higher than 6px, and only on block-level elements. Never blur individual words in
   a long answer: `filter` on hundreds of inline spans drops frames on reception PCs.
3. No overshoot that can be seen. Springs are near critically damped (damping ratio 0.85 or more).
4. Wrap the Ask tree (in `QaApp.jsx`, around the column and the dock) in
   `<MotionConfig reducedMotion="user">`, as `ReferralsPage` does. Motion will then drop
   transform and layout animation and keep opacity. The global CSS rule in `globals.css`
   (`animation-duration:.001ms`) already handles the CSS keyframes.
5. Under reduced motion every pattern below becomes **opacity only, 120ms**, with no blur and no
   travel. Smooth scrolling becomes `behavior: 'auto'`. The per-pattern notes list what else changes.

---

## 1. Composer: from the centre to the dock on the first send

**Source:** `agent-chat-centered-empty.txt` (one composer node in two slots, draft text kept),
`chat-02-full-page.txt` (the docked state and its timing).
**Applies to:** `QaApp.jsx` (`.riva-dock` / `.riva-dock-center` / `.riva-dock-inner`),
`ChatView.jsx` (`.riva-hero-block`), and `globals.css`.

Agent Chat swaps the composer between slots without animating. The repo already keeps one dock
element and moves it on a transform, which is the right way to do it. The spec refines the
timing and adds a choreography around the move.

### Option A (recommended): keep the CSS transform and retime it
```css
.riva-dock-inner {
  transition:
    transform .62s var(--rv-ease),
    max-width .62s var(--rv-ease),
    opacity .3s var(--rv-ease-soft);
}
/* The centred field sits a little prouder; the docked one settles into the page. */
.riva-dock-center .riva-dock-field { box-shadow: 0 2px 4px rgba(33,43,50,.05), 0 18px 48px rgba(0,48,135,.14); }
.riva-dock-field { transition: box-shadow .62s var(--rv-ease), border-color .18s ease, background-color .18s ease; }
.riva-dock:not(.riva-dock-center) .riva-dock-field { box-shadow: 0 2px 4px rgba(33,43,50,.05), 0 10px 30px rgba(33,43,50,.10); }
```
(The current timing is `.5s cubic-bezier(.2,.7,.3,1)`. The house curve settles more gently
over a long drop.)

### Option B: drive it with a motion spring
Use this only if Option A ever looks wrong. Move the lift from `transform` to a layout offset so
that motion can measure it:
```css
.riva-dock-center > .riva-dock-inner { transform: none; position: relative; bottom: var(--riva-dock-lift); }
```
```jsx
<motion.div className="riva-dock-inner" layout="position" transition={{ layout: SPRING.dock }}>
```
Use `layout="position"`, not `layout`. A full `layout` animates the 688→820px width change as a
scale, and that stretches the textarea text. Keep `max-width` on its CSS transition.

### First-send choreography (t = the moment Enter is pressed)
| t (ms) | What | Values |
|---|---|---|
| 0 | Hero block leaves | `exit={{ opacity:0, y:-12, filter:'blur(6px)' }}`, `DUR.s` (180ms), `EASE_EXIT` |
| 0 | Dock starts to drop | Option A: 620ms `--rv-ease`. Option B: `SPRING.dock` |
| 0 | Field clears; the send button swaps to stop/working | chat-02 `swap`: opacity 0→1, scale .95→1, 150ms `EASE`; `:active` scale .96 |
| 40 | Emit bar (existing `rivaEmit`) | keep it; shorten to 520ms so it finishes before the heading settles |
| 120 | Question heading arrives (§2) | 520ms |
| 380 | Thinking line arrives (§3), only if no token has arrived yet | 260ms |

Wrap the hero and the turn in `AnimatePresence mode="popLayout"`. The leaving hero is then taken
out of the flow at once, and the heading does not start below a hero that is still fading:
```jsx
<AnimatePresence mode="popLayout" initial={false}>
  {v.isEmpty
    ? <motion.div key="hero" className="riva-hero-block" exit={{ opacity: 0, y: -12, filter: 'blur(6px)', transition: { duration: DUR.s, ease: EASE_EXIT } }}>…</motion.div>
    : <motion.div key={v.turn.key} layout="position" transition={{ layout: SPRING.layout }}>…turn…</motion.div>}
</AnimatePresence>
```
**Reduced motion:** the dock jumps (transition none), the hero fades in 120ms and nothing else moves.
**Knock-on:** `AskIntro.jsx` waits "a beat more for the dock to land". If the timing moves to
620ms, make that wait at least 700ms.

---

## 2. The question appearing in the thread

**Source:** `chat-02-full-page.txt` (only new turns animate: 4px rise, 200ms; the placeholder
reply slot mounts at the same time) and `message-scroller.txt` (`scrollAnchor`: the new question
sits near the top and the answer grows below it).
**Applies to:** `ChatView.jsx → TurnQuestion` (the `<h1>`) and the rule under it.

The page keeps its "the question is the heading" model. No chat bubbles.

```css
/* replaces rivaHeadIn (34px, no blur) */
@keyframes rivaQuestionIn { from { opacity: 0; transform: translateY(24px); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
.riva-turn-q { animation: rivaQuestionIn .52s var(--rv-ease) .12s both; }
.riva-turn-rule { transform-origin: left center; animation: rivaRuleIn .42s var(--rv-ease) .32s both; }
```
- `.riva-turn-rule` is a new class. Move the rule's inline `animation:rivaRuleIn …` from
  `ChatView.jsx` into it.
- 24px of travel, not 34px. The question should look like it settles, not drops in.
- The rule's delay moves from 120ms to 320ms so it wipes in after the heading has mostly landed.
- The pasted-message card (a long question) uses `rivaBlockIn` at 420ms with a 200ms delay.
- When an earlier question is reopened ("Show answer", same `key` remount), use `rivaBlockIn` at
  320ms with no delay. A question that was already asked should not travel up again.
- History rows: keep `.riva-history-row`. Cap the stagger at 4 rows × 40ms (as now).
- **Scroll anchoring:** on send, `#riva-scroll` scrolls to the top of the new turn
  (`el.scrollTop = 0`, as `QaApp.jsx:384` already does), so the question sits under the header.
  While a draft streams, follow the bottom only if the reader is within 120px of it (§8). Never
  move the page while the reader is reading higher up.

**If bubbles are ever introduced** (chat-02): a right-aligned muted bubble, `initial={{ opacity:0, y:8, scale:.98 }}`,
`transformOrigin:'100% 100%'`, 240ms `EASE`.

**Reduced motion:** heading and rule appear with a 120ms fade; the rule is shown at full width.

---

## 3. Thinking / working indicator (a quiet inline line)

**Source:** `reasoning-text.txt`: the `SwapPhrase` variant (3px rise, 200ms), a width-reserving
grid stack, a screen-reader copy of the plain text, and a shimmer of about 2.2s. Also the
chat-02 inline "Thinking…" shimmer, which appears 600ms before the first word.
**Applies to:** `chat/WorkingState.jsx` (`.riva-work-title`, `TextShimmer`) and `AiAnswer.jsx → Draft`
(the status line under a draft).

**Do not** cycle invented phrases on a timer, as Reasoning Text does. The house rule in
`WorkingState.jsx` is that every line is a real server step. Animate only when `now` changes.

```jsx
// WorkingState.jsx: replace `<div key={now} className="riva-work-title">`
<div className="riva-work-title" aria-hidden="true">
  <span className="riva-live-dot" />
  <AnimatePresence mode="popLayout" initial={false}>
    <motion.span key={now} style={{ display: 'inline-block' }}
      initial={{ opacity: 0, y: 4, filter: 'blur(2px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.22, ease: EASE } }}
      exit={{ opacity: 0, y: -4, filter: 'blur(2px)', transition: { duration: 0.14, ease: EASE_EXIT } }}>
      <TextShimmer duration={2.2}>{now}</TextShimmer>
    </motion.span>
  </AnimatePresence>
</div>
<span className="riva-sr-only">{now}</span>   {/* inside the existing role="status" */}
```
```css
.riva-live-dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:#005eb8;
                 margin-right:10px; vertical-align:middle; animation: rivaBreath 1.6s ease-in-out infinite; }
/* the existing shimmer: keep the #4c6272 → #005eb8 → #4c6272 band; set 2.2s linear infinite */
/* new: globals.css has no screen-reader-only utility yet */
.riva-sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
```
- **Appearance gate:** the whole working card starts with `opacity:0` and fades in over 260ms
  after a **150ms delay**, so a fast answer never flashes the card. Once it is shown, keep it for
  at least **400ms** so it never flickers on and off.
- **Stage segments:** keep them. A segment fills with `transform: scaleX` over 420ms `--rv-ease`.
  The current segment's sweep is 1.6s linear.
- **Hand-off to the draft** (the first token arrives): the working card leaves with opacity 0,
  y −4, 160ms `EASE_EXIT`, and the first draft block arrives with `rivaBlockIn` (§4). Use
  `AnimatePresence mode="popLayout"` so the two overlap instead of stacking. The page Mist keeps
  `data-busy` until `aiDone`.
- **The draft's status line** ("Writing the answer" / "Checking the answer"): replace the
  spinning `Icons.spinner` with the same `riva-live-dot` plus the `TextShimmer` text, at 13px.
  A spinner reads as "stuck"; a breathing dot reads as "working".

**Reduced motion:** the dot is static at full opacity, there is no shimmer sweep (the gradient
already reads as solid colour), line changes cross-fade over 120ms, and there is no blur.

---

## 4. Streaming answer reveal (blur-in per block, fade at the tail)

**Source:** `text-generate-effect.txt` (blur 4px→0, 0.5s), `response-stream.txt` (keyed segments
mean only new text animates; opacity-only fade), `streaming-text-citations.txt` (250ms word fade,
a 2px caret that fades out when done), chat-02 (paragraph-level blocks).
**Applies to:** `AiAnswer.jsx → Draft`, `chat/Md.jsx`, `globals.css`.

### 4a. Block-level reveal (do this first)
`Md` already gives each block `key={i}`. A new paragraph, list, table or heading mounts once, and
a block that keeps growing keeps its key and never replays. So one CSS rule is enough:
```css
.riva-answer-live .riva-md > * { animation: rivaBlockIn .42s var(--rv-ease) both; }
.riva-answer-live .riva-md > table,
.riva-answer-live .riva-md > ul,
.riva-answer-live .riva-md > ol { animation-duration: .5s; }
```
Put `className="riva-answer-live"` on the `Draft` wrapper only. The finished answer keeps
`.riva-answer-flow.is-settled`, which has no animation, so text that streamed in never reveals
itself a second time.

### 4b. Steady release (pacing)
Network chunks arrive in bursts. Release the text at an even reading speed so blocks do not jump
in three lines at a time:
```js
// chat/useSmoothText.js
import React from 'react';
export default function useSmoothText(target, active) {
  const [shown, setShown] = React.useState(target || '');
  const r = React.useRef({ shown: target || '', target: target || '' });
  r.current.target = target || '';
  React.useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!active || reduce) { r.current.shown = r.current.target; setShown(r.current.target); return undefined; }
    let raf; let last = performance.now();
    const tick = (now) => {
      const st = r.current;
      if (!st.target.startsWith(st.shown)) st.shown = '';                  // draft was rewritten: restart
      const backlog = st.target.length - st.shown.length;
      if (backlog > 0) {
        const cps = Math.max(90, backlog / 1.2);                          // never more than ~1.2s behind
        let end = Math.min(st.target.length, st.shown.length + Math.max(1, Math.round(cps * (now - last) / 1000)));
        const ws = st.target.slice(end).search(/\s/);
        if (ws > 0 && ws < 14) end += ws;                                  // finish the word in hand
        st.shown = st.target.slice(0, end);
        setShown(st.shown);
      }
      last = now; raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return active ? shown : (target || '');
}
```
`<Md text={useSmoothText(markdown, true)} />` inside `Draft`. When the turn completes, the
finished answer replaces the draft at once (the hook returns `target`).

### 4c. Caret
A steady 2px caret (it does not blink) at the end of the live text. It shows that writing is
still going on.
```css
.riva-caret { display:inline-block; width:2px; height:1em; margin-left:2px; vertical-align:-0.12em;
              border-radius:1px; background:#005eb8; opacity:.55; animation: rivaFadeIn .15s ease-out both; }
```
Render it after the last block while `hasDraft` is true. When the stream ends it fades out over
200ms (`AnimatePresence`, exit opacity 0, `EASE_SOFT`).

### 4d. Optional, phase 2: word fade at the tail
Give `Md` a `freshFrom` character index (the length of the text 250ms ago). In the last
paragraph only, wrap `text.slice(freshFrom)` in `<span class="riva-fresh">` keyed by `freshFrom`:
```css
.riva-fresh { animation: rivaFadeIn .28s var(--rv-ease-soft) both; }   /* opacity only: no blur, no travel */
```
This copies Response Stream's "fade" mode, but delays are relative to each chunk, not to the
absolute word index.

**Reduced motion:** text shows as it arrives (no pacing), blocks fade in over 120ms, the caret is
static, and there is no tail fade.

---

## 5. Source / citation chips

**Source:** `streaming-text-citations.txt` (inline chip `pop-in` 250ms `cubic-bezier(.23,1,.32,1)`;
sources disclosure: grid-rows 0fr→1fr plus opacity, 300ms), `streaming-response-actions.txt`
(an "N sources" toggle with a 180° chevron on a spring), `inline-citations.txt` (numbered marker,
a tooltip with the title on hover/focus, a footer list).
**Applies to:** `chat/CiteChip.jsx` (`CiteChip`, `SourceChips`) and `AiAnswer.jsx → Section`.

- **Entrance:** source chips mount only once the answer is done (`aiDone`). The row arrives with
  `rivaFadeUp` over 260ms, 120ms after the last block. Each chip uses `SPRING.chip` with
  `initial={{ opacity:0, scale:.96 }}` and a **40ms stagger, left to right**. Sources have an
  order, unlike suggestions (§7).
- **The per-section `CiteChip`** under a section: `rivaPopIn` over 260ms `--rv-ease`, delayed
  60ms after its section's own entrance.
- **Hover/focus:** keep `.riva-lift` (translateY −1px plus a soft shadow, 160ms). Add the
  tooltip from `inline-citations.txt` (opacity plus 4px rise, 160ms `--rv-ease`) when a chip's
  label is truncated, so the full document name can be read.
- **More than 4 sources:** collapse them to `[favicon stack] N sources ⌄`. Open and close with
  the grid-rows disclosure, 300ms `--rv-ease`. The chevron rotates on `SPRING.swap`:
  ```css
  .riva-disclose { display:grid; grid-template-rows:0fr; opacity:0; transition: grid-template-rows .3s var(--rv-ease), opacity .3s var(--rv-ease); }
  .riva-disclose.is-open { grid-template-rows:1fr; opacity:1; }
  .riva-disclose > div { overflow:hidden; }
  ```
- **Opening a source** (the side panel `DocumentViewer`): the chip briefly fills `#e8f1f8` for
  120ms (`EASE_SOFT`) to show which chip was pressed. The panel keeps its own `rivaPanelIn`.

**Reduced motion:** chips appear together with an opacity fade, the chevron flips with no
rotation, and the disclosure opens with no height animation.

---

## 6. Answer action row (copy / retry / helpful)

**Source:** `streaming-response-actions.txt` (the row mounts only when not streaming:
`{opacity:0,y:4}→{1,0}` over 220ms; whileTap scale .9; copy→check for 1600ms; feedback buttons
toggle), `motion-copy-button.txt` (label/icon cross-blur, check `pathLength` draw,
`popLayout`), `streaming-text-citations.txt` (the row is laid out but invisible until done, so
nothing moves).
**Applies to:** `AiAnswer.jsx → Feedback` (today: "Was this right?" plus five pill buttons, then a
thank-you line), and a new copy/retry pair.

- **No layout shift:** reserve the row's height (`min-height: 36px`) under a draft and render it
  at `opacity:0; pointer-events:none`. On `aiDone`, animate to `{ opacity:1, y:0 }` from
  `{ opacity:0, y:4 }` over 220ms `EASE`, with a 220ms delay (after the source chips).
- **Buttons:** 32px visual size inside a 44px hit area (NHS minimum for touch). Ghost by default
  (`color:#768692`); on hover `background:#f0f4f5; color:#212b32`, 120ms. Press:
  `whileTap={{ scale: .94 }}` with `SPRING.press`. Do not grow on hover (the motion.dev 1.05
  hover is too playful for this page).
- **Copy:** `AnimatePresence mode="popLayout" initial={false}` keyed on `copied`. Label and icon:
  `initial={{ opacity:0, filter:'blur(4px)' }}`, `animate={{ opacity:1, filter:'blur(0px)' }}`,
  exit the reverse, with `SPRING.swap`. The check draws:
  `<motion.path d="M4 12l5 5L20 6" initial={{ pathLength:0 }} animate={{ pathLength:1 }} transition={{ ...SPRING.check, delay:.08 }} />`
  in `#007f3b`. It reverts after **1600ms**. Put `layout` on the button and an inline
  `borderRadius: 999` so the "Copy"→"Copied" width change does not distort the pill.
- **Retry:** the icon makes a single 360° turn (`rotate: [0, 360]`, 520ms `EASE`) on press, then
  hands over to §3/§9. It does not keep spinning.
- **Helpful / not helpful** (the existing five verdicts): the chosen pill fills
  (`#e8f1f8`/`#005eb8` for good, `#fdf4f3`/`#a51b0f` for not) over 160ms. 600ms later the whole
  row swaps to the thank-you line with `AnimatePresence mode="wait"`: the row leaves with opacity
  0 over 120ms `EASE_EXIT`, and the thank-you arrives with `{ opacity:0, filter:'blur(4px)' }→{1,0}`
  over 220ms `EASE`, with its check drawn by `pathLength` as above.
  If the verdicts are ever put in one segmented control, use a shared
  `layoutId="riva-verdict-fill"` for the selected background so it slides between options
  (`SPRING.layout`).

**Reduced motion:** the row fades in over 120ms, icons swap with no blur, the check is drawn at
once, and there is no rotation.

---

## 7. Suggestion chips (starters and follow-ups)

**Source:** `ai-suggestions.txt` (a **stagger that spreads out from the centre**:
`|i − middle| × 45ms`; `SPRING.chip` (bounce .1, .25s); `initial {opacity:0, scale:.94, y:6}`;
`layout` on each chip so the others close the gap; they clear once one is chosen). Motion
reference videos: chat-empty-state and the follow-ups in streaming-text.
**Applies to:** `chat/SuggestBubble.jsx` (the "did you mean" list), any future follow-up row
under an answer, and empty-state starters if they are added.

```jsx
const middle = (items.length - 1) / 2;
<AnimatePresence initial>
  {items.map((it, i) => (
    <motion.li key={it.id} layout transition={{ layout: SPRING.layout }}
      initial={{ opacity: 0, scale: 0.96, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0, transition: { ...SPRING.chip, delay: 0.32 + Math.abs(i - middle) * 0.045 } }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: DUR.xs, ease: EASE_EXIT } }}>
      <motion.button whileTap={{ scale: 0.97 }} transition={SPRING.press} className="riva-lift">…</motion.button>
    </motion.li>
  ))}
</AnimatePresence>
```
- Scale .96, not .94. These are full-width rows in `SuggestBubble`, and .94 moves a wide row too much.
- Follow-ups appear **after** the action row (0.32s base delay). They are the last thing to arrive.
- For a vertical list (`SuggestBubble`), fall back to a **top-to-bottom** stagger of 60ms. Spreading
  from the centre only makes sense in a wrapped row of chips.
- **On select:** the other chips leave (`DUR.xs`, `EASE_EXIT`). The chosen chip keeps a pressed
  state (fill `#f7fbff`, border `#005eb8`) until the new question heading arrives (§2). The page
  then changes over to the new turn as usual.

**Reduced motion:** chips appear together with a 120ms fade, and there is no layout animation or tap scale.

---

## 8. "Jump to latest" pill

**Source:** `message-scroller.txt` (**different curves in and out**: in over 200ms with
`cubic-bezier(.23,1,.32,1)`; out over 400ms with `cubic-bezier(.7,0,.84,0)`; hidden state
`translateY(100%) scale(.95) opacity 0`), `chat-02-full-page.txt` (a text pill: 28px, rounded,
hairline ring shadow, "Jump to latest" plus a chevron), `scroll-button.txt` (show when more than
100px from the bottom; smooth scroll on click).
**Applies to:** `QaApp.jsx`. Add the pill inside the dock area, above the strip, centred at
`bottom: calc(var(--riva-dock-h) + 12px)`. It watches `#riva-scroll`.

```css
.riva-jump {
  position: fixed; left: 50%; bottom: calc(var(--riva-dock-h) + 12px); z-index: 51;
  height: 32px; padding: 0 14px; display: inline-flex; align-items: center; gap: 6px;
  border-radius: 999px; border: 0; background: #fff; color: #4c6272;
  font: inherit; font-size: 13.5px; font-weight: 600;
  box-shadow: 0 0 0 1px rgba(33,43,50,.06), 0 4px 14px rgba(33,43,50,.10);
  transform: translate(-50%, 0) scale(1); opacity: 1;
  transition: transform .2s var(--rv-ease), opacity .2s var(--rv-ease), color .16s ease;
}
.riva-jump:hover { color: #005eb8; }
.riva-jump:active { transform: translate(-50%, 0) scale(.96); }
.riva-jump[data-active="false"] {
  pointer-events: none; opacity: 0; transform: translate(-50%, 8px) scale(.95);
  transition-duration: .26s; transition-timing-function: var(--rv-ease-exit);
}
.riva-jump .riva-live-dot { width: 6px; height: 6px; margin: 0; }   /* only while streaming */
```
- **When to show it:** the distance from the bottom is more than **160px** *and* content exists
  below the fold. Recheck on `scroll` (passive) **and** in a `ResizeObserver` on the column, so
  the pill appears when a streaming answer grows past the dock while the reader stays still.
- **Label:** "Jump to latest" with a chevron. While a draft is streaming, use a breathing
  `riva-live-dot` in place of the chevron, and the label "Answer continuing below".
- **Click:** `scrollTo({ top: scrollHeight, behavior: reduce ? 'auto' : 'smooth' })`. Then
  follow the bottom while streaming, until the reader scrolls up again.
- The exit is 260ms, not the source's 400ms, which feels slow above a dock that is in active use.

**Reduced motion:** opacity only, 120ms, and an instant jump.

---

## 9. Error / retry card

**Source:** `ai-error-handler.txt` (title, message, an async Retry that becomes
spinner + "Retrying…" with `aria-busy`, and an optional dismiss), and the in-thread
`ErrorBubble` in `agent-chat-centered-empty.txt`.
**Applies to:** `AiAnswer.jsx → v.aiError` (today: a paragraph plus a blue 3D "Try again").

- **Card:** white, `border-radius: 16px` (an inline card; the page's main cards stay at 22px),
  `border: 1px solid #eef1f2`, a `3px` left rule in `#d5281b`, a soft shadow
  `0 1px 2px rgba(33,43,50,.05), 0 8px 24px rgba(33,43,50,.08)`. Red is used **only** for the
  rule and the icon. The title stays `#212b32`, because a red title reads as a clinical alarm.
- **Entrance:** `rivaBlockIn` over 420ms (the same as any block). No shake and no pulse.
- **Retry:** keep the NHS blue primary button with its `0 4px 0 #002a52` press shadow. On press:
  `aria-busy=true`, disabled, and the label cross-blurs (§6 copy swap values) to
  "Trying again…" with a `riva-live-dot`. The card then **leaves** with height collapse plus
  fade: grid-rows 1fr→0fr and opacity over 220ms `EASE_EXIT`. The working line (§3) returns in
  the same place (`AnimatePresence mode="popLayout"`, so the swap does not jump).
- **Announcing:** the first render is `role="alert"`. Retries use the existing `role="status"`
  on the working line, not a second alert.
- **Declined answers** (`v.aiDeclined`) are not errors. Leave them as they are and fade them in
  with `rivaBlockIn`.

**Reduced motion:** the card fades in over 120ms and the label swaps with no blur; the card is
removed with no collapse.

---

## Whole-turn timeline (the reference sequence)

```
Enter ─┬─ hero out 180ms ─┐
       ├─ dock drops 620ms ─────────────────────────┐
       ├─ emit bar 520ms ───────────┐
       │  120 ─ question in 520ms ──────────┐
       │        320 ─ rule wipes 420ms ──────────┐
       │              380 ─ working line in 260ms (if no token yet; 150ms gate)
first token ─ working out 160ms │ block 1 in 420ms │ blocks every arrival 420ms │ caret steady
aiDone ─┬─ caret out 200ms
        ├─ +120ms source chips (40ms stagger, SPRING.chip)
        ├─ +220ms action row (220ms)
        └─ +320ms follow-up chips (centre-out, 45ms)
```
No phase starts more than 400ms after the event that triggers it, and every motion is over
within 650ms. The reader is never waiting for an animation to finish.

---

## Implementation order (cheapest win first)
1. Tokens plus `MotionConfig reducedMotion="user"` in `QaApp.jsx`.
2. §4a block reveal (CSS only) and §4c caret.
3. §3 working-line swap, live dot and appearance gate.
4. §2 heading retime; §1 dock retime (Option A) and `popLayout` hero exit.
5. §6 action row (copy/retry plus feedback swap) and §5 chip entrance.
6. §8 jump pill (with the ResizeObserver).
7. §9 error card; §7 chips; §4b pacing; §4d tail fade (optional).

## Files in this folder
| File | Pattern(s) | Video |
|---|---|---|
| agent-chat-centered-empty.txt | 1, 9 | none (demo has no video) |
| chat-02-full-page.txt | 2, 3, 6, 8 | yes, the best for the docked thread and streaming |
| message-scroller.txt | 2, 8 | yes (mostly static; behaviour is in the code) |
| reasoning-text.txt | 3 | yes, letters cascading in and the phrase swap |
| response-stream.txt | 4 | yes, word fade (opacity only) |
| text-generate-effect.txt | 4 | yes, words resolving out of blur |
| streaming-text-citations.txt | 4, 5, 6, 7 | yes, **the best single reference** for the post-stream sequence |
| inline-citations.txt | 5 | yes, hover tooltip on numbered markers |
| streaming-response-actions.txt | 5, 6 | yes, action row and sources disclosure |
| motion-copy-button.txt | 6 | yes, cross-blur label and check draw |
| ai-suggestions.txt | 7 | none (refs: chat-empty-state, pacekit ai-suggestions) |
| scroll-button.txt | 8 | yes, round chevron button in/out |
| ai-error-handler.txt | 9 | yes, Retry → "Retrying…" state |

Frame contact sheets from the videos are in `_videos/*-sheet.png`.
