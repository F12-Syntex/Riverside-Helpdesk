import test from 'node:test';
import assert from 'node:assert/strict';
import { findPathwayReferral, isPathwayPage, readPathways } from '../lib/referrals/pathways.mjs';
import { findReferralService, referralAnswer } from '../lib/templates/referrals.mjs';

// THE GAP THIS FILE EXISTS FOR. The practice keeps its e-RS pairings in the
// Notebook under "Referral pathways / All Clinic types and their specialities".
// The referral card was built from a copy of that list typed into code, so a
// pathway the practice added — or corrected — on its own page never reached
// the reader. The pages below are the three shapes the practice writes them in.

// 1. A page per referral, labelled fields.
const VASCULAR = {
  docTitle: 'Notebook: Referrals / Referral pathways / All Clinic types and their specialities / Vascular surgery',
  text: `Speciality: Vascular Surgery
Clinic type: Varicose Veins
Hospital: Royal London Hospital
Note: The doctor names the side in the letter.`,
};

// 2. A table.
const TABLE = {
  docTitle: 'Notebook: Referrals / Referral pathways / All Clinic types and their specialities / Common referrals',
  text: `The boxes to set on e-RS for each of these.

| Referral | Speciality | Clinic type | Priority |
| --- | --- | --- | --- |
| Hernia | Not Otherwise Specified | Hernias | Routine |
| Suspected skin cancer (2WW) | 2WW | 2WW Dermatology | 2WW |
| ENT — hearing loss | ENT | Hearing Loss | |`,
};

// 3. A list.
const LIST = {
  docTitle: 'Notebook: Referrals / Referral pathways / Other pathways',
  text: `- Rheumatology — Rheumatology — Inflammatory Arthritis
- Speech and language: Speech and Language Therapy / Adult`,
};

// A pathway the array in code ALSO records, with a different clinic type. The
// practice's page is newer and must win.
const RACPC = {
  docTitle: 'Notebook: Referrals / Referral pathways / All Clinic types and their specialities / Rapid Access Chest Pain Clinic',
  text: `Speciality: Cardiology
Clinic type: Rapid Access Chest Pain
Priority: Urgent`,
};

// Not under the pathways section, however much it looks like one.
const ELSEWHERE = {
  docTitle: 'Notebook: Front desk / Useful notes',
  text: 'Speciality: Podiatry\nClinic type: Nail Surgery',
};

const PAGES = [VASCULAR, TABLE, LIST, RACPC, ELSEWHERE];
const flat = (card) => JSON.stringify(card);

test('only pages under the Referral pathways section are read as pathways', () => {
  assert.ok(isPathwayPage(VASCULAR));
  assert.ok(isPathwayPage(LIST));
  assert.equal(isPathwayPage(ELSEWHERE), false);
  const names = readPathways(PAGES).map((e) => e.name);
  assert.ok(names.includes('Vascular surgery'));
  assert.ok(names.includes('Hernia'));
  assert.ok(names.includes('Rheumatology'));
  assert.ok(!names.some((n) => /Podiatry|Useful notes/.test(n)));
});

test('a page per referral: the title names it and the labelled lines fill the card', () => {
  const card = referralAnswer({ question: 'how do I refer for vascular surgery', name: 'vascular surgery', pages: PAGES });
  assert.match(card.title, /Vascular surgery referral/);
  assert.match(flat(card), /Vascular Surgery/);
  assert.match(flat(card), /Varicose Veins/);
  assert.match(flat(card), /Royal London Hospital/);
  assert.match(flat(card), /names the side/);
  assert.ok(card.source.includes(VASCULAR.docTitle), 'the page it came from is on the card');
  assert.doesNotMatch(card.subtitle, /Not recorded/);
});

test('a table row is a pathway, matched by the name the model read', () => {
  const entry = findPathwayReferral({ name: 'hernia', pages: PAGES });
  assert.equal(entry.specialty, 'Not Otherwise Specified');
  assert.equal(entry.clinicType, 'Hernias');
  assert.equal(entry.route, 'ers');
});

test('a 2WW row keeps 2WW in both boxes and is flagged as cancer', () => {
  const card = referralAnswer({ question: '2ww skin cancer referral', name: 'skin cancer', pages: PAGES });
  const screen = card.blocks.find((b) => b.type === 'ers');
  assert.equal(screen.specialty, '2WW');
  assert.equal(screen.clinicType, '2WW Dermatology');
  assert.equal(screen.priority, '2WW');
  assert.match(card.warn, /2WW/);
});

