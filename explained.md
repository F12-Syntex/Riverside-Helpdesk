# How the bot answers — explained simply

The bot never knows anything on its own. Every answer is built fresh from the
practice's own documents. It works in two steps.

## Step 1 — Find the right text (the search)

- Ahead of time, every practice document is cut into small chunks and turned
  into a list of numbers (an "embedding") that captures its meaning. These are
  saved to disk once.
- When someone asks a question, we turn *the question* into the same kind of
  numbers and compare it against every chunk to find the closest matches
  (cosine similarity). We keep the top 5.
- Repeated/near-identical chunks are merged so the same fact doesn't fill up
  all 5 slots.
- For follow-ups like "how is this done?", a small cheap model first rewrites
  the question into a full standalone search ("how is a smear test done?") so
  the search looks in the right place.

This step is **exact and 1:1**: every match points straight back to a real
passage in a real document. There is no training and nothing that can drift —
that's the whole point. The data is small and changes whenever a policy is
updated, and every answer has to be traceable to a source, so a deterministic
search beats a trained model here.

## Step 2 — Word the answer (the LLM)

- The 5 found passages are handed to the LLM as numbered **Sources**.
- The LLM is **not allowed to use its own knowledge**. It can only answer from
  those Sources. If they don't cover the question, it must decline.
- For every sentence it writes, it must (a) say which Source it came from and
  (b) copy the exact words from that Source that prove it.
- Back on the server, we **check** that the quote really appears in that
  Source. If the LLM picked the wrong Source number, we fix it. If no quote
  checks out, we fall back instead of letting it make something up.

## Why it's built this way

The LLM is **not** the source of truth — it's just a **phraser**. The truth
lives entirely in the search step, which is exact and auditable. So:

- The search handles the part that must be **accurate** (finding the right
  document text).
- The LLM only handles the part that must be **readable** (wording it nicely in
  plain NHS English).
- A verification check sits between them, so the LLM can't drift away from the
  real document.

**In one line:** a deterministic search finds the exact document passage, and
the LLM is only allowed to rephrase it — with every sentence checked back
against a word-for-word quote. No training, no guessing, fully traceable.

## Triage — same engine, different job (and the bot picks which)

There's no mode switch. The bot reads each message and decides for itself
whether it's a staff **how-to question** or an **incoming patient request** to
route (for example an Accurx online consultation — usually first-person, often
with prompts like "Describe the problem", "How long", "Have you tried
anything"). It returns a `kind` of `"answer"` or `"triage"` and the UI shows the
matching card.

For a patient request it hands back **action notes**: an urgency band (emergency
/ urgent / routine / self-care / unclear), the actions to take, who to route the
request to, safety-net red flags, and an optional draft reply to the patient.

It uses the **exact same two steps** as above — search the practice's documents,
then let the LLM word the answer — and the **same verification**: every action
and every red flag must quote the document that backs it, checked on the server.
The only differences are the instructions given to the LLM:

- It is doing **care navigation / routing**, not clinical assessment. It applies
  the practice's own triage, duty-doctor and signposting rules; it never
  diagnoses or gives medical advice.
- If the documents don't settle how to route a request, it doesn't guess — it
  marks the urgency **unclear** and says to escalate to the duty doctor.
- A possible emergency (chest pain, breathing difficulty, stroke signs, etc.)
  is flagged **emergency** with call-999 / alert-a-clinician as the first action.

As more triage and signposting documents are added to the knowledge base, the
notes get richer automatically — there is nothing to retrain.

## Supplementary context — your own notes, applied live

The knowledge base (`rag/sources/`) is embedded ahead of time, so changing it
means re-ingesting and redeploying. For guidance you tweak often — "sore throat →
Pharmacy First", who covers duty this week, local signposting — there's a second
channel that is read **at request time** instead: **supplementary context**.

It can come from three places (all optional):

- **OneNote** — pages from your notebook, fetched through the Microsoft Graph API
  using a one-time refresh token. Edit a page in OneNote and the next request
  (after a short cache, default 5 minutes) uses it. No redeploy.
- **URLs** — any direct text/markdown links you configure.
- **`rag/context/`** — committed baseline notes (these do need a redeploy).

Whatever is gathered is split into chunks; **short notes are treated as standing
instructions and always applied**, while **longer notes are matched to the
request** so a big notebook stays affordable. The selected chunks are added as
extra numbered **Sources**, so they go through the *exact same* quote check as
everything else: the model has to quote your note, and the server verifies it.
Your instructions influence the answer, but they can't be silently invented —
each one shows up as a citation ("Practice note: …") you can open and read.

Setup lives in `rag/context/README.md` and `scripts/onenote-auth.mjs`.
