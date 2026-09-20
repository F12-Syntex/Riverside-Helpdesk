// What a well-shaped Notebook page looks like, as rules code can check.
//
// The answer pipeline reads pages by shape: a referral-pathway page is parsed
// for its labelled fields, a contacts page for its numbers. Every time the
// practice writes a page in a new shape, a parser has to learn it or the
// answer is wrong — the physio page's "**Clinic type:**" under a bold bullet
// was invisible for exactly that reason. These rules say what the parsers can
// read and what makes a page hard to answer from, so the map can show it and
// the rewrite can fix it.
//
// Pure. A rule never touches the database or a model.
import { isPathwayPage, readPathways } from '../referrals/pathways.mjs';
import { extractEmails, extractPhones } from '../lookup/contact-extract.mjs';
import { isContent } from './sentences.mjs';

/** The labels a typed page may use. Anything else is an alias to fix or an unknown. */
export const LABELS = ['Speciality', 'Clinic type', 'Priority', 'Hospital', 'Service', 'Form', 'Send to'];

export const LABEL_ALIASES = {
  specialty: 'Speciality',
  'speciality area': 'Speciality',
  clinic: 'Clinic type',
  urgency: 'Priority',
  location: 'Hospital',
  site: 'Hospital',
  trust: 'Hospital',
  provider: 'Hospital',
  organisation: 'Hospital',
  pathway: 'Service',
  'service name': 'Service',
  'referral form': 'Form',
  'form name': 'Form',
  template: 'Form',
  route: 'Send to',
  via: 'Send to',
  'send via': 'Send to',
  'sent by': 'Send to',
  email: 'Send to',
  'email to': 'Send to',
};

const LABEL_LINE = /^\s*(?:[-*+•]\s+)?(?:\*\*|__)?([A-Za-z][A-Za-z /-]{1,30}?)(?:\*\*|__)?\s*:\s*(\S.*)$/;

/**
 * The canonical field a "Label: value" line states, or null if it states none.
 * Here rather than with the sweep that uses it because the browser previews the
 * edit a decision will make, and must reach the same answer the server will.
 */
export function fieldOf(text) {
  const m = LABEL_LINE.exec(String(text || ''));
  if (!m) return null;
  const key = m[1].trim();
  const canon = LABELS.find((l) => l.toLowerCase() === key.toLowerCase()) || LABEL_ALIASES[key.toLowerCase()] || null;
  if (!canon) return null;
  const value = m[2].replace(/\*\*|__/g, '').trim();
  return value ? { field: canon, value } : null;
}

/**
 * @typedef {{ rule: string, severity: 'error'|'warn'|'info', weight: number, message: string,
 *             sentenceIds?: string[], line?: number }} Violation
 */

const HEADING_LINE = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const STEP_LINE = /^\s*\d+[.)]\s+\S/;
const LABEL_KEY = /^\s*(?:[-*+•]\s+)?(?:\*\*|__)?([A-Za-z][A-Za-z /-]{1,30}?)(?:\*\*|__)?\s*:\s*\S/;

const lines = (ctx) => String(ctx.page?.text ?? ctx.note?.body ?? '').replace(/\r\n/g, '\n').split('\n');

const v = (rule, severity, weight, message, extra = {}) => ({ rule, severity, weight, message, ...extra });

/** How a page is typed by where it lives. */
export function typedOf(page) {
  if (!page) return null;
  if (isPathwayPage(page)) return 'pathway';
  const path = String(page.docTitle || '');
  if (/contacts?|directory|phone|numbers/i.test(path.split('/').slice(0, -1).join('/'))) return 'contacts';
  return null;
}

