// The card for "which template has the page for this job".
//
// The contract card next door (contracts.mjs) answers from the Sitrep: this
// contract is recorded on that template, and here is how far PCIT had got
// building it. It can only answer for the 42 commissioned specifications, which
// is a small part of what anybody does in a day. A firearms request, an
// ambulance, a loaned crutch, a sick note, a smear, hay fever — none is a
// contract, all are pages PCIT have published, and every one of them was
// answered "no contract by that name".
//
// This card answers those, from Primary Care IT's four OneTemplate page
// specifications (lib/referrals/one-templates.mjs).
//
// IT IS CAREFUL NOT TO LOOK LIKE THE CONTRACT CARD. No status, because these
// documents carry none — a page list says what exists, not how far a build has
// got — and no contract area, because a page is not commissioned. What it does
// carry is the launcher, which is the part a reader actually needs: knowing the
// page is on OneTemplate Admin is no use without knowing that OneLauncher Admin
// is the F12 button that opens it.
import { answer, field, fields, note, table } from './blocks.mjs';
import { findTemplatePages, oneTemplates, templateByName } from '../referrals/one-templates.mjs';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-08-19" → "19 August 2026". The date is on every card, as it is on the contract's. */
export function saidDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

const pageSource = (captured) => [`Primary Care IT OneTemplate page specifications, as at ${saidDate(captured)}`];

// What the documents are, said once and shown on every card, because "PCIT say
// so" is only checkable if the reader knows which document to open.
const documentNote = (result) => note(
  `From Primary Care IT’s OneTemplate page specifications — ${(result.documents || []).map((d) => d.title).join(', ')} — as handed over on ${saidDate(result.capturedAt)}. These say which pages a template carries. They do not say whether the work is commissioned or how far a build has got: that is the NEL Local Contract Specifications, which this mode searches first.`,
  'info',
);

const howToOpen = (row) => {
  const open = row.launcher
    ? `Press F12 for ${row.launcher}, then open ${row.template}`
    : `Open ${row.template} from OneLauncher (the F12 button)`;
  return row.heading
    ? `${open}, then the ${row.heading} page — ${row.page} is listed on it.`
    : `${open}, then the ${row.page} page.`;
};

/** One page, named outright. */
function pageCard(row, result) {
  const alsoOn = (result.alsoOn || []).map((r) => r.template).filter(Boolean);
  return answer({
    title: row.page,
    subtitle: row.heading
      ? `On the ${row.heading} page of ${row.template}`
      : `A page on ${row.template}`,
    blocks: [
      // The route to it, in the order it is walked: the F12 launcher, the
      // template, the page, and — where PCIT nest their list — the entry on
      // that page. Being told the template alone leaves a reader scrolling.
      fields([
        field('Press', row.launcher, { missing: 'OneLauncher' }),
        field('Then open', row.template, { copy: true }),
        field('The page', row.heading || row.page, { copy: true }),
        row.heading ? field('On that page', row.page) : null,
        row.group ? field('Listed under', row.group) : null,
        row.audience ? field('Used by', row.audience) : null,
        alsoOn.length ? field('Also on', alsoOn.join(', ')) : null,
      ], 'Where to find it'),
      row.detail ? note(`What the page is for: ${row.detail}`, 'info') : null,
      note(howToOpen(row), 'info'),
      documentNote(result),
    ],
    source: pageSource(result.capturedAt),
  });
}

/** Several pages it could be. */
function pageShortlistCard(result) {
  return answer({
    title: `${result.query} — ${result.matches.length} pages on the OneTemplates`,
    subtitle: 'More than one page matches',
    blocks: [
      note('The names below are exactly as Primary Care IT list them. Nothing has been resolved to one: a page that reads like the job is not always the page the job is recorded on.', 'info'),
      table(['Page', 'Where to find it', 'What it records'], result.matches.map((row) => [
        row.page,
        row.heading ? `${row.template} → ${row.heading}` : row.template,
        row.detail || (row.group ? `Listed under ${row.group}` : '—'),
      ])),
      documentNote(result),
    ],
    source: pageSource(result.capturedAt),
  });
}

/** The whole page list of a template somebody named. */
function templateCard(template, result) {
  return answer({
    title: template.name,
    subtitle: `${template.pages.length} page${template.pages.length === 1 ? '' : 's'}, as Primary Care IT list them`,
    blocks: [
      fields([
        field('Open it from', template.launcher, { missing: 'OneLauncher' }),
        template.audience ? field('Used by', template.audience) : null,
      ], 'On EMIS Web'),
      template.about ? note(template.about, 'info') : null,
      table(['Page', 'Where to find it', 'What it records'], template.pages.map((p) => [
        p.name,
        p.heading ? `On the ${p.heading} page` : 'A page of its own',
        p.detail || (p.group ? `Listed under ${p.group}` : '—'),
      ])),
      documentNote(result),
    ],
    source: pageSource(result.capturedAt),
  });
}

/**
 * The page answer for what was asked, or null when the specifications have
 * nothing for it — which is the caller's signal to say so outright.
 *
 * A template named in full is answered with its whole page list first: "what is
 * on OneTemplate Admin" is a question about the template, and ranking its
 * thirty-four pages against the word "admin" answers a different one.
 */
export function templatePageAnswer(query) {
  const asked = String(query || '').trim();
  if (!asked) return null;
  const all = oneTemplates();
  const result = { capturedAt: all.capturedAt, documents: all.documents };

  const named = templateByName(asked);
  if (named && named.pages.length) return templateCard(named, result);

  const found = findTemplatePages(asked);
  if (!found.matches.length) return null;
  if (found.confident) return pageCard(found.matches[0], found);
  return pageShortlistCard(found);
}