test('a list line is a pathway: name, speciality, clinic type', () => {
  const entry = findPathwayReferral({ name: 'rheumatology', pages: PAGES });
  assert.equal(entry.specialty, 'Rheumatology');
  assert.equal(entry.clinicType, 'Inflammatory Arthritis');
  const salt = findPathwayReferral({ name: 'speech and language', pages: PAGES });
  assert.equal(salt.specialty, 'Speech and Language Therapy / Adult');
});

test('the practice page outranks the copy in code when both record a referral', () => {
  const card = referralAnswer({ question: 'racpc referral', name: 'rapid access chest pain clinic', pages: PAGES });
  assert.match(flat(card), /Rapid Access Chest Pain/);
  assert.doesNotMatch(flat(card), /Ischaemic Heart Disease/);
  assert.ok(card.source.includes(RACPC.docTitle));
});

test('matched from the question when the model named nothing', () => {
  const entry = findPathwayReferral({ name: '', question: 'how do I do a hernia referral', pages: PAGES });
  assert.equal(entry.name, 'Hernia');
});

test('without a pathway page the code list still answers as before', () => {
  const card = referralAnswer({ question: 'racpc referral', name: 'racpc', pages: [ELSEWHERE] });
  assert.match(flat(card), /Ischaemic Heart Disease/);
});

test('a heading or a sentence on a pathway page is not a referral', () => {
  // The physio page had this heading, and the list reader split it on the
  // dash: a referral called "#### Follow-up Appointments (Physiotherapy
  // referral" with a speciality of "FCP)".
  const PROSE = {
    docTitle: 'Notebook: Referrals / Referral pathways / Physiotherapy (FCP) and Extended Scope Physiotherapy',
    text: `#### Follow-up Appointments (Physiotherapy referral - FCP) and how they are booked
The FCP books follow-ups directly - reception does not.
- Send a task to the FCP team: they book it.`,
  };
  assert.equal(readPathways([PROSE]).length, 0);
  // A page that is only a list still reads as one.
  const entries = readPathways([LIST]);
  assert.equal(entries[0].name, 'Rheumatology');
});

test('the physio page yields one record per clinic, bold labels and all, standard first', () => {
  // The page as the practice actually wrote it: a bold bullet titles each
  // clinic, the fields are bold labels nested under it, and "Location" is
  // the hospital.
  const PHYSIO = {
    docTitle: 'Notebook: Referrals / Referral pathways / Physiotherapy (FCP) and Extended Scope Physiotherapy',
    text: `#### Clinic Selection for Booking in ERS (HOW TO REFER TO physiotherapy)

- **Standard Physiotherapy (IF ONLY physiotherapy IS MENTIONED)**

  - **Clinic type:** Not otherwise specified
  - **Speciality:** Physiotherapy
  - **Location:** **Any that don't include extended**

- **Extended Scope Physiotherapy (ESP) Assessment Service**

  - **Clinic type:** Not otherwise specified
  - **Speciality:** ESP
  - **Location:** **ST LEONARD'S**

<span style="color: rgb(213, 40, 27);">**Never**</span> book the wrong clinic type.\\*\\*`,
  };
  const entries = readPathways([PHYSIO]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, 'Standard Physiotherapy');
  assert.equal(entries[0].specialty, 'Physiotherapy');
  assert.equal(entries[0].clinicType, 'Not otherwise specified');
  assert.equal(entries[1].specialty, 'ESP');
  assert.equal(entries[1].hospital, "ST LEONARD'S");

  // "physio" finds standard first; "esp" finds the other.
  const card = referralAnswer({ question: 'how to refer to physio', name: 'physio', pages: [PHYSIO] });
  const screen = card.blocks.find((b) => b.type === 'ers');
  assert.equal(screen.specialty, 'Physiotherapy');
  assert.match(flat(card), /Also on this page/);
  assert.match(flat(card), /ESP/);
  const esp = referralAnswer({ question: 'esp referral', name: 'esp', pages: [PHYSIO] });
  assert.equal(esp.blocks.find((b) => b.type === 'ers').specialty, 'ESP');
});