export const RULES = [
  {
    id: 'variants-one-page',
    severity: 'warn',
    weight: 5,
    title: 'One page per version',
    check(ctx) {
      // SEVERAL VERSIONS OF ONE REFERRAL, ON ONE PAGE, WITH THE SAME PAIRING.
      //
      // The dermatology page records normal, telederm, community and two
      // cancer pathways. Four of them type the same speciality and clinic type
      // into e-RS and differ only in which hospital to pick — so the page
      // cannot be addressed by its title, and which version a reader gets comes
      // down to how their wording scores against the row names. It is the one
      // page shape that can answer a question with the opposite of the answer,
      // and it is invisible from the outside: every field on it is correct.
      if (ctx.typed !== 'pathway' || !ctx.page) return [];
      const entries = readPathways([ctx.page]);
      if (entries.length < 2) return [];
      const groups = new Map();
      for (const e of entries) {
        const key = [e.specialty, e.clinicType].map((s) => String(s || '').toLowerCase().trim()).join('|');
        if (!key.replace(/|/g, '')) continue;
        groups.set(key, (groups.get(key) || []).concat(e.name || 'Untitled'));
      }
      const clashes = [...groups.values()].filter((names) => names.length > 1);
      if (!clashes.length) return [];
      const worst = clashes.sort((a, b) => b.length - a.length)[0];
      return [v('variants-one-page', 'warn', 5,
        `${worst.length} versions of this referral on one page type the same speciality and clinic type — ${worst.join(', ')}. A page each is answered by its own title; together they are told apart only by how a question is worded.`)];
    },
  },

  {
    id: 'one-procedure',
    severity: 'info',
    weight: 4,
    title: 'One procedure per page',
    check(ctx) {
      // Two or more headings each followed by a numbered list of three or more
      // steps is two procedures on one page.
      const ls = lines(ctx);
      let procedures = 0;
      for (let i = 0; i < ls.length; i++) {
        if (!HEADING_LINE.test(ls[i])) continue;
        let steps = 0;
        for (let j = i + 1; j < ls.length && !HEADING_LINE.test(ls[j]); j++) if (STEP_LINE.test(ls[j])) steps++;
        if (steps >= 3) procedures++;
      }
      return procedures >= 2 ? [v('one-procedure', 'info', 4, `${procedures} step-by-step procedures on one page — one page per procedure answers better.`)] : [];
    },
  },
  {
    id: 'label-vocab',
    severity: 'warn',
    weight: 6,
    title: 'Fixed label vocabulary',
    check(ctx) {
      if (ctx.typed !== 'pathway') return [];
      const out = [];
      for (const s of ctx.sentences || []) {
        if (s.kind !== 'label') continue;
        const m = LABEL_KEY.exec(s.text);
        if (!m) continue;
        const key = m[1].trim();
        if (LABELS.some((l) => l.toLowerCase() === key.toLowerCase())) continue;
        const alias = LABEL_ALIASES[key.toLowerCase()];
        // Notes, tips and the like are prose with a colon, not fields.
        if (!alias && !/special|clinic|priority|hospital|service|form|send|route|via|location|site|email/i.test(key)) continue;
        out.push(v('label-vocab', 'warn', 6, alias ? `“${key}:” should be “${alias}:”.` : `“${key}:” is not one of the labels the parsers read (${LABELS.join(', ')}).`, { sentenceIds: [s.id], line: s.line }));
      }
      return out;
    },
  },
  {
    id: 'inline-html',
    severity: 'warn',
    weight: 5,
    title: 'No inline HTML',
    check(ctx) {
      const out = [];
      lines(ctx).forEach((l, i) => {
        if (/<(span|font|div|p|br|style)\b[^>]*>/i.test(l)) out.push(v('inline-html', 'warn', 5, 'Inline HTML (colour or layout tags) — the assistant reads the tags as text.', { line: i + 1 }));
      });
      return out.slice(0, 5);
    },
  },
  {
    id: 'stray-bold',
    severity: 'warn',
    weight: 3,
    title: 'No stray bold markers',
    check(ctx) {
      const out = [];
      lines(ctx).forEach((l, i) => {
        const stars = (l.match(/\*\*/g) || []).length;
        if (/\\\*\\\*/.test(l) || stars % 2 === 1) out.push(v('stray-bold', 'warn', 3, 'Unbalanced or escaped ** on this line.', { line: i + 1 }));
      });
      return out.slice(0, 5);
    },
  },
  {
    id: 'empty-section',
    severity: 'warn',
    weight: 5,
    title: 'No empty headings',
    check(ctx) {
      const ls = lines(ctx);
      const out = [];
      for (let i = 0; i < ls.length; i++) {
        const h = HEADING_LINE.exec(ls[i]);
        if (!h) continue;
        let j = i + 1;
        while (j < ls.length && !ls[j].trim()) j++;
        const next = j < ls.length ? HEADING_LINE.exec(ls[j]) : null;
        if (j >= ls.length || (next && next[1].length <= h[1].length)) {
          out.push(v('empty-section', 'warn', 5, `Heading “${h[2]}” has nothing under it.`, { line: i + 1 }));
        }
      }
      return out;
    },
  },
  {
    id: 'duplicate',
    severity: 'warn',
    weight: 6,
    title: 'No sentence repeated on another page',
    check(ctx) {
      if (!ctx.dupIndex) return [];
      const out = [];
      for (const s of ctx.sentences || []) {
        if (!isContent(s) || s.kind === 'label') continue;
        if (s.norm.length < 40 || s.norm.split(' ').length < 6) continue;
        const others = (ctx.dupIndex.get(s.norm) || []).filter((d) => d.noteId !== ctx.note?.id);
        if (!others.length) continue;
        out.push(v('duplicate', 'warn', 6, `Also on ${others.map((o) => `“${o.title}”`).join(', ')}.`, { sentenceIds: [s.id], line: s.line }));
        if (out.length >= 20) break;
      }
      return out;
    },
  },
  {
    id: 'restatement',
    severity: 'info',
    weight: 2,
    title: 'Name the procedure, do not restate it',
    check(ctx) {
      const out = [];
      for (const s of ctx.sentences || []) {
        if (/\b(?:follow|as per|use|see)\s+the\s+(?:standard|usual|normal)\s+(?:referral\s+)?(?:process|procedure|pathway|steps|flow)\b/i.test(s.text)) {
          out.push(v('restatement', 'info', 2, 'Points at “the standard process” without naming the page that holds it.', { sentenceIds: [s.id], line: s.line }));
        }
      }
      return out.slice(0, 3);
    },
  },
  {
    id: 'title-referral',
    severity: 'info',
    weight: 1,
    title: 'Titles without the word “referral”',
    check(ctx) {
      if (ctx.typed !== 'pathway') return [];
      const title = String(ctx.note?.title || '');
      return /\breferrals?\b/i.test(title) ? [v('title-referral', 'info', 1, 'Every page in this section is a referral; the word in the title only gets in the way of matching the service name.')] : [];
    },
  },
  {
    id: 'stub',
    severity: 'warn',
    weight: 8,
    title: 'Not a stub',
    check(ctx) {
      const content = (ctx.sentences || []).filter(isContent).map((s) => s.text).join(' ');
      return content.length < 80 ? [v('stub', 'warn', 8, content.length ? 'Under 80 characters of content.' : 'Nothing written on this page.')] : [];
    },
  },
  {
    id: 'typed-parse',
    severity: 'error',
    weight: 15,
    title: 'Typed pages must parse',
    check(ctx) {
      if (!ctx.page) return [];
      if (ctx.typed === 'pathway') {
        const records = readPathways([ctx.page]);
        if (!records.length) return [v('typed-parse', 'error', 15, 'No speciality or clinic type can be read off this page, so a referral question gets “not recorded”. Write them as “Speciality: …” and “Clinic type: …” lines.')];
        return [];
      }
      if (ctx.typed === 'contacts') {
        const text = String(ctx.page.text || '');
        if (!extractPhones(text).length && !extractEmails(text).length) return [v('typed-parse', 'error', 15, 'No phone number or email address on a contacts page.')];
      }
      return [];
    },
  },
];

/** Every violation on a page. */
export function runRules(ctx) {
  const out = [];
  for (const rule of RULES) {
    try { out.push(...rule.check(ctx)); } catch (e) { /* a rule that throws reports nothing */ }
  }
  return out;
}

/** Score 0–100 and a traffic-light band. */
export function healthOf(violations) {
  const list = violations || [];
  const score = Math.max(0, 100 - list.reduce((s, x) => s + (x.weight || 0), 0));
  // An error means the assistant cannot read the page. That is red whatever
  // the arithmetic says: a page that answers wrongly is not "mostly fine".
  if (list.some((x) => x.severity === 'error')) return { score: Math.min(score, 59), band: 'red' };
  return { score, band: score >= 85 ? 'green' : score >= 60 ? 'amber' : 'red' };
}
