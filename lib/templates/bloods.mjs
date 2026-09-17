// The blood form: which tests get ordered, and what goes in Clinical Details.
//
// THE JOB. Somebody at the desk has a patient booked for a health check and
// has to raise the pathology request on EMIS. What they are looking at is the
// Order tab: a wall of tick boxes in sections — Biochemistry 1, Biochemistry 2,
// Virology, Haematology — an **Ordered Items** list on the right that fills up
// as boxes are ticked, and a **Clinical Details** box under it. Two things get
// that screen wrong: ticking the wrong boxes, and leaving Clinical Details
// empty, which is what the laboratory reads to know why the sample was sent.
//
// So the card is that screen, filled in: the tests to tick under the screen's
// own section headings, the Ordered Items list as it should read when they are
// all ticked, and the type of health check typed into Clinical Details. It is
// laid out here in code — the same argument the e-RS screen makes next door in
// ./referrals.mjs — so the boxes cannot drift however a model words things.
//
// WHAT IS RECORDED AND WHAT IS NOT. The practice has recorded ONE filled-in
// form: the health-check bloods, shown here exactly as it was sent. The other
// reviews on the bloods-first list have no form recorded, and the tests for
// them are not the same tests. So a review this file does not hold is answered
// with the screen, the Clinical Details line and an honest empty Ordered Items
// box — never with the health-check panel wearing another review's name. A
// wrong tick is a patient bled for the wrong test and a review that cannot go
// ahead when the results come back.
import { answer, bullets, expand, note, pathology, steps, table } from './blocks.mjs';
import { BLOODS_FIRST, HARD_GATES } from '../triage/destinations.mjs';

const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * THE FORM ITSELF: every test box the recorded screen shows, under the screen's
 * own section headings.
 *
 * This is here because of the question the card kept being asked. "Mental
 * health review blood form" is not really a question about a review — it is
 * somebody looking at that wall of tick boxes wanting to know WHICH ITEMS TO
 * SELECT, and an empty card told them nothing they did not already know. The
 * practice may have recorded no panel for their review, but the boxes exist and
 * are the same boxes every time, so the list of them is the closest true thing
 * the card can offer: find the one the request names, here, with its exact
 * wording.
 *
 * The screen lays each section out in two columns. The order here is the left
 * column top to bottom, then the right — and the wording is the screen's, down
 * to the spacing in "TFTs - Free T4 & TSH", because that is what the reader is
 * matching against with their eye.
 *
 * IT IS NOT THE WHOLE FORM. The screenshot ends below Haematology, and the form
 * scrolls. So the card never says these are all the tests there are; it says
 * Test Search finds anything not listed, which is what the screen's own button
 * is for.
 */
export const FORM_SECTIONS = [
  {
    heading: 'Biochemistry 1',
    tests: [
      'Electrolytes + Creatinine',
      'Alanine Transaminase (ALT)',
      'Thyroid Function - TSH Only',
      'C Reactive Protein (CRP)',
      'Liver Profile (LFT)',
      'Lipid Profile',
      'Haemoglobin A1c',
      'Prostate Specific Antigen (PSA)',
    ],
  },
  {
    heading: 'Biochemistry 2',
    tests: [
      'Ferritin Only',
      'Urine Protein/Creatinine Ratio',
      'TFTs - Free T4 & TSH',
      'Bone Profile',
      'Lipase',
      'Urine Albumin Creatinine Ratio',
    ],
  },
  {
    heading: 'Virology',
    tests: [
      'Chlamydia/Gonorrhoea DNA Female Self Swab',
      'Rubella IgG',
      'Measles IgG',
      'Varicella Zoster (VZV) IgG',
      'Hepatitis B surface Antibody (immune status)',
      'Hepatitis B Surface Antigen',
      'Chlamydia/GC DNA Clinician taken Vulvo Vaginal swab',
      'HIV RNA',
      'HIV Antibody / p24 Antigen',
      'Acute Hepatitis Screen (Hep A IgM, Hep B sAg, Hep C)',
      'Hepatitis B core Antibodies',
      'Hepatitis C virus IgG',
    ],
  },
  {
    heading: 'Haematology',
    tests: ['Full Blood Count (FBC)', 'Haemoglobinopathy Screen + FBC'],
  },
];

