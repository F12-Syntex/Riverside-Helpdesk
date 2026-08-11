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

The version is shown to staff in the bottom right of every page
(`lib/version.mjs`), with the commit hash beside it in the tooltip.

Never commit secrets. `.env.local` is git-ignored and must stay that way; use
`.env.local.example` for documenting required variables.

## Project notes

- Next.js (App Router) app implementing the Riverside Practice Q&A reception
  assistant. AI answers go through OpenRouter via `app/api/ask/route.js`, using
  `OPENROUTER_API_KEY` from `.env.local`. The MODEL is not an environment
  variable: it is stored in Postgres (`app_settings`, see `lib/settings.js`) and
  changed at `/settings`, defaulting to `google/gemini-3.5-flash-lite`.
