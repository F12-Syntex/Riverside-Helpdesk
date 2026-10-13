// What the contact form checks before it sends anything, and what it says
// when something is wrong.
//
// The server is the rule (lib/contacts-store.js validateContact): a name, and
// at least one phone number or email address. But the server is also quiet
// about what it throws away — a "number" with fewer than three digits, or an
// address that is not an address, is dropped without a word, and a contact
// saved with its only number dropped is refused for having none. So the form
// says it first, under the field it is about, while the person can still see
// what they typed. Pure, so it can be tested without a page.

// The server keeps at most this many of each (cleanPhones, cleanEmails), and
// clips each field to these lengths (clip).
export const MAX_PHONES = 8;
export const MAX_EMAILS = 6;
export const MAX_LEN = { label: 160, category: 60, phone: 40, email: 120, alias: 80, note: 400 };

// The server's own test for an address, word for word.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// An extension at the end, however it is written: "ext 214", "ext. 214",
// "extension 214", "x214", "#214".
const EXTENSION = /\s*[,;]?\s*(?:ext(?:ension)?\.?|x|#)\s*\d{1,6}\s*$/i;

/**
 * What is wrong with a phone number as typed, or '' when nothing is.
 *
 * A sanity check, not a dialling plan: a UK number is ten or eleven digits
 * behind a 0 (or +44 / 0044, with or without the "(0)"), in any spacing and
 * brackets; a short service number (111, 116 123) is three to six digits
 * with no 0; an extension may follow, and so may a second number or
 * extension after a "/", as the practice's sheet writes them
 * ("0207 683 4040/4000"). `known` is the numbers the contact already had:
 * those are left alone, so changing a note never means retyping a number
 * the sheet has always written its own way.
 */
export function phoneProblem(raw, known = []) {
  const value = String(raw || '').trim();
  if (!value || known.includes(value)) return '';
  const [main, ...more] = value.replace(EXTENSION, '').split('/');
  if (/[^\d\s()+.\-]/.test(main) || more.some((m) => !/^\s*\d[\d\s]*$/.test(m))) {
    return 'Use digits, spaces and brackets only, with “ext” before an extension.';
  }
  if (main.lastIndexOf('+') > 0) return 'A “+” only goes at the start, as in +44 20 8510 5555.';
  let digits = main.replace(/\D/g, '');
  if (main.trim().startsWith('+') || digits.startsWith('0044')) {
    digits = digits.startsWith('0044') ? digits.slice(2) : digits;
    if (!digits.startsWith('44')) return 'Use a UK number, starting 0 or +44.';
    digits = '0' + digits.slice(2).replace(/^0/, '');
  }
  if (!digits.startsWith('0')) {
    return digits.length >= 3 && digits.length <= 6 ? '' : 'A UK number starts with 0, as in 020 8510 5555.';
  }
  if (digits.length < 10) return 'That number is too short. A UK number has 10 or 11 digits.';
  if (digits.length > 11) return 'That number is too long. Put an extension after “ext”.';
  return '';
}

export function emailProblem(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  return EMAIL.test(value) ? '' : 'Enter an email address like team@nhs.net.';
}

export function nameProblem(raw) {
  return String(raw || '').trim() ? '' : 'Enter the contact’s name.';
}

export const REACH_PROBLEM = 'Add a phone number or an email address.';

/**
 * Every problem with a draft at once: { label, phones[], emails[], reach },
 * each '' when that part is fine. `reach` is the server's "at least one way
 * to get hold of them", judged on what would survive the server's cleaning.
 */
export function checkDraft(draft) {
  const known = draft.knownPhones || [];
  const phones = draft.phones.map((p) => phoneProblem(p, known));
  const emails = draft.emails.map((e) => emailProblem(e));
  const reachable = draft.phones.some((p, i) => p.trim() && !phones[i] && p.replace(/\D/g, '').length >= 3)
    || draft.emails.some((e, i) => e.trim() && !emails[i]);
  const anyTyped = draft.phones.some((p) => p.trim()) || draft.emails.some((e) => e.trim());
  return {
    label: nameProblem(draft.label),
    phones,
    emails,
    // Said only when nothing at all was typed: a number that is wrong has
    // its own message under it, which is the one to fix.
    reach: reachable || anyTyped ? '' : REACH_PROBLEM,
  };
}

export const hasProblems = (p) => !!(p.label || p.reach || p.phones.some(Boolean) || p.emails.some(Boolean));