/** Which section a test box sits in, or '' for a name the form does not carry. */
export function sectionOf(test) {
  const found = FORM_SECTIONS.find((s) => s.tests.includes(test));
  return found ? found.heading : '';
}

/**
 * The ONE box on the form that a name refers to, or null.
 *
 * Used to turn what a page lists — "FBC", "LFT", "lipids" — into the box the
 * reader has to tick. Whole words only, and ONLY when exactly one box matches:
 * "TSH" appears in both "Thyroid Function - TSH Only" and "TFTs - Free T4 &
 * TSH", and ticking either of them for somebody would be choosing a different
 * test from the one the clinician asked for. Two matches is not a near miss, it
 * is a question, and the card leaves it on the list for the reader to settle.
 */
export function formItem(name) {
  const asked = norm(name);
  if (!asked) return null;
  const all = FORM_SECTIONS.flatMap((s) => s.tests);

  // The name itself.
  const exact = all.filter((t) => norm(t) === asked);
  if (exact.length === 1) return exact[0];

  // The form's OWN abbreviation — the bit it puts in brackets. "FBC" is how
  // everybody writes Full Blood Count, and it is also inside
  // "Haemoglobinopathy Screen + FBC", so the bracket is what tells the two
  // apart. Only the form's brackets count: no synonym invented here, because a
  // synonym invented here is a different test ticked for somebody.
  const abbreviated = all.filter((t) => abbreviation(t) && abbreviation(t) === asked);
  if (abbreviated.length === 1) return abbreviated[0];

  // Failing that, the whole name appearing as whole words in exactly one box.
  const whole = new RegExp('\\b' + asked.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  const hits = all.filter((t) => whole.test(norm(t)));
  return hits.length === 1 ? hits[0] : null;
}

// What the form put in brackets, when that is an abbreviation rather than a
// list: "Full Blood Count (FBC)" → "fbc", but "Acute Hepatitis Screen (Hep A
// IgM, Hep B sAg, Hep C)" → '' , which is a list of what is in the test.
function abbreviation(test) {
  const found = /\(([^)]{2,8})\)/.exec(String(test || ''));
  if (!found || /,/.test(found[1])) return '';
  return norm(found[1]);
}

/**
 * The forms the practice has recorded, each exactly as it was filled in.
 *
 * `groups` are the screen's own sections in the screen's own order, holding the
 * boxes that are ticked. `ordered` is the Ordered Items list as the screen
 * shows it — kept separately rather than derived from the groups, because it is
 * what the reader checks their own screen against, and it is listed in the
 * order the boxes were ticked rather than in section order.
 *
 * `clinicalDetails` is what was typed into that box on the recorded form. The
 * card overwrites it with the check the reader named — that is the whole point
 * of the field — and falls back to this when they named none.
 */
export const BLOOD_FORMS = [
  {
    id: 'healthCheck',
    // What this form is for, in the practice's own words. Matched against the
    // message by `bloodForm` below.
    check: 'Health check',
    re: /\b(nhs health check|health check|new patient (?:health )?check|well ?(?:man|woman) check|cvs|cardiovascular)\b/i,
    // What says its words while asking for something else. "Mental health
    // check" contains "health check" and is not one — and answering it with
    // this panel is the exact mistake the whole file is arranged to avoid.
    // Same shape as the nurse tasks' `not` in lib/triage/destinations.mjs.
    not: /\b(mental health|learning disabilit|diabet|asthma|at.risk|medication|drug monitoring)/i,
    groups: [
      { heading: 'Biochemistry 1', tests: ['Electrolytes + Creatinine', 'Liver Profile (LFT)'] },
      { heading: 'Biochemistry 2', tests: ['TFTs - Free T4 & TSH'] },
      { heading: 'Haematology', tests: ['Full Blood Count (FBC)'] },
    ],
    ordered: [
      'Electrolytes + Creatinine',
      'Liver Profile (LFT)',
      'TFTs - Free T4 & TSH',
      'Full Blood Count (FBC)',
    ],
    clinicalDetails: 'CVS',
  },
];

