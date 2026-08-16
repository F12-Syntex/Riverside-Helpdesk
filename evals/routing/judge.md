# The routing evaluation — instructions for the judging agent

You are marking the assistant's routing. You are **not** fixing it, and you must
not change anything under `lib/`, `app/` or `test/`.

## Why the job is split in two

The agent that changes the routing code **must never see these cases**. If it
did, the cheapest way to pass would be to write code about the cases: a phrase
added to a list, a branch for one presentation. The evaluation goes green while
the system gets worse — more rules, each right about one message and blind to
the next one written slightly differently. That is the difference between a
system that routes and a system that remembers.

So: you read the cases, you run the message through the real pipeline, you judge
what comes back, and you report **what was wrong and why** — in terms of the
patient's message and the practice's routes. Never "add X to the list". Never a
patch.

## What to do

1. Read `evals/routing/cases.md`. It holds the messages and the answer each one
   should get.
2. For each case, write just the pasted message to a temporary file, then run:

   ```
   node evals/routing/run.mjs <that-file> --read
   ```

   `--read` makes the same single model call `/accurx` makes. Without
   `OPENROUTER_API_KEY` it reports the pattern cascade alone and says so — say so
   in your report too, because half the system was not exercised.

   `evals/routing/cases-hard.md` holds twelve harder cases, each recording the
   wrong answer it is built to attract. Their messages are already written out
   one per file in `evals/routing/messages/`, so they run straight through.

   **NEVER JUDGE A ROUTE ON ONE PASS.** temperature 0 is not determinism. The
   same twelve messages, on a prompt proved byte-identical by its token count,
   scored 8/12 and then 5/12 on consecutive runs. For any claim about routing —
   "this got better", "that regressed", "the prompt change helped" — use

   ```
   node evals/routing/bench.mjs report.json --repeats 5
   ```

   which runs every case five times and reports each as `hits/of` with the spread
   of answers it actually gave, so a case that is right three times in five
   cannot be written up as right. Two prompt rules were adopted and then reverted
   here on the strength of single passes before anyone noticed. Token counts and
   latency are stable enough to read from one pass; routes are not.

3. Compare what came back with what the case expects. The JSON gives you:

   | field | what it is |
   | --- | --- |
   | `patternsDestination` | where the deterministic cascade alone put it |
   | `destination` | where the card actually sends them |
   | `reading.reasoning` | the account the model gave BEFORE it named anywhere |
   | `reading.ruledOut` | what it considered and turned down, with reasons |
   | `alerts` | what the safety scanners found anywhere in the message |
   | `card` | the whole card, as the receptionist reads it |

## What counts as a failure

Judge the whole card, not just the destination string:

- **Wrong destination.** Say which route it should have been, and which sentence
  in the message decides that.
- **Right destination, wrong reasoning.** A card that arrives somewhere correct
  by an argument that is false — "self-care has failed" when the patient said it
  worked — is a failure, and a worse one than a wrong route: the false step
  generalises to messages where it routes badly.
- **Something in the message that no part of the card reflects.** A possible
  pregnancy, a symptom the patient ruled out, a request nobody answered. Quote
  the words that were dropped.
- **Safety content belonging to a different route.** A checklist arrives
  attached to whichever route was picked; on a wrong route it reads as
  reassurance and produces confident harm.
- **A claim the card cannot support.** An age range asserted about a patient
  whose age nobody knows. A treatment described as failed that was not.

## The report

Write `evals/routing/report.md`, and give the same thing as your final message:

- One line per case: `PASS` / `FAIL`, the case name, expected vs actual route.
- For each failure: what the card said, what it should have said, and **the words
  in the message that decide it**.
- A section called **Patterns across failures** — the shape of what is going
  wrong, not a list of fixes. "Negation is not read anywhere" is useful; "add
  'no back pain' to an exclusion list" is the kind of instruction that got the
  system into this state.
- Finally: which failures are safety-relevant and which are merely wrong. They
  get fixed in that order.

Do not propose code. Do not name functions or files to change. Describe what the
system got wrong about the patient.
