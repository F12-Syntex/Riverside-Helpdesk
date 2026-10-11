import test from 'node:test';
import assert from 'node:assert/strict';
import { isPathwayPage, readPathways } from '../lib/referrals/pathways.mjs';

// The practice keeps its e-RS pairings in the Notebook under "Referral
// pathways / All Clinic types and their specialities", and the Notebook's own
// checks read them (lib/notebook/rules.mjs, lib/notebook/validate.mjs). The
// pages below are the three shapes the practice writes them in.

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

// A labelled page with a priority.
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
// The pathway read off `pages` under this name.
const named = (pages, name) => readPathways(pages).find((e) => e.name === name);

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

test('a page per referral: the title names it and the labelled lines fill it in', () => {
  const entry = named(PAGES, 'Vascular surgery');
  assert.ok(entry, 'the page title names the pathway');
  assert.equal(entry.specialty, 'Vascular Surgery');
  assert.equal(entry.clinicType, 'Varicose Veins');
  assert.equal(entry.hospital, 'Royal London Hospital');
  assert.match(entry.note, /names the side/);
  assert.equal(entry.page, VASCULAR.docTitle, 'the page it came from is kept');
  assert.equal(named(PAGES, 'Rapid Access Chest Pain Clinic').priority, 'Urgent');
});

test('a table row is a pathway', () => {
  const entry = named(PAGES, 'Hernia');
  assert.equal(entry.specialty, 'Not Otherwise Specified');
  assert.equal(entry.clinicType, 'Hernias');
  assert.equal(entry.route, 'ers');
});

test('a 2WW row keeps 2WW in both boxes and is flagged as cancer', () => {
  const entry = named(PAGES, 'Suspected skin cancer (2WW)');
  assert.equal(entry.specialty, '2WW');
  assert.equal(entry.clinicType, '2WW Dermatology');
  assert.equal(entry.priority, '2WW');
  assert.equal(entry.cancer, true);
});

test('a list line is a pathway: name, speciality, clinic type', () => {
  const entry = named(PAGES, 'Rheumatology');
  assert.equal(entry.specialty, 'Rheumatology');
  assert.equal(entry.clinicType, 'Inflammatory Arthritis');
  const salt = named(PAGES, 'Speech and language');
  assert.equal(salt.specialty, 'Speech and Language Therapy / Adult');
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

/* ------------------------------------------------- the shape live today */
//
// EVERY PAGE ABOVE IS ONE WE WROTE. The practice then renamed the section to
// "Pathway cards (A to Z)" and rewrote the cards, and these tests went on
// passing while the live Notebook produced ZERO pathways. So the cards below
// are the practice's own, copied from the Notebook as it stands.

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

test('a card with bold labels is read', () => {
  const entry = named(CARDS, 'General surgery: hernias');
  assert.equal(entry.specialty, 'Surgery - Not Otherwise Specified');
  assert.equal(entry.clinicType, 'Hernias');
});

test('a heading that is a label is read, with the value under it', () => {
  const entry = named(CARDS, 'Physiotherapy (standard)');
  assert.equal(entry.specialty, 'Physiotherapy');
  assert.equal(entry.clinicType, 'Not Otherwise Specified');
  assert.equal(entry.route, 'ers');
});

test('a slash in the page title is part of the title, not a path', () => {
  const entry = named(CARDS, 'Audiology / hearing test');
  assert.ok(entry, 'the card is named by its whole title');
  assert.equal(entry.specialty, 'Diagnostic Physiological Measurement');
});

test('e-RS named in the route beats the word email in the same sentence', () => {
  const entry = named(CARDS, 'Audiology / hearing test');
  assert.equal(entry.route, 'ers');
});

// THE DERMATOLOGY PAGE. Five pathways, each its own one-row table under its own
// heading, whose speciality and clinic type repeat: three normal ones all say
// "Dermatology / Not otherwise specified" and two 2WW ones both say "2WW / 2WW
// skin". What tells them apart is the hospital selection rule, and that column
// was read by nothing — so the page read as two pathways, not five.
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

// A typed page draws its own card first, under a bold "e-RS referral" title,
// then the page as written. The card title is a route, not a referral's name.
test('a typed page card is named by its Service, not by its route', () => {
  const page = {
    docTitle: 'Notebook: Referrals / Pathway cards (A to Z) / ERS referrals / Foot Health referral (ERS) – At Risk Foot podiatry',
    text: [
      '**e-RS referral**',
      '- **Service:** Foot Health',
      '- **Speciality:** Podiatry',
      '- **Clinic type:** At Risk Foot',
      '',
      '## Foot Health Referral (ERS)',
      '',
      '**Speciality:** Podiatry',
      '**Clinic type:** At Risk Foot',
    ].join('\n'),
  };
  const names = readPathways([page]).map((e) => e.name);
  assert.ok(!names.some((n) => /^e-?rs referral$/i.test(n)), names.join(' | '));
  assert.ok(names.includes('Foot Health'), names.join(' | '));
});