/** Every test on a recorded form, in the order the Ordered Items box lists them. */
export const orderedItems = (form) => (form && form.ordered ? form.ordered.slice() : []);

/**
 * The recorded form for what was named, or null.
 *
 * Matched on the whole string the model returned rather than on a fixed list of
 * ids: "NHS health check", "new patient check" and "health check bloods" are
 * the same form, and reception types all three.
 */
export function bloodForm(check = '') {
  const asked = String(check || '').trim();
  if (!asked) return null;
  return BLOOD_FORMS.find((f) => f.re.test(asked) && !(f.not && f.not.test(asked))) || null;
}

/**
 * What goes in Clinical Details: the type of health check, in the words the
 * reader used, with only the words that are not the name of a check taken out.
 * "bloods for an NHS health check" is typed into that box as "NHS Health
 * Check"; "blood form" names no check at all and comes back empty.
 *
 * The reader's own words rather than a canonical name on purpose: the practice
 * writes "CVS" on one form and "NHS Health Check" on the next, and neither is
 * this file's to correct.
 */
export function clinicalDetails(check = '') {
  const said = String(check || '')
    .replace(/\b(blood(?:s| test| form)?s?|form|pathology|request|order|tests?|please|for|the|a|an)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return said ? said.replace(/^[a-z]/, (c) => c.toUpperCase()) : '';
}

/* ------------------------------------------ the practice's own Notebook */
//
// THE ARRAY ABOVE IS NOT THE PRACTICE'S LIST, and it never will be: it holds
// the one filled-in form somebody sent. The practice writes down far more than
// it sends screenshots of, and "Mental health review blood form" asked about a
// review that may well be written on a Notebook page — in which case answering
// "no form recorded" asserts the practice has nothing for something it wrote
// down, which is the worst shape a wrong answer takes.
//
// So the Notebook is READ, by name, before the card gives up. The same
// arrangement the emailed referrals use next door in ./referrals.mjs, and it
// stays honest the same way: the model names the review — extraction, which it
// does reliably — and code does everything after that. The page has to really
// be about bloods, the review has to really be named on it, and what comes back
// is the page's OWN words, quoted, with the page named on the card.

// A page that is about blood tests rather than one that mentions blood once.
function isBloodsPage(page) {
  const title = String(page?.docTitle || '');
  const text = String(page?.text || '');
  return /\b(blood|bloods|phlebotom|patholog|test request)/i.test(title + ' ' + text);
}

// What the reader might have called the check. The trailing "bloods", "blood
// form" and "review" are theirs, not necessarily the page's.
function checkVariants(check) {
  const base = norm(check).replace(/\s*(blood(?:s| test| form)?s?|forms?)\s*$/, '').trim();
  if (!base) return [];
  const out = new Set([base]);
  const shorter = base.replace(/\s*(review|check|screening|screen)\s*$/, '').trim();
  // Two words at least before the suffix comes off: "mental health review"
  // still names a review as "mental health", but "review" on its own names
  // nothing and would match every line on the page.
  if (shorter && shorter.split(' ').length >= 2) out.add(shorter);
  return [...out];
}

const namesCheck = (line, variants) => {
  const l = norm(line);
  return !!l && variants.some((v) => new RegExp('\\b' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(l));
};

const isListLine = (line) => /^(?:[-*•+]|\d+[.)])\s+\S/.test(line);
const listText = (line) => line.replace(/^(?:[-*•+]|\d+[.)])\s+/, '').replace(/^\*+|\*+$/g, '').trim();

