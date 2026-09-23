# What the router measured

The numbers `evals/routing/bench-pages.mjs` produced against
`evals/routing/pages.md` (52 cases, 43 of them real staff questions taken
verbatim from `question_log`), five repeats, 260 routed turns per run. Written
2026-09-18, against the live Notebook with 1,735 trigger phrases over all 132
non-empty pages.

## At the thresholds now stored

`routing_hit_cos` 0.88 · `routing_ask_cos` 0.85 · `routing_min_margin` 0.10 ·
`routing_enabled` **0**

| | |
| --- | --- |
| Answered straight from a page, correctly | 5.8% |
| **Wrong page rendered** | **0%** |
| Asked which was meant | 9.6% |
| Asked without the right page among the options | 0% |
| Fell through to the picker, behaving exactly as before | 84.6% |
| Mean time to a decision | 349 ms |

All eight cases that expect NO page fell through on all five repeats, which is
the guard against a router that answers everything.

## Why these three numbers

At the shipped defaults (0.82 / 0.70 / 0.05) the same set gave 11.5% answered,
**1.9% wrong**, 13.5% asked, 73.1% fall-through. The 1.9% was one case,
rendered identically on all five repeats: confidence 0.879, margin 0.078.

Re-deciding the recorded runs across a grid, every setting with a clear-lead
bar of 0.08 or more removed it. That is a knife edge — the lowest margin among
the CORRECT answers was 0.074 — so the separation between a right and a wrong
render is not established by this data. The stored values exclude that case on
**both** axes (0.879 below 0.88, 0.078 below 0.10) rather than on the margin
alone, and buy that with roughly four points of instant answers.

Raising the ask bar from 0.70 to 0.85 is the other deliberate choice. An
ambiguous card is not free: it replaces an answer the picker would otherwise
have given with a question. At 0.70 a quarter of turns became questions; at
0.85 it is one in ten, and the rest fall through to exactly today's behaviour.

## What these numbers do not say

- **The thresholds were tuned on the set that measures them.** 0% wrong is
  therefore optimistic. A second, unseen set would be worth more than another
  repeat of this one.
- **There is no baseline for the picker.** Nothing here says whether the turns
  the router converts into a question would have been answered correctly by the
  existing `SELECTION_SCHEMA` call. Until that is measured, "the router is
  better than today" is unproven for the 9.6%; it is only proven for the 5.8%,
  which are instant, verbatim and cost no model call.
- 52 cases is enough to see a rate and not enough to trust its third digit.

Re-run after any change to the trigger index, the phrases, or the thresholds:

```
node evals/routing/bench-pages.mjs report.json --repeats 5
```
## The picker baseline — now evals/answer/bench-answer.mjs

`bench-picker.mjs` measured a picker that no longer exists: commit b630002 moved
the agent to one call, and the grounded-answer change after it made that call
return a CHOICE of pages and quotes, checked in code, instead of prose. Its
successor is `evals/answer/bench-answer.mjs`, which runs the endpoint's own
selection call and checks over the same cases:

```
node evals/answer/bench-answer.mjs report.json --repeats 5 --skip-unresolved
```

Its `wrong` and `answeredAnyway` rates are the numbers to hold the router
against before turning it on. No full run is recorded yet.
