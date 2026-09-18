# Page routing — the golden set

Staff questions and the Notebook page each one should reach. This is what
`evals/routing/bench-pages.mjs` marks the router against, and it is the only
thing that lets a reliability claim be made about the router at all.

**Nobody who changes `lib/routing/` writes cases here.** `judge.md` explains
why: an agent that can see the cases will pass them by remembering them, and
the router will get worse at everything that is not on this list. The judging
agent labels; the routing agent measures.

## Where the cases come from

1. Pull real questions from `question_log` (and `audit_events` for the older
   ones) — both store the staff question verbatim. Prefer the ones whose
   outcome was `prose`: those are the wording that fell through.
2. Label each with the Notebook page it should have reached, by the page's
   `docId` (`note:<id>`, as `fullNotebookContext()` reports it) or by the
   page's exact path (`Referrals / Dermatology`). Around fifty is enough to
   see a rate; a dozen is not.
3. A question the Notebook genuinely does not cover is a case too: its
   expected page is `none`, and the router must fall through on it.

## Format

One case per heading. The heading is the question, exactly as typed. The
line after it names the page. Anything else under the heading is a note for
the reader and is ignored by the bench.

```
## 1. how do i do a smear

**Expected page:** Screening / Cervical screening
The word on the page is "cervical screening"; nobody at the desk says it.
```

Run:

```
node evals/routing/bench-pages.mjs report.json --repeats 5
node evals/routing/bench-pages.mjs report.json --repeats 5 --hit 0.85 --ask 0.7 --margin 0.2
```

---

<!-- Cases go below this line. None yet: labelling belongs to the judging
     session, not to the one that built the router. -->