test('a vertical two-column table is a labelled block, and "Clinic:" is the clinic type', () => {
  const ENDO = {
    docTitle: 'Notebook: Referrals / Referral pathways / Endoscopy referral',
    text: `| Item | Selection |
| --- | --- |
| **Priority** | **Routine** |
| **Speciality** | **Diagnostic Endoscopy** |
| **Clinic type** | **Gastroscopy** |
| **Hospital** | **HOMERTON UNIVERSITY HOSPITAL** |`,
  };
  const HERNIA = {
    docTitle: 'Notebook: Referrals / Referral pathways / General surgery referral — hernias',
    text: `*   **Speciality:** **Not Otherwise Specified**
*   **Clinic:** **Hernias**`,
  };
  const [endo] = readPathways([ENDO]);
  assert.equal(endo.name, 'Endoscopy');
  assert.equal(endo.specialty, 'Diagnostic Endoscopy');
  assert.equal(endo.clinicType, 'Gastroscopy');
  assert.equal(endo.hospital, 'HOMERTON UNIVERSITY HOSPITAL');
  const [hernia] = readPathways([HERNIA]);
  assert.equal(hernia.name, 'General surgery — hernias');
  assert.equal(hernia.clinicType, 'Hernias');
});

test('the code list matches whole words only, so physiotherapy is not OT', () => {
  assert.equal(findReferralService('physiotherapy referral'), null);
  assert.equal(findReferralService('ot referral').name, 'Occupational therapy (OT)');
});

test('the e-RS card is the screen, with the steps behind a disclosure and the hospital on it', () => {
  const card = referralAnswer({ question: 'racpc referral', name: 'racpc', pages: [] });
  const screen = card.blocks.find((b) => b.type === 'ers');
  assert.equal(screen.specialty, 'Cardiology');
  assert.equal(screen.hospital, 'Homerton University Hospital');
  assert.match(screen.pathway, /Rapid Access Chest Pain/);
  assert.equal(screen.priority, 'Urgent');
  // No bare steps on the card: they live in the disclosure.
  assert.ok(!card.blocks.some((b) => b.type === 'steps'));
  const opened = card.blocks.find((b) => b.type === 'expand' && /steps/i.test(b.label));
  assert.ok(opened && opened.blocks.some((b) => b.type === 'steps'));
});

test('the unrecorded card says it does not know, and is flagged', () => {
  const card = referralAnswer({ question: 'how do I refer for a minmax', name: 'minmax', pages: [] });
  assert.equal(card.flag, 'not-recorded');
  assert.match(flat(card), /don’t know/);
  assert.doesNotMatch(flat(card), /Smartcard/);
});

test('nothing recorded anywhere is still the honest card', () => {
  const card = referralAnswer({ question: 'how do I refer for hyperbaric oxygen', name: 'hyperbaric oxygen', pages: PAGES });
  assert.match(card.subtitle, /Not recorded/);
});

/* ------------------------------------------------- the shape live today */
//
// EVERY PAGE ABOVE IS ONE WE WROTE. The practice then renamed the section to
// "Pathway cards (A to Z)" and rewrote the cards, and these tests went on
// passing while the live Notebook produced ZERO pathways and every referral
// card fell back to the copied array. So the cards below are the practice's
// own, copied from the Notebook as it stands.

// The section as it is named now, with the labels bold — the commonest card.
const HERNIA_CARD = {
  path: ['Referrals', 'Pathway cards (A to Z)', 'General surgery: hernias'],
  docTitle: 'Notebook: Referrals / Pathway cards (A to Z) / General surgery: hernias',
  text: `**Route:** e-RS, when doctors request
**Speciality:** **Surgery - Not Otherwise Specified**
**Clinic type:** **Hernias**
**Priority:** Standard`,
};

// The label is the HEADING and the value is the line under it.
const PHYSIO_CARD = {
  path: ['Referrals', 'Pathway cards (A to Z)', 'Physiotherapy (standard)'],
  docTitle: 'Notebook: Referrals / Pathway cards (A to Z) / Physiotherapy (standard)',
  text: `## Route
**e-RS**

## Speciality
**Physiotherapy**

## Clinic type
**Not Otherwise Specified**

## Differences from the standard process
- Verify the patient is eligible for **standard** physiotherapy (not ESP).`,
};

