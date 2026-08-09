# Answer pipeline redesign — analysis and design notes

Working document. Written 2026-08-09, before any code was changed. Captures how
the answer pipeline works today, why it is being replaced, and the design of the
router-and-templates system that replaces it.

Nothing here is built yet.

---

## Part 1 — How the current system works

### Entry point

The chat calls `POST /api/agent` (`lib/ai/agent-client.js`), which streams
newline-delimited JSON: `status`, `tool-start`, `tool-result`, `answer`, `error`.

`POST /api/ask` still exists but is no longer the main path. The agent delegates
to it for exactly two message shapes: a pasted medical document to file, and an
incoming patient request to triage. Every staff question goes through the agent.

### The turn, in order — `app/api/agent/route.js`

**0. Answer cache** (before anything else, `route.js:177-194`)

- `lib/answer-cache/match.mjs` normalises the question (lower case, strip
  greetings, openers, sign-offs, punctuation) and hashes it. Exact key hit is
  served immediately.
- On a miss, the question is embedded once and matched by cosine distance
  against stored questions. Threshold **0.92** (`store.js:94`).
- A row is only served when the model, the Notebook fingerprint
  (`lib/notebook.js:232`) and the age (< 30 days) all still hold.
- Never cached: anything with images, anything with conversation history
  (follow-ups), questions over 400 characters, unanswerable answers.
- A hit returns as a single `answer` event carrying `payload.cache`.

**0b. Context load** (`route.js:198-218`)

- **Every** non-empty Notebook page, in full, every turn (`fullNotebookContext`).
  Not ranked, not chunked, not selected.
- Plus supplementary context: text files under `rag/context/` and any URLs in
  `SUPPLEMENTARY_CONTEXT_URLS` (`lib/ai/context.mjs`).
- Notebook unavailable is a hard 503. No answer is produced without it.

**1. Research loop** — `lib/agent/tools.mjs`, runs on the **fast** model role,
capped at **6 steps** (`route.js:58`), temperature 0.2, extended reasoning off.

System prompt at `route.js:60-79`. Every tool takes a list so one step can ask
for several things.

| Tool | What it reaches |
| --- | --- |
| `search_practice` | Three channels merged. Documents via Postgres full-text only — `searchKnowledge(q, n, {kind:'document'})` runs with `semantic:false`, so **no vectors on this path** (`lib/knowledge.js:438`). Notebook pages scored in memory by a hand-rolled lexical score (`tools.mjs:99`). EMIS guides scored on text plus author-supplied keywords. Notebook leads the merged ordering. 1600-character excerpts. |
| `list_practice_sources` | The whole catalogue with one-line summaries |
| `outline_practice_sources` | A document's headings and part sizes, no text |
| `open_practice_sources` | Notebook page or guide whole (12k cap); a document one 6k part at a time; parsed parts cached across calls and turns |
| `search_web` / `read_web_page` | Only after practice material has been tried; a practice search is forced first if the evidence registry is empty (`tools.mjs:596`) |
| `find_contact` | Practice directory, then CQC register, then reads a web page and lifts the number off it. No digit is ever model-authored. |
| `check_rota` | The saved rota grid from Postgres |
| `suggest_ers_referral_route` | SNOMED match against the e-RS referral-types list |

Every tool hit is registered in the **evidence registry**
(`lib/agent/evidence.mjs`) as `P1`, `P2`, … or `W1`, `W2`, …. Nothing else can
become a source.

Escalation: if the fast model called **zero** tools, or errored, the entire loop
re-runs on the reasoning model (`lib/agent/research-model.mjs:49`).

**2. Selection** — `lib/agent/select.mjs`. The writer sees at most 8 sources and
24,000 characters, ranked by lexical score with a +1.5 bonus for Notebook and
guide sources. Dropped sources stay in the evidence registry so quotes still
validate against them; they are simply not shown to the writer.

**3. Compose** — `lib/agent/compose.mjs`, **always** the reasoning model.
`generateObject` against `AnswerSchema` (`compose.mjs:43`): `keyPoints`,
`sections{heading, markdown, basis, ref, quote, critical}`, `referralRoute` (the
four e-RS fields), `followUps`, `clarify`, `gaps`, `message`, `tip`.

The rules block at `compose.mjs:180-222` is the largest single influence on
answer shape and voice.

**4. Validate, plus one repair** — `validateDraft` (`compose.mjs:389`)

- A practice section survives only if its quote matches a registered passage at
  containment ≥ 0.5 (`evidence.mjs:85`). Only full containment is shown to the
  reader as a quotation. The model's claimed ref is a tiebreak, not authority.
- A web section needs a `W` reference a real search returned.
- Key points are dropped unless the section they summarise survived.
- At most one critical section and one critical key point.
- Structure defects (`structureProblems`), referral defects
  (`referralProblems`), and the conditional-clinic-type check.
