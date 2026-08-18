# Riverside Practice Q&A

A document-grounded reception Q&A assistant for The Riverside Practice. Staff ask
how to do something in EMIS Web (or what to do at the front desk) and get a
step-by-step answer drawn strictly from the practice's own documents, with
clickable sources they can open in-browser.

## How it works

- Questions go to `POST /api/agent`, routed through **OpenRouter**. It is **one
  model call, not a research loop**: the model reads the message, chooses the
  template that fits it and fills that template's variables — and the answer is
  then the template, rendered in code from the values it returned. Understanding
  a message is what a model is good at, so it does that; the shape of what comes
  out is what a model is unreliable at, so code does that. The API key and
  server-side knowledge never reach the browser.
- **The Notebook is a template too.** It arrives as a list of page titles and the
  model returns a title; the page is then rendered from the database exactly as
  the practice wrote it. So even open-ended questions come back as a variable
  filled in rather than prose the model composed — the same answer every time,
  about ten output tokens, and no way for a procedure to be paraphrased on its
  way to somebody following it.
- **The tool-calling loop this replaced is gone**, along with
  `lib/agent/tools.mjs` and the `search_practice` / `find_contact` /
  `suggest_ers_referral_route` tools it carried. `ANSWER-PIPELINE-REDESIGN.md`
  records how it used to work and why. Parts of this file and of
  `ARCHITECTURE.md` still describe the loop and have not been rewritten yet —
  where the two disagree, `app/api/agent/route.js` is what runs.
- **A contact question is answered with a contact.** The practice directory and
  the CQC register are matched in code (`lib/contacts.fuzzy.mjs`,
  `lib/lookup/`), and what they hold is shown in the contacts card as structured
  data — never retyped through the model's prose, where an unverified number is
  stripped out.
- **The turn is streamed to the browser as it happens** (newline-delimited JSON),
  so the field says which step is running instead of showing a silent spinner.
- **The answer cache is deliberately unwired, not deleted** (`lib/answer-cache/`).
  With the answer now assembled in code from a page and a template rather than
  researched, there is very little left to cache. **Every turn is written down**
  instead: the question, the answer as text, the template that built it and the
  model that ran are recorded in `question_log` (`lib/questions/log.js`) and read
  back at `/stats`.
