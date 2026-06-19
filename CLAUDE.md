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

Group unrelated changes into separate commits with the appropriate type rather
than one mixed commit. Keep the subject in the imperative mood and under ~72
characters; add a body when the change needs explanation.

If there are no changes to commit, skip the commit/push for that turn.

Never commit secrets. `.env.local` is git-ignored and must stay that way; use
`.env.local.example` for documenting required variables.

## Project notes

- Next.js (App Router) app implementing the Riverside Practice Q&A reception
  assistant. AI answers go through OpenRouter via `app/api/ask/route.js`, using
  `OPENROUTER_API_KEY` and `OPENROUTER_AI_MODEL` from `.env.local`.