- Only `mustFix` defects (an unverified claim, or a referral that would go to the
  wrong place) buy a repair call, with a 15 second timeout. Layout defects ride
  along if a repair happens anyway but never trigger one. Anything still failing
  is dropped. Everything dropped becomes an honest "I could not find this".

**5. Post-processing** (`route.js:496-563`) — redact any phone number not vouched
for by the directory, a returned source, or `find_contact`; dedupe source images
and citations; resolve the e-RS route provenance (`determineReferralRoute`); emit
the `answer` event; then write the answer to the cache.

### Where answer quality is actually decided today

1. **Retrieval is keyword-only on the agent path.** Documents by Postgres
   `tsquery`, Notebook and guides by a hand-rolled `lexicalScore`. No embeddings
   anywhere except the answer-cache lookup. The research prompt literally warns
   the model that "it is a word search".
2. **The Notebook is loaded whole every turn**, so its coverage dominates.
   Documents are only reached if the model chooses to search or open them within
   six steps.
3. **The compose prompt** is the biggest lever on voice and shape.
4. **The verbatim-quote gate** is a hard constraint on what can be said.
5. **The 6-step loop and the 8-source / 24k selection cap** bound how much the
   writer ever sees.

---

## Part 2 — Why it is being replaced

The diagnosis: this is a **routing** problem that was built as a **generation**
problem. Staff questions are a small closed set asked repeatedly. Free-form RAG
generation over a closed set pays LLM latency and variance tax for what is
effectively a lookup.

Specific failures:

- **Too slow.** Six research steps, a structured write, a validation pass and a
  possible repair.
- **Quality is capped by the corpus.** The answer can never be better than the
  passage it is allowed to quote.
- **Output is inconsistent.** Same question, different words, different answer
  shape.
- **Too long to read.** Staff do not read most of what is produced.
- **Misunderstands intent** often enough to matter.
- **Costs too much**, and the cost is dominated by output tokens on the most
  expensive model in the configuration.

---

## Part 3 — The proposed system

The model stops writing the answer and starts **picking** one. It emits a routing
decision, not prose. The answer itself is a human-authored template rendered
deterministically.

Why quality goes **up** on a cheaper model: picking is easy, writing is hard. A
human-authored template beats anything a reasoning model produces from a policy
passage under a quote constraint.

Why it is dramatically faster: output tokens dominate latency. Emitting
`referral("suspected skin cancer")` instead of 1200 tokens of prose is the
difference.

Why consistency becomes free: same intent, byte-identical answer. Diffable,
testable, reviewable. In a GP practice a human-approved answer is defensible in a
way a generated one is not.

**The pattern already exists in the codebase.** The e-RS lookup plus
`determineReferralRoute` plus the referral card is a deterministic answer with
provenance sitting inside a generative pipeline. The redesign makes that the rule
rather than the exception. A referral the templates do not cover can still be
answered from the deterministic e-RS estimate, rendered differently so the reader
can see it is a match rather than a recorded fact.

### The key amendment: templates in front of the agent, not instead of it

- **Covered intent** → instant deterministic answer. Cheap, consistent. The
  bulk of traffic.
- **Uncovered** → fall back to the current agent pipeline. Slow, but staff still
  get an answer. Log it.
- The fallback log **is** the authoring backlog, ranked by real frequency.

A slow answer beats no answer, and the fallback doubles as the discovery
mechanism for what to build next. This also removes the coverage gate on launch.

### Guard rail: no DSL

A DSL is a mini language invented for one job. The trap here: templates start as
`{{practice_name}}`, then need `{{#if urgent}}`, then loops, then includes, then
a way to call the e-RS lookup mid-render. That is an untested programming
language with no debugger, written in markdown, that only one person can read —
the complexity deleted from the pipeline, reappearing in the template store.

**Rule: templates hold text and named slots, nothing else.** All logic runs in
JS and is resolved before render. A template that needs a branch is two
templates and a decision made upstream.

---

## Part 4 — The router

### Split the decision three ways

The current system misunderstands users because it makes one blurry decision.
Make three sharp ones:

1. **Shape** — question / pasted document / patient request / follow-up
2. **Intent** — which entry answers it
3. **Slots** — the parameters (which condition, which site, which day)

Slot ambiguity must never break intent routing. "Refer for a knee problem" is a
*confident* referral intent with an unresolved slot. Today those collapse
together and produce a hedge.

### Retrieval, not classification

**Do not build an N-way classifier.** No prompt listing every intent, no
fine-tuning. Each intent owns a set of labelled trigger phrases. Embed once,
store. A question is embedded and matched against triggers to produce ranked
candidate intents.

