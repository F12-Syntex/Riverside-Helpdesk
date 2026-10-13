# Lessons and findings — the design-consistency pass (Oct 2026)

What was learnt bringing Referrals, Contacts, Ask, Notes and Settings onto one
design language, adding background themes, and reworking the Ask flow. Versions
6.85.0 → 6.89.5. The current design is in `docs/DESIGN.md`; this file is the
reasoning, the traps and the process, so the next pass does not rediscover them.

## What shipped (commit trail)

| Version | Commit | What |
| --- | --- | --- |
| 6.85.0 | `080be3f` | theme = one of 8 21st.dev backgrounds, always Mist; one shared canvas; white strip removed |
| 6.85.1 | `3997dc5` | shared `rv-` classes; variable font weights |
| 6.85.2 | `d7e25ea` | Referrals states, contrast, focus |
| 6.86.0 | `ca310a2` | Settings redesign + model-id validation |
| 6.87.0 | `61f769b` | Contacts rebuilt + form validation |
| 6.87.1 | `bb50b75` | review fixes (picker/drawer layering etc.) |
| 6.88.0 | `6b41fdd` | Notes redesign |
| 6.89.0 | `c8f9d87` | Ask flow rework |
| 6.89.1–5 | `2faa9c3` `f62dea7` `eae384b` `bf78cf1` `28abe6f` | fixes from a 4-reviewer + skeptic pass (49 confirmed findings) |

## Traps we hit (and the fix)

- **CSS `animation … both` beats motion/react inline styles.** A CSS animation
  with fill-mode `both` on an element also driven by `motion` keeps its end state
  and the exit never shows (first seen in 63bce7b). Anything moved to motion must
  lose its CSS animation, or use `backwards`.
- **No transforms on ancestors of fixed things.** The dock and the phone bottom
  sheets are `position:fixed`; a transformed ancestor makes them relative to it.
  Do not wrap the dock's parents in `motion` elements with y/scale. The dock's
  centre→bottom move is a CSS transform transition on `.riva-dock-inner`, kept
  on the house curve (.6s).
- **`AnimatePresence mode="popLayout"` re-applies margins.** It pins the leaving
  node with `left:offsetLeft` (margin excluded) so a negative margin on that node
  is counted twice: the hero heading jumped 40px. Put overhang margins on a child.
- **`scrollbar-gutter: stable` on `html`** reserves a strip the fixed backdrop
  cannot paint into: the white line on the right. The window never scrolls
  (the shell body does), so it is not needed.
- **`mask-image` clips the element's own shadow.** Use a sticky white veil for a
  "more below" cue.
- **The global `input:focus-visible` rule is a yellow 3px outline.** New inputs
  must override it and draw their own ring.
- **Font weights**: 450/550/650 only exist if the variable range is loaded.
- **ink-3 for small text fails contrast** (3.75:1). Captions, labels, hints,
  version chip, picker credits, group titles — all were ink-3. Use ink-2.
- **Text straight on the backdrop** (captions, links, the Ask heading's blue
  word) can fail 4.5:1 on some backgrounds on narrow screens; the field is
  quietened when narrow and key on-light text gets a white halo.
- **Breakpoint mismatch**: header/sheets at 700px but pages at 600px broke a
  601–700 band (Ask heading stranded above a dropped field). One breakpoint: 700.
- **Window-level scroll from popovers**: an unbounded picker made the window
  scrollable on short laptops. Give popovers `max-height` and inner scroll.
- **z-index**: drawer and scrim must sit under the header (z 51 vs the header's
  52) or header popovers open behind them.
- **Esc handlers stack**: a popover's Esc must `preventDefault` so an open drawer
  under it does not also close.
- **WebGL**: one canvas only (browsers cap contexts ~16; picker thumbnails use
  one throwaway context then `loseContext`). Guard `build()` on a lost context
  (Firefox/Safari return null shaders). Free the programme and buffer on
  unmount. GLSL ES 1.00: loop counters may index uniform arrays; keep loops
  constant-bounded; `pow` of a negative is undefined.
- **A pending save must not block navigation** (Notes): send it, switch pages,
  show "Saving…". A hung save used to freeze the tree.
- **A cookie and its localStorage copy can disagree** (question-logging
  opt-out): read exactly what the server reads (the cookie), write both back on
  every page, not only when Settings opens.
- **`tel:` links from a display string**: derive from the first number only; the
  display keeps extensions and "/" alternates verbatim.
- **Popovers that navigate without a link** (⌘K) bypass link guards — fire a
  cancellable event (`riva-before-navigate`).

## Process insights

- **Scout inline, then fan out.** One agent per page, each owning disjoint
  files, worked in parallel against one dev server. Tell each agent which files
  it owns and that the lead commits; re-read shared files (`globals.css`) before
  each edit and use small exact replacements.