// The tests on one line, after whatever named the check. "Mental health review
// — FBC, U&E, LFT, lipids" is four tests; a sentence about booking is none.
function testsOnLine(line) {
  const tail = /[—–:|]\s*(.+)$/.exec(String(line || '').replace(/\*/g, ''));
  if (!tail) return [];
  return splitTests(tail[1]);
}

const MAX_TESTS = 14;
function splitTests(text) {
  return String(text || '')
    // Commas, semicolons and "and" — NOT "+" and NOT "/". The form's own boxes
    // are called "Electrolytes + Creatinine" and "Urine Protein/Creatinine
    // Ratio", so splitting on either would cut a test name in half and put two
    // tests that do not exist on the Ordered Items list.
    .split(/\s*(?:[,;]|\band\b)\s*/i)
    .map((t) => t.replace(/[.\s]+$/, '').trim())
    // A test name, not a sentence about one. Anything long enough to be prose
    // is prose, and putting prose in the Ordered Items box is worse than
    // leaving it empty.
    .filter((t) => t && t.length <= 48 && t.split(' ').length <= 6)
    .slice(0, MAX_TESTS);
}

/**
 * What the practice's Notebook says the bloods for this check are, or null.
 *
 * Two shapes, because the Notebook is written by people: the tests on the same
 * line as the check ("Mental health review — FBC, U&E, LFT"), and the tests
 * listed under it (a line naming the check, then bullets). Nothing else counts:
 * a page mentioning a review in a paragraph has not listed its bloods.
 *
 * @param {string} check the review, as the model read it
 * @param {Array}  pages the Notebook, as loaded for this turn
 */