Adding a topic is inserting rows. No retraining, no growing prompt, no accuracy
cliff at scale. Classification-as-prompt does not survive a few hundred intents;
classification-as-retrieval does.

### Escalation ladder, cheap to expensive

1. **Normalised exact match.** Reuse `normaliseQuestion` from the answer cache.
   Free, instant. Most repeat questions end here.
2. **Lexical** (Postgres `tsvector`, already in the codebase) over triggers and
   entry text. Non-negotiable in this domain: embeddings blur rare tokens and
   this domain *is* rare tokens — Med3, 2WW, GP2GP, Docman, EMIS, Accurx, e-RS.
   Vectors alone will miss them.
3. **Embedding kNN** over trigger phrases. Catches paraphrase: "sick note" →
   "fit note", "smear" → "cervical screening".
4. **Fuse 2 and 3** by reciprocal rank fusion. Already written —
   `searchKnowledge` uses `1/(60+rank)`. Same pattern, same tuning.
5. **LLM tiebreak, only when the fused top two are close.** Hand a small model
   three to five candidate intents as one-line descriptions; it picks one or says
   none. Roughly 200 tokens in, 5 out. Fires only on the ambiguous minority, so
   it barely moves the median.

Cost is a step function that most queries never climb.

### Decision policy

Argmax is not a policy. Explicit behaviour per band:

- **High score, wide margin** → answer.
- **High score, narrow margin** → clarify card. "Did you mean X or Y?" Two taps.
  This is a feature: faster than a wrong answer, and the tap yields a free
  labelled example.
- **Low score** → no match. Fall back to the agent, log it.

Calibrate the thresholds against a real question set. Do not pick numbers by
feel.

### Complex queries, by type

- **Compound.** "How do I refer for suspected skin cancer and who chases it?" is
  two intents. The router returns a **set**, not a winner, and both template
  blocks render into one answer. This works only because templates are logic-free
  and compose by concatenation — the reason to hold that line.
- **Slot-laden.** Intent confident, parameter unknown. Slot filling is a separate
  step and often not an LLM at all: for referrals it is the existing SNOMED /
  e-RS matcher, deterministic and instant.
- **Follow-ups.** "And if they refuse?" carries no content. The previous intent
  becomes a strong prior, and each topic declares its own follow-up intents.
  Route within that set first. Better than `buildSearchQuery`'s current trick of
  gluing the previous question onto the front.
- **Near-miss pairs.** "Report a data breach" versus "report a significant
  event" sit almost on top of each other in embedding space. This is where the
  lexical signal and margin-based clarify earn their place. For each intent,
  list the intents it must **not** be confused with and put those pairs in the
  test set.
- **Out of domain.** Fall back, log, do not fake it.

### Why this beats the current system, structurally

**Routing is measurable. Answer quality is not.**

Build a fixture of question → expected intent. Every logged gap gets labelled and
added. Run it on every change. Track accuracy, misroute rate, abstain rate and
coverage.

Today an improvement can only be eyeballed. With a router it is a number, and a
regression is visible before it ships. That is a bigger win than the latency.

Log every routing decision with its candidate scores. A misroute is then fixed by
**adding a trigger phrase** — a data edit, not a deploy.

### Where trigger phrases come from

Not from imagination. `audit_events` already stores staff question text verbatim
for `/api/ask` and `/api/agent` (see `ARCHITECTURE.md:280`). Mine it. Real
phrasings beat invented ones, and frequency tells you which intents to build
first.

### Latency budget

- Exact hit: ~0 ms
- Fused lexical + vector: one embedding call plus one query, roughly 100–200 ms
- Tiebreak: roughly +300 ms, on a minority of queries

Sub-half-second to a routing decision, then rendering is instant. Against
today's six research steps, a write, a validation pass and a possible repair.

---

## Part 5 — Risks to hold in view

1. **The work moves, it does not vanish.** Curation becomes a standing job. The
   upside is that it is the right kind of work: versionable, reviewable, ownable
   by practice staff, no model in the loop.
2. **Misclassification is the new failure mode, and it is nastier.** A wrong
   template looks complete and authoritative — no hedging, no gaps section to tip
   the reader off. Today a wrong answer at least looks thin. Mitigate with a
   confidence floor, showing the matched topic by name, a cheap "not what you
   meant?" affordance, and the clarify card when the top two are close.
3. **A coverage cliff kills adoption.** Three "cannot answer that" replies and
   staff stop asking. The agent fallback is the mitigation; the gap log only
   works if someone actually works it.
4. **Follow-ups, pasted documents, images and novel combinations are not a
   closed set.** They stay on the agent path.

## Part 6 — Things deliberately deferred

- Intent hierarchies and namespacing. A flat set is fine to a few hundred
  intents. Add structure when the logs demand it, not before.
- Any template feature beyond text plus named slots.