- **Commit per page, selectively.** With several agents editing one tree, stage
  by path; for a shared file (`globals.css`) build the staged blob from
  `git show HEAD:` + only your hunks (`git update-index --cacheinfo`) so another
  agent's half-done edits are not swept in. The stop-hook nag about uncommitted
  files is expected while agents run.
- **Review → adversarial verify → fix → re-verify.** Four reviewers (Ask, Notes,
  Contacts+Settings, cross-page) each paired with a skeptic told to default to
  *refuted* unless reproduced. 49 of ~56 findings were real, including a high
  (the 40px hero jump) and a high (opt-out desync). Re-run the reviewers' own
  repro scripts after fixing. Review your own committed work too: it caught real
  bugs in the backgrounds and Referrals commits.
- **Look at screenshots, and at frames.** Many issues (overlap during the send
  animation, 40px jump, ghost text through phone sheets) only show in a frame
  sequence or a close-up. Record video, extract frames with ffmpeg
  (`/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux`).
- **Prod build in a throwaway worktree**, never in the dev server's directory:
  `git worktree add --detach <tmp> HEAD`, symlink `node_modules`, `npm run
  build`, remove the worktree.
- **`npm run versions` needs full history.** The clone may be shallow
  (`git fetch --unshallow`); it errors loudly otherwise.

## Testing recipe (no database locally)

- `npm ci`, `npx next dev -H 127.0.0.1 -p 3000`; no `DATABASE_URL`, so data
  routes 500/503 and the UI shows its error states — good for testing them.
- Playwright (preinstalled at `/opt/node-tools/node_modules/playwright`,
  Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Launch args
  that make WebGL fast: `--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader --ignore-gpu-blocklist` (the old
  `--use-gl=swiftshader` took 15 minutes for ten screenshots).
- `waitUntil:'load'` then a short wait — never `'networkidle'` (audit beacons
  and the live page never settle).
- `addInitScript(() => localStorage.setItem('riva-background','still'))` for
  fast, stable shots; mock `**/api/audit**` with `{}`.
- Mock APIs with `page.route`. Shapes: referrals `{referrals:[{id,title,where,
  route,tag,names,href,card}],popular:[ids]}`; search `{q,by,results}`;
  contacts `{editable,entries:[{id,label,category,origin,phones:[{display,tel}],
  emails,…}]}`; settings is a **PUT**; notebook `{notes,attachments}`; Ask's
  `/api/agent` is a stream (see the harness described in the Ask section of
  `docs/research/`). A mock that fails (500/503/empty) exercises each state.
- Unit tests: `npm test` (`node --test`); pure logic extracted to `.mjs` so it
  can be tested (title-check, smooth text, contact validate/phone, model-id,
  opt-out).
- HMR full reloads wipe the in-memory Ask transcript; that is by design.

## Research, and how to use the sources

- **21st.dev MCP** (`mcp__21st__*`): `search` is free metadata + `videoUrl`
  previews (download the mp4 and extract frames to see real motion); `get_component`
  returns source (paid tier, no quota seen). Useful finds: Paper Shaders
  recipes (Mesh/Grain/Waves/Dot Grid share one framework: only `shade()` and a
  few numbers differ), tom_ui Animated Gradient, Aceternity Aurora, prompt-kit
  Response Stream, Reasoning Text, Streaming Text + citations, motion.dev Copy
  button, Message Scroller. Their own easing/spring values are often missing from
  the payload — we used the house curve.
- **Mobbin MCP**: web flows for ChatGPT/Claude/Perplexity/Notion/Linear/
  Cursor/HubSpot etc. Digest and recommendations: `docs/research/mobbin-patterns.md`.
- Ask motion spec distilled from 21st.dev: `docs/research/ask-motion-spec-21st.md`.

## Decisions, and what is still open

- Settings column is 760px, not 688: three parts per row need it.
- No chat bubbles in Ask: the question is the heading, the answer a card.
- Per-word blur reveals were rejected for performance on reception PCs; a
  smoothing hook releases whole words, never splitting bold/links/table rows.
- Thumbs-down reasons take two clicks (thumbs, then reason) instead of one.
- Restored "Log questions asked on this computer" under the Settings card (the
  right-hand column that held it was removed in ef6ed4d, orphaning the opt-out).
- **Open**: Ask's opening screen on phones keeps the field at the foot (does not
  match Referrals' top heading) — unchanged pending a decision. Rota shares the
  dock CSS and now takes the phone dock at 700px too. Still not restyled in Ask:
  GuideCard, SuggestBubble, UnresolvedPanel (rare/older paths); no follow-up
  suggestions (the server provides none). Notes: `page.js` is ~2,600 lines and the
  tree redraws per editor keystroke; leave-time save is limited to ~60KB
  (keepalive); a phone submenu stacks a second sheet.