export function findRecordedBloods({ check = '', pages = [] } = {}) {
  const variants = checkVariants(check);
  if (!variants.length) return null;

  for (const page of pages || []) {
    if (!isBloodsPage(page)) continue;
    const lines = String(page.text || '').split(/\r?\n/).map((l) => l.trim());
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line || !namesCheck(line, variants)) continue;

      // Same line: "Mental health review — FBC, U&E, LFT, lipids".
      const inline = testsOnLine(isListLine(line) ? listText(line) : line);
      if (inline.length >= 2) return { page: String(page.docTitle || ''), line: listText(line) || line, tests: inline };

      // Listed under it: the bullets that follow, until they stop.
      //
      // A line or two of lead-in is allowed before the first bullet — people
      // write "Blood tests to order first:" under the heading and then the
      // list — but not a heading, which is the next subject starting, and not
      // a paragraph, which is prose about something else.
      const under = [];
      let leadIn = 0;
      for (let j = i + 1; j < lines.length && under.length < MAX_TESTS; j += 1) {
        const next = lines[j];
        if (!next) { if (under.length) break; continue; }
        if (!isListLine(next)) {
          if (under.length || /^#/.test(next) || next.length > 80 || leadIn >= 2) break;
          leadIn += 1;
          continue;
        }
        under.push(...splitTests(listText(next)));
      }
      if (under.length >= 2) return { page: String(page.docTitle || ''), line: line.replace(/^#+\s*/, ''), tests: under.slice(0, MAX_TESTS) };
    }
  }
  return null;
}

// What makes a string the name of a check rather than the tail of a question.
// Deliberately small: the recorded forms are matched by name of their own, and
// this only has to tell "diabetes review" from "what goes on".
const CHECK_WORDS = /\b(check|review|screen(?:ing)?|monitoring|mot)\b/i;

// The two gates that stop a blood form before the tests on it matter: who may
// be bled here at all, and by when. Taken from the practice's hard gates BY
// NAME rather than by matching their wording — the gate is a key and the rule
// is prose, and a card that greps prose loses the rule the day somebody
// rewrites it.
const GATES = ['Health check bloods', 'Under 16 — blood tests'];
const TIMING = GATES
  .map((gate) => HARD_GATES.find((g) => g.gate === gate))
  .filter(Boolean)
  .map((g) => '**' + g.gate + '** — ' + g.rule);

const SOURCE = ['Blood form — test requests (EMIS Web)', 'Reviews that need a blood test first'];

/**
 * The card.
 *
 * `check` is the type of health check or review the message named, in whatever
 * words it used; `pages` is the Notebook as loaded for this turn. Four ways it
 * can go, and they are different answers:
 *
 *   A check this file holds a filled-in form for — the form, as it was sent.
 *
 *   A check the practice's Notebook lists the bloods for — those tests, in its
 *   own words, with the page and the line it came from named on the card, and
 *   the boxes ticked wherever a listed test names exactly one box.
 *
 *   A check nobody has written down — NOTHING ticked, the gap flagged, and the
 *   form's own list of boxes shown, because "which items do I select" is what
 *   was being asked and the boxes are the same boxes whatever the review.
 *
 *   No check named at all ("what goes on a blood form") — the one filled-in
 *   form the practice has recorded, said to be that one.
 */
export function bloodFormAnswer({ check = '', pages = [] } = {}) {
  const asked = String(check || '').trim();
  const recorded = bloodForm(asked);
  const said = clinicalDetails(asked);
  // What the message named, IF it named a check. Two things are not that, and
  // they are different from each other: a question about the form itself
  // ("what goes on a blood form"), and words left over from one ("what goes
  // on"). Neither is a check nobody has recorded, and answering either with
  // "no form recorded for what goes on" is a card that has misread its own
  // input. So a check is a recorded form, or text that says check or review.
  const named = recorded ? said : (CHECK_WORDS.test(said) ? said : '');
  const form = recorded || (named ? null : BLOOD_FORMS[0]);

  // Nothing recorded here — so read the practice's own pages before giving up.
  const written = !form && named ? findRecordedBloods({ check: asked, pages }) : null;

  // What goes in the Ordered Items box, and which boxes that ticks. A test the
  // page names that matches one box gets ticked; one that matches none or
  // several stays on the list for the reader to find, which is what Test Search
  // is for. Never a guess: two boxes matching is a question, not a near miss.
  const ordered = form ? orderedItems(form) : (written ? written.tests : []);
  const groups = form ? form.groups : ticked(written ? written.tests : []);

  const unrecorded = !!named && !form && !written;
  const details = named || (form ? form.clinicalDetails : '');

  return answer({
    title: 'Blood form',
    subtitle: unrecorded
      ? 'Nothing recorded for ' + details.toLowerCase() + ' — the form’s own list is below'
      : named
        ? details + ' — the tests to order, and what goes in Clinical Details'
        : form.check + ' bloods — the tests to order, and what goes in Clinical Details',
    blocks: [
      unrecorded ? note(
        '**Neither a filled-in form nor a Notebook page records the bloods for '
        + details.toLowerCase() + '.** Nothing is ticked below, because the health-check panel under another '
        + 'review’s name is a patient bled for the wrong tests. Take the tests from the clinician’s request '
        + 'or ask the nurse — and the form’s own list of boxes is below, to find each one by its exact wording.',
        'warn',
      ) : null,

      // Read off the practice's own page. It says which page and quotes the
      // line, because a list of tests with nothing behind it is indistinguishable
      // from a list of tests somebody made up.
      written ? note(
        'These are the tests **' + written.page + '** lists for ' + details.toLowerCase()
        + ' — "' + written.line + '". They are that page’s words, so a name may not match a box exactly; '
        + '**Test Search** finds one by name.',
        'info',
      ) : null,

      // Nobody said which check. The form below is a real one and the card says
      // which, rather than letting it read as the panel for every review.
      !named && form ? note(
        'This is the blood form the practice has recorded — the **' + form.check.toLowerCase() + '**. Clinical Details on it reads **'
        + form.clinicalDetails + '**; change it to the check the patient is booked for. For a review with a '
        + 'different form, say which and the card follows it.',
        'info',
      ) : null,

      // The screen itself, filled in. Ordered Items is the list the reader
      // checks their own screen against; Clinical Details is the box that is
      // left empty otherwise. `offered` is every box the form carries, shown
      // whenever the card could not fill the ticks in for the reader.
      pathology({
        groups,
        ordered,
        // The form's own boxes, drawn in the screen ONLY when the card has no
        // ticks to show. Then they are the answer — "which item do I select" —
        // and they belong where the reader's eye already is. Where something IS
        // ticked, the answer is the ticks, and twenty-six extra boxes around
        // them is scrolling rather than help: the full list goes behind the
        // disclosure below instead.
        offered: form || groups.length ? [] : FORM_SECTIONS,
        clinicalDetails: details,
        ticksMissing: 'Nothing recorded to tick — find the boxes the request names below',
        orderedMissing: 'Nothing ordered yet — the list fills as the boxes are ticked',
        detailsMissing: 'The type of health check — "NHS Health Check", "New patient health check"',
      }),

      note(
        '**Clinical Details is the type of health check**, and it is not optional: it is what the laboratory reads to know why the sample was sent. A form that goes off with it empty comes back queried.',
        'info',
      ),

      steps([
        'On the patient’s record, open **Test Requests** and go to the **Order** tab.',
        ordered.length
          // The box's own wording wherever a listed test names one, because
          // that is what the reader is looking for on the screen; the page's
          // word otherwise, because inventing a box for it would be worse.
          ? 'Under **Pathology**, tick ' + ordered.map((t) => '**' + (formItem(t) || t) + '**').join(', ')
            + '. **Test Search** finds any that is not on the visible list.'
          : 'Under **Pathology**, tick the tests the request asks for. **Test Search** finds one by name if it is not on the visible list.',
        'Check the **Ordered Items** list on the right reads back the same tests — that list, not the tick boxes, is what gets sent.',
        'Type the type of health check into **Clinical Details**' + (details ? ' — **' + details + '**.' : '.'),
      ]),

      // The rest of the form, for a test the ticks above did not settle — "U&E"
      // and "HbA1c" name no single box, and the reader still has to find them.
      !form && groups.length ? expand('Every box on the form — for a test not ticked above', [
        table(['Section', 'Tests'], FORM_SECTIONS.map((s) => [s.heading, s.tests.join(', ')])),
        note('The screenshot the practice recorded ends below Haematology, so this is not every test there is. **Test Search** finds one by name.', 'info'),
      ]) : null,

      ...TIMING.map((rule) => note(rule, 'warn')),

      expand('Which reviews need the bloods first', [
        bullets(BLOODS_FIRST),
        note('The bloods are booked BEFORE the review, not after it. Results take about five working days, so a review booked the wrong way round wastes both appointments.', 'info'),
      ]),
    ],
    source: written ? [written.page, ...SOURCE] : SOURCE,
    // A gap the practice should hear about, rather than one met with a shrug at
    // the desk: a review that needs bloods first and is written down nowhere.
    flag: unrecorded ? 'No bloods recorded for ' + details.toLowerCase() : '',
  });
}

/**
 * The boxes a list of test names ticks, under the form's own section headings.
 *
 * Only the names that name exactly one box. The rest are still on the Ordered
 * Items list — they are what the page said — but nothing is ticked on a guess.
 */
function ticked(tests = []) {
  const bySection = new Map();
  for (const name of tests) {
    const box = formItem(name);
    if (!box) continue;
    const heading = sectionOf(box);
    if (!bySection.has(heading)) bySection.set(heading, []);
    if (!bySection.get(heading).includes(box)) bySection.get(heading).push(box);
  }
  // In the form's own order, sections and boxes both, so the card reads down
  // the screen the way the reader's eye does — not in the order the page that
  // listed them happened to write them.
  return FORM_SECTIONS
    .filter((s) => bySection.has(s.heading))
    .map((s) => ({
      heading: s.heading,
      tests: s.tests.filter((t) => bySection.get(s.heading).includes(t)),
    }));
}