- **A message that asks for five things gets five things acknowledged.** The
  selection call returns exactly one template, which is why an eConsult listing
  a knee, a hoarse voice, a repeat prescription, a fit note and a question about
  somebody's wife came back as a single knee card with the other four gone
  without trace. That is structural, not a quality problem, so the model is
  asked for one extra thing on the same call — where each separate ask starts
  and ends, copied out verbatim — and **everything after that is decided in
  code** (`lib/safety/`):
  - **Acuity is a table, never the model's opinion.** `emergency >
    twoWeekWait > sameDay > routine > admin`, checked top down. The card that
    renders is the most urgent item the band above it has not already answered
    — not the first one, and not the longest one.
  - **The safety scanners run message-wide on every turn**, whatever template
    was chosen. The red-flag list used to run only inside triage, so a message
    answered with a Notebook page was never scanned at all. Alongside it now:
    NICE **NG12** suspected-cancer features (hoarseness over three weeks,
    unintended weight loss, dysphagia, a neck lump, haemoptysis, rectal
    bleeding, post-menopausal bleeding, a breast lump, visible haematuria),
    each reported with the words that fired it and sent to the duty doctor
    today. Naming what was seen is the whole claim — the referral decision is a
    clinician's.
  - **A request about somebody else's record is refused, in code.** A hard
    pattern rule with no model anywhere in its path, so there is nothing for one
    to be talked out of. It is a refusal, not a routing decision, and the rest
    of the message is still answered.
  - **Names and addresses never leave the browser.** A local check runs on the
    message as it is sent — regex, a forename list and a token scan, no model
    and no network (`lib/safety/identifiers.mjs`) — and a name or an address it
    finds is replaced with `[name removed]` / `[address removed]` before the
    request is built, before the transcript is written and before anything is
    saved. `/api/agent` and `/api/ask` run the same check on arrival, so the
    guard belongs to the endpoint and not just to the page. The reader is told
    what went, as a count and never as a quote. It redacts rather than blocking
    the send: making somebody retype a sentence in a hurry does not get the
    name out of the world. `Dr`, `Nurse` and `Matron` introduce a colleague, so
    those names stay, as do names in the practice directory — "which days is Dr
    Ahmed in" and "the number for Alison Wade" are the job.
  - **What cannot be redacted is refused instead** (`lib/safety/patient-data.mjs`,
    `POST /api/screen`). The local check catches the shapes it knows, and it
    knows them because they can be recognised *and removed*. An NHS number is
    ten digits and so is an order number; a date of birth is a date; "reg no
    4471982" is a hospital number at one trust and a stock code at another. No
    word list separates those, and a rule loose enough to try eats every
    ordinary question with a number in it. So those go to a model on the
    **Super speed** role — the one role a reader waits on with nothing on
    screen, which is why it is a role of its own and should be set to the
    quickest model rather than the cleverest — and a message it flags **is not
    sent at all**: no request, no transcript line, nothing saved, and a popup
    naming the *kind* to take out. The kind, never the detail: everything on
    that box is assembled in code from a fixed list, so the thing being refused
    can never end up displayed in the refusal. It screens the text **after** the
    local redaction, so it sees exactly what was already about to be sent and
    not a character more. And it **fails open** — no key, a timeout, an
    unreadable answer, and the message goes as it always did. A guard that fails
    closed is a guard that shuts the desk down when OpenRouter has a bad
    minute, with a patient standing at it.
  - **Assertions are span-local and fail toward silence.** A card may only claim
    something about the complaint it is about, and only from words inside that
    complaint's own text. The knee card claimed "over-the-counter treatment has
    already been tried and has not worked" because the pattern matched "hasn't
    shifted" four paragraphs down, describing the patient's *voice*. Every
    feature now carries the span that proved it; no span inside the complaint,
    no sentence.
  - **The unresolved items panel** lists every request beside whatever card is
    showing, each marked routed, flagged, refused or unhandled, with an
    unanswered one tappable to ask it on its own. It costs no tokens and it is
    the backstop for every rule that misses. Closing an item is explicit and
    recorded per item — and never blocks anything, because a panel that cannot
    be closed is a panel that gets ignored.
  - **Short questions are untouched.** The extra field is only requested when
    the message is over ~300 characters or carries a joining phrase ("also",
    "while I'm here"), so "how do I refer for an ECG" costs exactly what it did
    before.
  - **`/accurx` is the one exception to one-call.** It may
    issue a small structured call per decomposed request, in parallel, returning
    an enum and a label — no prose; `/accurx` additionally asks one per
    destination, also in parallel, returning a yes or a no. **Code holds the
    veto** on both: a classification may only *raise* acuity above what the
    scanners found, never lower it, a destination may only move a card to a more
    senior one, and a pass that fails or times out leaves the deterministic
    answer standing. The regex is the guarantee; the model is a recall booster.
  - **The known limit, stated plainly:** patterns miss paraphrase. "My voice
    sounds rough" will not match "hoarse". Build an eval set from the real
    `question_log` rows at `/stats` and measure recall before trusting any of
    it. The panel is what makes a miss visible rather than silent, which is why
    it was built first.
- Answers go through a **validation loop**: each section must carry a verbatim
  quote that really appears in the source it names, checked in code against what
  the tools actually returned. Failures go back to the model once with the
  specific reason, and anything still unverified is dropped rather than shown.
- Provenance is explicit. Practice-backed sections carry an openable citation;
  anything from a web page is marked "from the web" with a link and never
  presented as practice policy; whatever the practice's material does not cover
  is stated plainly, with who to ask, rather than filled in from model knowledge.
- **Which referrals go by email is read from the practice's own page, not from a
  list in the code.** `lib/templates/referrals.mjs` carries a table of recorded
  referrals with their e-RS pairings, addresses and forms — and that table is a
  *copy* of the practice's list, which had already fallen behind it. "Dietitian"
  was on the practice's emailed-referrals page and had never been typed into the
  array, so "how do I do a dietitian referral" answered "not recorded in the
  practice's notes" about a referral the practice had written down. Worse than a
  gap, because a gap is visible. Now the model names what is being referred to
  (`referralName` — extraction, which it is reliable at) and **code reads the
  Notebook**: the page has to actually be a list of emailed referrals, and the
  name has to actually appear on one of its list lines. A prose mention on an
  unrelated page is not a listing and does not count. The card quotes the line it
  found and cites the page. A referral the practice adds to its own page is
  answerable the moment they save it. A recorded e-RS pairing still wins over
  list membership, being the more specific fact.
- **Which form to open comes from PCIT's NEL Referral Tree, verbatim.** The
  practice's own material answers how a referral is *sent*; the tree answers
  *which form*. It is the protocol inside EMIS Web holding every referral form in
  North East London — 533 of them, of which 247 are on a City & Hackney practice's
  tree — and it has no search beyond Ctrl+F, so "which form for suspected skin
  cancer" was previously answered "not recorded in the practice's notes" for four
  hundred-odd forms the practice can in fact see. Now the model names what is
  being referred for and **code looks the form up** in
  `lib/referrals/nel-tree.data.json`, generated from PCIT's published article by
  `npm run data:nel-tree`. The form name is shown exactly as the tree lists it, and
  offered to copy, because it is a string somebody retypes into Ctrl+F and a name
  spelled nearly right finds nothing. Several matches are shown as several rather
  than resolved to one — "dermatology" genuinely is three forms. A form ticked for
  another borough only is *named as another borough's*, which beats silence: the
  alternative is somebody scrolling a menu for a button that was never there. The
  practice's own recorded pairings and Notebook page both still win, and a form
  the tree has nothing for still gets the honest "not recorded" card.
  **Availability is read by tick column, not by counting ticks** — the flattened
  text of the source PDF gives ticks in order but not which of the five columns
  each sat in, so "Wider determinants of health questionnaire NEL" is Newham and
  Waltham Forest and nothing in the text says so.
- **Which EMIS template records a contract is answered with the date it was true
  on.** PCIT name a contract one way and the template that records it another, and
  there are 42 of them (`lib/referrals/nel-contracts.data.json`, from the PCCIF
  mobilisation Sitrep). So "which template for the ADHD shared pathway" gets the
  template name verbatim, to copy. The build status beside it is the part that
  rots — it came off a **daily** bulletin which says of itself that the position
  changes through the week — so every card leads with **"as at 28 July 2026"**, a
  status that is not "For Release" is shown as a warning to check rather than a
  fact to repeat, and PCIT's own number is on the card so checking is one call. A
  status presented as current weeks after it was written is worse than none: it is
  fast, it looks authoritative, and it is wrong.
- **A referral the Notebook does not cover still gets a speciality and a clinic
  type.** They are determined from the practice's own e-RS referral-types export
  (via SNOMED), filled into the e-RS card, and shown with what they were
  determined from — the concept, the list, the closeness of the match and the
  other close pairings — under a heading saying they are not recorded in the
  practice's notes and must be checked against the doctor's task. **Only for a
  referral somebody is actually sending on e-RS**: a referral arriving from a
  hospital, one already sent and being chased, a waiting time or a policy that
  merely uses the word gets no e-RS card and no referral steps
  (`lib/referrals/scope.mjs`).
- **Slash commands say which card you want** rather than leaving it to be worked
  out (`lib/commands.mjs`): `/accurx` (where the patient goes and the reason
  line, from one paste), `/document` (a filing title), `/practice` (search the
  documents, no model at all), `/form` (a NEL referral form) and `/template`
  (the EMIS template that records a NEL contract). There used to be two more — `/triage`, which said
  where a patient went, and `/appt`, which wrote the reason line and the booking
  notes — and `/accurx` is both of them on one card, so they were removed rather
  than kept as half-answers beside it. A described symptom typed without any
  command still reaches the same triage card: that path never went through
  `/triage`.
- **The kind of answer is chosen under the box, not typed.** Four pills sit
  directly under the field — Q&A, Form, Template, Practice
  (`app/_components/ModeSwitch.jsx`) — each a word that can be read without
  opening anything and armed with one click, with the armed one filled. Q&A is
  one of the four rather than an absence, so the row reads as a setting rather
  than as three switches that might all be off. Two earlier controls are gone:
  a segmented track with a sliding thumb, which was machinery for a choice
  that is left alone almost every time, and a button-and-menu beside the field,
  which hid three of the four modes behind a click and took width off a
  placeholder that needs it. The row's height is declared once
  (`--riva-dock-extras`), which the dock's height, the room the page leaves at
  its foot and the opening screen's lift are all worked out from, so nothing
  had to be measured twice to make room for it.
  **`/accurx` and `/document` are
  hidden rather than withdrawn**: they are not offered by the pills or by the
  "/" list, and typing either in full still works exactly as it did, because both
  are everyday answers used by habit. The strip above the field carries only the
  send bar and the "Copied" line, and nothing was added to the header or the
  footer. Typing "/" still works and still wins over the pills, being the more
  specific thing the reader just did. **The
  choice lasts exactly one message**: a mode left armed on a shared reception PC
  would eventually answer an ordinary question out of the referral-form list, and
  the failure modes are not symmetric — a wrong `/form` says honestly that the
  list has no such entry, while a wrong `/accurx` renders a confident triage card
  with a destination and an urgency for a question that was never about a patient.
  A question asked with a pill carries **"Asked as Form"** in the transcript,
  because `/form knee` typed into the box stays in the reader's own words for ever
  and choosing the mode with a button would otherwise leave nothing on screen
  explaining which list the answer came from.
- **`/form` and `/template` answer from a list, with no model anywhere in the
  path.** The reader has already said which of the two Primary Care IT lists they
  want, and the rest of the line is the query, so the turn is a ranked string
  match against a file in this repository: no model call, no tokens, no network.
  `/form suspected skin cancer` names the referral form; `/template NEL Housebound
  Winter` takes a **template's** name and answers with the contract specification
  it sits under, which is the direction staff need — the template name is what is
  written on the task, and the specification is what the contract is called in
  every other conversation about it.
- **A command answers from its own list or says it cannot.** Neither ever falls
  through to prose. `/form fit note` says the tree has no form by that name, names
  the list it searched and how old it is, and points at asking without the command
  — which is the path that also checks the practice's own notes. A model writing
  plausibly about a form that is not on PCIT's list is the exact failure typing
  the command is meant to rule out. Asking in ordinary words is unchanged and
  still goes through the router, where falling through to prose is right.
- **`/accurx` answers both halves of an AccurX request on one card**
  (`lib/templates/accurx.mjs`): where the patient goes, and the reason line to
  copy into what gets booked. Reception reads the request once and needs both,
  so asking for them separately meant pasting the same message twice — and the
  second paste is the one that does not happen when the phone rings. Neither
  half is new: the routing is the triage card, run through the practice's own
  order top to bottom over the destinations in `lib/triage/destinations.mjs`,
  and the wording is the reason line and booking notes under the rules in
  `lib/templates/writing.mjs`. What the command decides is order. Ordinarily the destination and the reason
  line sit together at the top, because they are the two things that leave the
  card. On a card that ends in an emergency — a red flag, cauda equina, an eye
  going straight to Moorfields — the wording drops its Copy, moves below
  everything the routing card has to say, and is renamed the handover note:
  nobody is booking an appointment off "interrupt the duty doctor now". Which of
  the two it is comes from `endsInAnEmergency` in `lib/templates/triage.mjs`,
  next to the branches that produce those cards, so the two cannot drift apart.
  It decomposes a long message and runs the second pass over each request.
- **`/accurx` is read as well as matched** (`lib/templates/accurx-route.mjs`). A
  patient wrote in after a recent miscarriage: severe daily headaches, swelling
  and pain in **both** legs, shoulder pain, dizziness, bloods awaited. It came
  back as a physiotherapy appointment — and nothing was broken. "Leg pain" and
  "shoulder pain" made it musculoskeletal, "severe" made it disabling, and a
  disabling musculoskeletal problem is an FCP job. Every rule fired correctly
  and the answer was wrong, because the words were spread across four complaints
  and no regex can see that the swelling is in two legs or that "recent
  miscarriage" changes what all of it means together. That is not a tuning
  problem; another feature word finds the next gap. So the message is now
  **read** — one call, on its own model role (Settings → AccurX routing), which
  names where it goes *and* writes the reason line.
- **The reading is done against the routing guide, and nothing else.** Its prompt
  is `docs/routing.md` as data (`lib/triage/destinations.mjs`): every destination
  least-senior-first with what it covers and what it *refuses*, the practice's
  hard gates — no phlebotomy under 16, HPV to 24 and under, six weeks for travel
  jabs, health-check bloods before 1 pm — and the nurse-clinic rules.
  **The Notebook is not in front of it.** It was, and it was the wrong source for
  this one question: the Notebook is how the practice *does* things, the guide is
  where a task *goes*, and all the reading ever saw of the Notebook was a list of
  page titles to match a heading against — which is the failure mode the reading
  exists to replace. Removing it also took a database round-trip and about 3,000
  prompt tokens off the one call the receptionist waits for.
- **The reading is the only judgement, so the prompt says so.** The pattern
  cascade came off this path when it told reception to interrupt a doctor over a
  chest pain the same message said was investigated at A&E last winter and turned
  out to be reflux. Nothing now catches what the reading misses and nothing
  retires what it raises, in either direction — so it is given the guide's own
  front-page rule instead: **when you are not sure, route upward.** The card
  shows the patient's own words that decided it, checked against the message
  first. No
  model, a timeout, or "unsure" leaves the card exactly as the patterns made it.
  - **One call for the whole card.** It was ten: one per destination asking
    whether the message was theirs, plus one writing the reason line. They had
    to be asked separately because nothing described the destinations in a form
    a single prompt could be handed — each check was told about its own service
    by name and nothing else. `lib/triage/destinations.mjs` describes them now,
    so the whole ladder goes into one prompt as data and one reader sees what
    nine saw between them, at a tenth of the calls.
  - **What the reader is asked is load-bearing, and it is not "which service
    does this need".** That question broke `pt has sore throat`: a GP genuinely
    can see a sore throat, so naming one is true and wrong — it takes the
    patient off the pharmacy that would have dealt with them. It is asked for
    the **least senior** service that can safely deal with the whole message,
    and every entry on the ladder carries what it **refuses** as well as what it
    covers, because refusing is the half that decides it. The GP entry says in
    its own words that a GP appointment is not the safe default here.
  - **An eye emergency is its own destination, and it is a walk-in.** The other
    two emergency cards mean somebody in the building stands up — fetch the duty
    doctor, call 999. This one means the opposite: nobody here does anything and
    the patient goes to Moorfields, so the hospital is *named*, with its address
    and telephone on the card and the fact that the eye A&E is open 24 hours and
    takes walk-ins — no referral, no appointment, nothing for reception to
    arrange first. It ties with 999 on the ladder and is listed above it, so a
    message that is both goes to the card that names the hospital. The minor eye
    service sits at the other end of the same list for everything Rose Opticians
    can actually see; the boundary between the two is on both checks.
  - **The practice nurse and the diabetic nurse are on the ladder too**, and
    because they rank below a doctor their answer is a **note** on the card
    rather than its destination: where the message goes is untouched, the note
    says the nurse does what is being asked for and quotes the patient saying
    so, and whether to book a nurse slot stays reception's call. It is never
    shown on an emergency card or beside the duty doctor.
- One message box, no modes to pick. The assistant works out for itself whether
  a message is a **how-to question** or an **incoming patient request to triage**
  (for example an Accurx online consultation) and replies with the matching
  shape. A pasted document or an incoming patient request is recognised by the
  agent and handed to `POST /api/ask`, which still produces those two cards
  unchanged — the model returns a `kind` of `"answer"`, `"triage"` or
  `"docfile"`:
  - **answer** — the step-by-step how-to described above.
  - **triage** — grounded *action notes*: an urgency band, the actions to take,
    who to route it to, safety-net red flags and an optional draft reply. This
    is **care navigation / routing only** — it applies the practice's own triage,
    duty-doctor and signposting protocols and never diagnoses or gives clinical
    advice. Same `POST /api/ask` request path, same source-checked citations.

## Layout

- **`app/page.js`** — the chat UI (React). Persists chat + custom guides to
  `localStorage`.
- **`app/api/agent/route.js`** — the assistant's brain: the research tool loop,
  the compose + validate phases, and the NDJSON event stream the chat reads.
- **`lib/agent/`** — `tools.mjs` (the tools, every one of them list-taking), `evidence.mjs` (what the tools
  actually returned, and quote verification against it), `compose.mjs` (the
  structured answer + the validate-and-repair loop), `web-search.mjs`
  (OpenRouter's web-search server tool).
- **`app/api/ask/route.js`** — the previous single-shot endpoint, still used for
  the document-filing and triage card shapes the agent hands off to.
- **`lib/guides/`** — the built-in practice guides, categories and helpers.
- **`lib/ai/`** — prompt builder + response parser for the hand-off endpoint
  (server), the streaming `askAgent` client (`agent-client.js`) and the older
  `askQuestion` helper.
- **`rag/`** — the document knowledge base: ingest pipeline, parsers (including
  vision image reading and PDF page rendering), and the runtime retrieval store.
  See `rag/README.md`.
- **`app/notebook/`** + **`app/api/notebook/`** + **`lib/notebook.js`** — the
  in-app Notebook: practice notes/instructions (with sub-notes) stored in
  Postgres and edited at `/notebook`. Every non-empty page is read fresh and
  supplied in full to every Q&A request (no rebuild or retrieval cutoff).
- **`lib/ai/context.mjs`** + **`rag/context/`** — optional extra supplementary
  context (direct URLs, or committed files in `rag/context/`), reconciled into
  the same store. See `rag/context/README.md`.
- **`lib/contacts.js`** + **`lib/contacts.data.json`** — the deterministic
  telephone directory (exact numbers shown verbatim, never authored by the AI).
- **`lib/lookup/`** + **`/lookup`** — Instant Lookup, a search of the **CQC
  register**: every service registered in England, ~57k rows in
  `cqc.data.json.gz`. Far too large for a phone, so `cqc.js` searches it on the
  server behind `/api/cqc`. Matches on name, town, postcode (either half),
  service type, phone number, and **acronyms** taken from the initials of each
  name — HUH reaches Homerton University Hospital, MEH reaches Moorfields.
  Rebuild from a newer CQC CSV export with `npm run data:cqc -- <path-to-csv>`;
  numbers are verbatim from the export (the script only restores the leading
  zero the spreadsheet drops). The practice's own directory
  (`lib/contacts.data.json`, `/api/directory`) is no longer searched here — it
  still backs the assistant's contacts card.
- **`lib/lookup/contact-extract.mjs`** + **`lib/lookup/web-contact.mjs`** — how a
  number is found for something neither the directory nor the register holds.
  The web search picks the pages; the pages are then **fetched and read**, and
  their `tel:`/`mailto:` links and visible numbers are pulled out verbatim
  (`/api/lookup-web`). Runs that are not numbers
  to ring — a charity registration, an NHS number, a date — are rejected by
  shape and by the words around them. No digit anywhere on this path is written
  by a model, so the guarantee is the same as for the committed directory.
- **`lib/referrals/`** + **`scripts/ingest-snomed-ers.mjs`** — the referral-routing
  fallback. `ereferrals.csv` is the closed list of Specialty + Clinic Type
  pairings e-RS accepts (406 of them); the SNOMED CT description snapshot gives
  the clinical wording to reach them. `npm run data:ers` loads both into Postgres
  (`ers_directory`, `snomed_terms`). A note resolves to a SNOMED concept, then the
  concept and the note's own words are scored against the pairings, weighted by
  how rare each word is across the list. **The Notebook comes first** — this runs
  only when the Notebook records no speciality and clinic type, and everything it
  returns is labelled a suggestion to check against the doctor's task. There is
  no published SNOMED-to-e-RS mapping (no edition of the UK release carries an
  e-RS refset), so the join is made on text and is never presented as authoritative.
  `route-determination.mjs` settles which of the two the e-RS card is showing
  after the answer is written: a pairing the Notebook records is shown as it
  stands, while one determined here fills the card in and carries its provenance
  onto it — the SNOMED concept, the e-RS referral-types list, how close the match
  was and what else was close. A determined pairing the writer labelled as the
  practice's own is relabelled, so it can never reach the reader unmarked.
  `scope.mjs` decides whether any of this applies: it tells a referral being
  *made* from one arriving, one being chased, or the word simply appearing in a
  policy question, and it reads the written answer for whether the referral goes
  on e-RS at all. Every stage is gated on it — the lookup, the research tool, the
  card the writer produced and the card filled in afterwards — so four e-RS
  fields never appear above an answer with no e-RS form behind it.
- **`lib/triage/destinations.mjs`** — where the practice sends things, written
  down once: the duty doctor, the FCP, Pharmacy First, the nurse clinic and the
  diabetes nurse, each with what it takes and what it never takes, plus the
  matching for the two nurse routes and the order the checks run in. The triage
  cards (`lib/templates/triage.mjs`, `lib/templates/nurse.mjs`) and the
  signposting page (`app/api/signpost/route.js`) both read it, so the two cannot
  answer the same question differently. It replaced a live read of the "Triaging
  notebook" Notebook section, which changed under the code, could not be tested,
  and never mentioned the nurse or the diabetes nurse at all — so a smear, a
  dressing or a diabetic review was routed by a triage that had never heard of
  the nurse clinic.
- **`lib/safety/`** — the deterministic floor, and the only thing in the app
  that runs on every single turn. `requests.mjs` (the multi-intent gate and the
  decomposed spans), `spans.mjs` (locality — message-wide checks against
  span-local assertions), `ng12.mjs`, `redflags.mjs`, `confidentiality.mjs`,
  `acuity.mjs` (the rank table), `scan.mjs` (which request the card is about,
  and what has to be said above it), `triage-pass.mjs` (the `/accurx` second
  pass and the veto that keeps it honest). No model is consulted anywhere in
  the folder; `lib/templates/safety.mjs` renders what it finds.
- **`lib/answer-cache/`** — answers already given, so the same question is not
  researched twice. `match.mjs` holds the free half (the canonical form of a
  question, hashed to a key, and the rules for what may be cached at all);
  `store.js` holds the Postgres half (exact key, then nearest question by
  embedding, both filtered on the Notebook fingerprint and the model that wrote
  the answer). Read before the agent runs and written after it, and never on the
  critical path: if the cache is unavailable the question is simply answered the
  slow way.
- **`lib/settings.js`** + **`lib/model-id.mjs`** + **`/settings`** — runtime
  settings in Postgres (`app_settings`), not the environment. Today that is the
  AI model: `/settings` fuzzy-searches the live OpenRouter catalogue
  (`/api/settings/models`) and stores the chosen slug, so the model can be
  changed without a redeploy. `model-id.mjs` is the id itself — validation plus
  the split/join of the routing variant (`openai/gpt-oss-120b:nitro`), with no
  database import, so the browser validates with exactly the rule the save uses.
- **`lib/knowledge.js`** + **`/knowledge`** — the canonical Postgres knowledge
  layer and localhost-only backend screen. The source types share storage and
  conflict review, while the live assistant keeps their context paths separate.
- **`lib/routes.js`** + **`/index`** — one registry of every route the app
  serves, and the deep index built from it. The landing page at `/` stays two
  links on purpose; `/index` is the whole list — pages and API endpoints, with
  what each is for and which are kept off the front. (The page lives in
  `app/site-index/` and is rewritten onto `/index` in `next.config.mjs`:
  `index` is a reserved route name in the App Router.) Add a route here and it
  appears on the index and reads properly in the audit log.
- **`lib/audit/`** + **`/stats`** — the activity audit log: pages opened,
  questions asked, actions taken and requests that failed, **grouped by machine
  rather than by IP address**. Every machine at the practice shares one public
  address and a laptop changes address between the car park and the consulting
  room, so the browser mints a random id per machine instead and keeps it
  (`machine.js`); no IP address is stored. `client.js` wraps `window.fetch`
  once, so every route is covered without a line of logging in any of them, and
  batches are flushed with `sendBeacon` so the last thing done before a machine
  is switched off still reaches the log. `describe.js` holds the privacy rule
  that matters: for the tools patient text is pasted into (`/api/signpost`,
  `/api/reason`, `/api/docfile` and the rest of `CONTENT_NEVER_RECORDED`) the
  log records that the tool was used and how much text was pasted — never the
  text. Stored in `audit_machines` / `audit_events`; `/stats` is deliberately
  not linked from the tools page or the menu.
- **`public/assets/`** — logos, EMIS screenshots, and served document copies.

## Knowledge paths

The assistant keeps each source type predictable:

- **Documents:** found by PostgreSQL full-text (`GIN`) search rather than by a
  vector, and served by `/practice`, which shows the passages themselves with no
  model in the path (`lib/templates/practice.mjs`).
- **Notebook:** every non-empty page is loaded fresh from the live Notebook
  tables on every request and is never chunked or shortened. The model is given
  the page TITLES and returns one; the page is then rendered from the database
  as the practice wrote it, so a long process is never truncated to a snippet
  and never paraphrased.
- **Contacts:** the one remaining embedded corpus, because a caller asks for
  "the district nurses" rather than a title. A full-text + semantic search
  retrieves matching
  structured directory entries. Telephone numbers and emails are displayed
  deterministically rather than copied by the AI.
- Document and Notebook output still requires a server-verified verbatim quote.
- `rag:ingest` updates portable parsed artefacts; a persisted bundle fingerprint
  automatically reconciles only changed documents on the next runtime check.
- Source passages are analysed into exact-quote claims once per content hash.
  Candidate disagreements are reasoned over and only high-confidence, mutually
  exclusive claims appear as contradictions.
- `/knowledge` and `/api/knowledge/**` are deliberately available only from a
  loopback host in development; they return 404 in deployed production. The
  public app contains no link to this backend.
- `/api/knowledge/sync` idempotently reconciles the processed file bundle,
  Notebook and contacts. A legacy document/contact fallback keeps a fresh
  deployment available while its first canonical index builds in the background.

## Configuration

Set these in `.env.local` (see `.env.local.example`):

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | OpenRouter API key (server-side only). |
| ~~`OPENROUTER_AI_MODEL`~~ | **Gone.** The chat/vision model is a practice setting now: change it at `/settings`, where it is picked from the live OpenRouter catalogue and stored in Postgres (`app_settings`). Defaults to `google/gemini-3.5-flash-lite`. Should be vision-capable — the ingester reads images with it whenever the fast model cannot. A **routing variant** can be pinned to it there too — `:nitro` (fastest provider), `:floor` (cheapest), `:free`, `:online`, or anything else typed, e.g. `openai/gpt-oss-120b:nitro` — and a full id can be typed straight into the search box when the catalogue does not list it. |
| `OPENROUTER_EMBED_MODEL` | Embedding model for the contact directory, the committed `rag/` index and the answer cache's question matching (default `openai/text-embedding-3-small`). Documents and Notebook pages are no longer embedded. |
| `OPENROUTER_ANALYSIS_MODEL` | Optional default for the **fast** role — the reading: the agent's research loop, claim extraction, the medicine-name extractor, the ingester's image transcription. Wants a cheap model that calls tools reliably. |
| `OPENROUTER_WEB_MODEL` | Optional default for the **web search** role — searching the internet and reading a page for a phone number. A search-grounded model such as `perplexity/sonar` belongs here. Falls back to `OPENROUTER_MEDICATION_MODEL`, then `OPENROUTER_ANALYSIS_MODEL`. |
| `DATABASE_URL` | Neon Postgres. Powers the staff rota and the Notebook. |
| `SUPPLEMENTARY_CONTEXT_URLS` | Optional. Direct text/markdown/JSON URLs to inject as extra supplementary context (the Notebook is the main channel and needs no config). |

### Model roles

One turn is not one job, and it splits cleanly in two. **Reading** — searching
the practice's material, skimming what comes back, choosing the next file to
open, pulling the names out of a pasted list, transcribing a screenshot — is most
of the model calls in a turn and none of its output. **Deciding** is the answer
itself and every judgement in it: one call, and the only thing anybody reads.

So `/settings` picks the model the practice runs on — the **reasoning** role,
which decides and writes — and two optional overrides sit beside it: **fast**,
which does the reading (the agent's research loop, claim extraction, the
medicine-name extractor, the ingester's image transcription), and **web search**,
a search-grounded model such as `perplexity/sonar` for the internet and for
reading a page to lift a number off it. Each is stored in `app_settings`, so
changing one needs no redeploy. There is no separate vision role: the ingester
reads images with the fast model and falls back to the reasoning model if that
one cannot see.

Every role is optional. Unset, it falls back to the environment variable that
used to carry it and then to the reasoning model, so an install that has only
ever chosen one model is completely unaffected.

**The answer is always written by the reasoning model.** That is deliberate and
not a tunable: writing is the one job that needs the whole context held at once —
every source, the conversation, which claims the practice's own material actually
backs, and what the reader will do next. The cheaper roles exist to keep work
*away* from that model (the reading, fewer sources put in front of it, background
jobs); they never take the writing, or a judgement inside it, off it.

The one risk in moving the research loop off the reasoning model is a fast model
too weak to drive tools: it answers in prose instead of searching, and the turn
reports "the practice has nothing on this" for a question the Notebook covers in
full. That failure is silent, so it is caught in code — a loop that ends without
having called a single tool, or one that fails outright, is run again on the
reasoning model (`lib/agent/research-model.mjs`). A loop that searched and found
nothing is *not* re-run: that is a finding, and "the practice's material does not
cover this" is the right answer to it.

### What a question costs

Each row on `/settings` shows its model's advertised rate — input and output per
1M tokens, live from the OpenRouter catalogue — and, underneath, the tokens a
question really used on that role. A rate is not a cost: what a question costs is
the rate multiplied by how many tokens *this* practice's questions use, and that
depends on its Notebook, its documents and how staff word things. Two installs on
one model differ by more than two models on one install.

So it is measured, not assumed. Every phase of every turn writes a row to
`ai_usage` — role, model, tokens in, tokens out, no question text — and the page
averages the last 30 days *per question* (not per call, so a repaired answer
counts as the one question it was).

**Measurements belong to the model that produced them.** Tokens measured on one
model say nothing about the next: a terser model writes fewer, a hungrier one
reads more, and pricing yesterday's counts at today's rate reports a number that
was never true of either. So a change of model shows nothing until it has been
used — and changing back brings the old model's record back untouched, because
nothing is ever reset or deleted. A **cost per question, by model** table lists
every model that has answered anything, marking the ones in use.

A role nobody has run on its current model, or one whose model publishes no
price, is excluded from the total and named as excluded. Unpriced models sort
last in the table rather than cheapest — unknown is not $0.

The writer is also given less to read than the research loop found: sources are
ranked against the question and the weakest held back (`lib/agent/select.mjs`),
because the loop opens sources for the price of a database query while the
writer pays the reasoning model's input rate for every character. Nothing is
lost — the full set stays in the evidence registry, which is what quotes are
still validated against.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm run start
```

## Knowledge base

```bash
npm run rag:status    # what's indexed / pending
npm run rag:ingest    # process new or changed documents in rag/sources/
```

See `rag/README.md` for the data standard, parsers, citations and storage notes.

## Notes

- Administrative help for receptionists only — never clinical or medical advice.
  It refuses clinical questions and escalates possible emergencies (call 999 /
  alert a clinician).
