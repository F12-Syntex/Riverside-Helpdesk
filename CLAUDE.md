# Project rules — Riverside Helpdesk

## Git workflow (always)

At the **end of every turn** (each time the user sends a message and I finish the
work for it), I must:

1. Stage all changes (`git add -A`).
2. Commit using **Conventional Commits** — a `type: summary` subject line, where
   `type` is one of:
   - `feat` — a new feature or user-facing capability
   - `fix` — a bug fix
   - `chore` — tooling, deps, config, or housekeeping
   - `docs` — documentation only
   - `refactor` — code change that neither fixes a bug nor adds a feature
   - `style` — formatting / whitespace, no behaviour change
   - `test` — adding or fixing tests
   - `perf` — performance improvement
3. Push to `origin` on the current branch.
4. Merge the working branch straight into `main` (fast-forward) and push it —
   no pull requests.

Group unrelated changes into separate commits with the appropriate type rather
than one mixed commit. Keep the subject in the imperative mood and under ~72
characters; add a body when the change needs explanation.

If there are no changes to commit, skip the commit/push for that turn.

## Versioning (every commit)

`package.json`'s `version` is **bumped by hand in the same commit** as the
change it describes. Never a separate "bump" commit — a version that arrives
after the change it names is a version that was wrong for a while.

The bump follows the commit type, so it is arithmetic rather than judgement:

| Commit type | Moves |
| --- | --- |
| `feat` | the **minor** — `1.24.1` → `1.25.0` |
| anything else (`fix`, `docs`, `refactor`, `style`, `test`, `perf`, `chore`) | the **patch** — `1.24.1` → `1.24.2` |
| any type with `!` after it (`feat!:`), meaning a broken contract | the **major** — `1.24.1` → `2.0.0` |

When a turn produces several commits, each one bumps in its own turn, in order.

`VERSIONS.md` is the table of every commit and the version it produced. It is
generated, never hand-edited: run `npm run versions` after committing, which
rewrites it from the git history and checks `package.json` agrees with the tip.
The newest commit is always missing its own row until the next run, because the
file is written before the commit containing it exists.

The version is shown to staff at the foot of the tools menu in the top bar
on every page (`lib/version.mjs`, rendered by `app/_components/AppShell.jsx`),
with the commit hash beside it in the tooltip.

Never commit secrets. `.env.local` is git-ignored and must stay that way; use
`.env.local.example` for documenting required variables.

## Project notes

- Next.js (App Router) app implementing the Riverside Practice Q&A reception
  assistant. AI answers go through OpenRouter via `app/api/agent/route.js`, using
  `OPENROUTER_API_KEY` from `.env.local`. The MODEL is not an environment
  variable: it is stored in Postgres (`app_settings`, see `lib/settings.js`) and
  changed at `/settings`, defaulting to `google/gemini-3.5-flash-lite`.
- The five tools in the bar are Referrals (`/`), Ask (`/ask`), Contacts
  (`/lookup`), Notes (`/notebook`) and Settings (`/settings`). Everything else is
  off the navigation (see the comments in `app/_components/AppShell.jsx`).
- The "theme" is which **background** is drawn (8 from 21st.dev), never a colour:
  the palette is always Mist. See `docs/DESIGN.md` §6.

## Docs map

- `docs/DESIGN.md` — the design language (tokens, type, shared classes, page
  scaffold, backgrounds, per-tool notes, accessibility rules). **Read before any
  UI work.**
- `docs/LESSONS.md` — traps hit, the review process, the testing recipe, the
  commit trail and open decisions from the design-consistency pass.
- `docs/research/` — the 21st.dev ask-motion spec and the Mobbin pattern digest.
- `ARCHITECTURE.md`, `README.md`, `explained.md` — how the system fits together.

## UI work rules

Referrals (`app/_components/ReferralsPage.jsx`) is the reference page; match it.

1. Use the shared `rv-` classes and `--rv-*` tokens at the end/top of
   `app/globals.css`; add to them rather than copying. No new hex colours.
2. A page draws **no background** of its own (`PageBackground` does, once), has
   `riva-page-fill`, never uses `100vh`, and never scrolls the window.
3. Text colour: `--rv-ink` / `--rv-ink-2` only for anything people read. Never
   `--rv-ink-3` for small text.
4. One phone breakpoint: **700px**. 44px touch targets there. Support
   `prefers-reduced-motion` (`<MotionConfig reducedMotion="user">`).
5. Every data surface needs loading, empty, no-results and error states (the
   `rv-state` pattern, with a way out). No raw red error text.
6. Forms: validate on blur and submit, `aria-invalid` + `aria-describedby`
   message, focus the first invalid field, confirm destructive actions in the
   shared dialog naming what goes, guard unsaved work.
7. When a control removes itself, move focus to a sensible neighbour; Esc in a
   popover closes only that popover and returns focus to its opener.
8. Animate with `motion/react` **or** CSS on a given element, not both: a CSS
   `animation … both` overrides motion's inline styles. No transforms on
   ancestors of the fixed dock or bottom sheets.
9. Any new input must override the global yellow `input:focus-visible` outline.
10. Update `docs/DESIGN.md` in the same commit when you change the language.

## Verifying UI changes

- `npm test` must stay all-pass. Put testable logic in `.mjs` modules with tests.
- Drive the real app with Playwright and **look at screenshots** (desktop 1280×800,
  phone 390×844, and 768/700/701 widths for layout changes); for motion, record
  video and inspect frames. The recipe (launch args, mocks, no-database
  behaviour, `waitUntil:'load'`) is in `docs/LESSONS.md`.
- Run a production build in a throwaway worktree, not the dev directory.
- For a substantial change, have a second agent try to *refute* your findings
  before you trust them, and re-run its repro after fixing.

## Working with several agents in one tree

Give each agent a disjoint set of files and say the lead commits. Re-read a
shared file (`globals.css`) immediately before editing it, with small exact
replacements. Commit per page, staging by path; for hunks in a shared file stage
a blob built from `git show HEAD:<file>` plus only your edits. The stop-hook
warning about uncommitted files is expected while agents are still running.
Run `git fetch --unshallow` if `npm run versions` complains about history.