// A page whose OWN title carries a slash, and whose route names e-RS in a
// sentence that also says the word email.
const AUDIOLOGY_CARD = {
  path: ['Referrals', 'Pathway cards (A to Z)', 'Audiology / hearing test'],
  docTitle: 'Notebook: Referrals / Pathway cards (A to Z) / Audiology / hearing test',
  text: `**Route:** e-RS (Step 2a). The form must carry the practice email.
**Speciality:** **Diagnostic Physiological Measurement**
**Clinic type:** **Audiology - Hearing Assess**`,
};

const CARDS = [HERNIA_CARD, PHYSIO_CARD, AUDIOLOGY_CARD];

test('the Pathway cards section is read as pathways', () => {
  assert.ok(CARDS.every(isPathwayPage));
  assert.equal(readPathways(CARDS).length, 3);
});

test("a card's own pairing wins over the copy in code", () => {
  const entry = findPathwayReferral({ name: 'hernia', pages: CARDS });
  assert.equal(entry.specialty, 'Surgery - Not Otherwise Specified');
  assert.equal(entry.clinicType, 'Hernias');
});

test('a heading that is a label is read, with the value under it', () => {
  const entry = findPathwayReferral({ name: 'physiotherapy', pages: CARDS });
  assert.equal(entry.specialty, 'Physiotherapy');
  assert.equal(entry.clinicType, 'Not Otherwise Specified');
  assert.equal(entry.route, 'ers');
});

test('a slash in the page title is part of the title, not a path', () => {
  const entry = findPathwayReferral({ name: 'audiology', pages: CARDS });
  assert.ok(entry, "audiology must find its own card");
  assert.equal(entry.specialty, 'Diagnostic Physiological Measurement');
});

test('e-RS named in the route beats the word email in the same sentence', () => {
  const entry = findPathwayReferral({ name: 'audiology', pages: CARDS });
  assert.equal(entry.route, 'ers');
});

// THE DERMATOLOGY PAGE. Five pathways, each its own one-row table under its own
// heading, whose speciality and clinic type repeat: three normal ones all say
// "Dermatology / Not otherwise specified" and two 2WW ones both say "2WW / 2WW
// skin". What tells them apart is the hospital selection rule, and that column
// was read by nothing — so the page answered as two pathways, not five, and
// "dermatology referral" came back as the 2WW card headed "Priority is 2WW,
// never Routine": a routine referral sent down the cancer pathway.
const DERM = {
  docTitle: 'Notebook: Referrals / Pathway cards (A to Z) / ERS referrals / Dermatology and Telederm',
  text: `## Normal Dermatology

| Category | Specialty | Clinic Type | Hospital Selection Rule |
| --- | --- | --- | --- |
| Normal Dermatology | Dermatology | Not otherwise specified | First hospital that isn't a telederm / community hospital |

Note: This pathway is used for standard skin conditions that do not require urgent 2-week-wait (2WW) referral.

## Normal Teledermatology

| Category | Specialty | Clinic Type | Hospital Selection Rule |
| --- | --- | --- | --- |
| Normal Telederm | Dermatology | Not otherwise specified | First hospital that is a telederm |

## Normal Community Dermatology

| Category | Specialty | Clinic Type | Hospital Selection Rule |
| --- | --- | --- | --- |
| Normal Community | Dermatology | Not otherwise specified | First hospital that is a community hospital |

## 2-Week-Wait (2WW) Dermatology

| Category | Specialty | Clinic Type | Hospital Selection Rule |
| --- | --- | --- | --- |
| 2WW Dermatology | 2WW | 2WW skin | First hospital that isn't a telederm |

## 2-Week-Wait (2WW) Teledermatology

| Category | Specialty | Clinic Type | Hospital Selection Rule |
| --- | --- | --- | --- |
| 2WW Telederm Dermatology | 2WW | 2WW skin | First hospital that is a telederm |
`,
};

test('the hospital selection rule is read, and is what tells five pathways apart', () => {
  const entries = readPathways([DERM]);
  assert.equal(entries.length, 5);
  assert.deepEqual(entries.map((e) => e.hospitalRule), [
    "First hospital that isn't a telederm / community hospital",
    'First hospital that is a telederm',
    'First hospital that is a community hospital',
    "First hospital that isn't a telederm",
    'First hospital that is a telederm',
  ]);
  // A rule is not the name of a hospital, so nothing goes in the dropdown.
  assert.deepEqual([...new Set(entries.map((e) => e.hospital))], ['']);
});

test('a 2WW pathway is not the answer to a question that did not ask for one', () => {
  const entry = findPathwayReferral({ name: 'dermatology', question: 'dermatology referral', pages: [DERM] });
  assert.equal(entry.name, 'Normal Dermatology');
  assert.equal(entry.specialty, 'Dermatology');
  assert.equal(entry.clinicType, 'Not otherwise specified');
  assert.equal(entry.cancer, false);

  const card = referralAnswer({ name: 'dermatology', question: 'dermatology referral', pages: [DERM] });
  const screen = card.blocks.find((b) => b.type === 'ers');
  assert.equal(screen.priority, 'Routine');
  assert.equal(screen.specialty, 'Dermatology');
  assert.equal(screen.hospitalRule, "First hospital that isn't a telederm / community hospital");
  assert.equal(flat(card).includes('Priority is 2WW, never Routine'), false);
});

test('asking for the two week wait still gets the 2WW pathway', () => {
  const entry = findPathwayReferral({ name: 'dermatology', question: '2ww dermatology referral', pages: [DERM] });
  assert.equal(entry.name, '2WW Dermatology');
  assert.equal(entry.specialty, '2WW');
  assert.equal(entry.clinicType, '2WW skin');
  assert.equal(entry.hospitalRule, "First hospital that isn't a telederm");

  const card = referralAnswer({ name: 'dermatology', question: 'suspected skin cancer referral', pages: [DERM] });
  assert.equal(card.blocks.find((b) => b.type === 'ers').specialty, '2WW');
});

test('the heading above a table names its rows, so telederm and community are findable', () => {
  const tele = findPathwayReferral({ name: 'teledermatology', question: 'teledermatology referral', pages: [DERM] });
  assert.equal(tele.name, 'Normal Telederm');
  assert.equal(tele.hospitalRule, 'First hospital that is a telederm');

  const community = findPathwayReferral({ name: 'community dermatology', question: 'community dermatology referral', pages: [DERM] });
  assert.equal(community.name, 'Normal Community');
  assert.equal(community.hospitalRule, 'First hospital that is a community hospital');
});

// THE QUALIFIER IS IN THE QUESTION EVEN WHEN IT IS NOT IN THE NAME. The model
// reads the bare service off a message — "dermatology" — so the word that told
// the five dermatology pathways apart was thrown away before the lookup, the
// shortest name won, and a reader asking for a community referral was sent to
// the first hospital that is NOT a community one.
test('a qualifier the extracted name dropped still picks the pathway', () => {
  const community = findPathwayReferral({ name: 'dermatology', question: 'community dermatology referral', pages: [DERM] });
  assert.equal(community.name, 'Normal Community');
  assert.equal(community.hospitalRule, 'First hospital that is a community hospital');

  const tele = findPathwayReferral({ name: 'dermatology', question: 'teledermatology referral', pages: [DERM] });
  assert.equal(tele.name, 'Normal Telederm');
  assert.equal(tele.hospitalRule, 'First hospital that is a telederm');

  // And the plain question still gets the plain pathway.
  const plain = findPathwayReferral({ name: 'dermatology', question: 'dermatology referral', pages: [DERM] });
  assert.equal(plain.name, 'Normal Dermatology');
});

test('the siblings on the dermatology page are all offered, rules and all', () => {
  const card = referralAnswer({ name: 'dermatology', question: 'dermatology referral', pages: [DERM] });
  const text = flat(card);
  assert.match(text, /Also on this page/);
  for (const name of ['Normal Community', '2WW Dermatology', '2WW Telederm Dermatology']) assert.ok(text.includes(name), `${name} must be offered`);
  assert.match(text, /First hospital that is a community hospital/);
});

test('a hospital written as an instruction is a rule, not a name in the dropdown', () => {
  const PAGE = {
    docTitle: 'Notebook: Referrals / Pathway cards (A to Z) / Skin lesion',
    text: `Speciality: Dermatology
Clinic type: Not otherwise specified
Hospital: the first one that is not a telederm`,
  };
  const [entry] = readPathways([PAGE]);
  assert.equal(entry.hospital, '');
  assert.equal(entry.hospitalRule, 'the first one that is not a telederm');
});
