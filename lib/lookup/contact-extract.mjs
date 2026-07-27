// Pulling real telephone numbers and email addresses out of a web page.
//
// The guarantee the rest of the app rests on is that a contact number is NEVER
// authored by a model — what the reader dials is a verbatim copy of what the
// source says. That is easy for the practice's own directory, which is
// structured data. This is how the same guarantee is kept for a number found on
// the open web: the page's own text is searched with a pattern, only an exact
// substring of it is ever shown, and it is shown with the URL it came from. The
// model chooses which pages are worth reading; it never writes a digit.
//
// Everything here is pure and works on a string, so the rules can be tested
// without a network — which matters, because the cost of getting one wrong is a
// receptionist dialling a number that belongs to something else.

const digitsOf = (value) => String(value || '').replace(/\D/g, '');

// A run that could be a UK telephone number: nine to fifteen digits joined by at
// most one separator each. Brackets are deliberately NOT part of the run —
// allowing them lets "020 8510 5555 (24 hours)" swallow the opening hours and
// come out the wrong length, which loses the number altogether.
const NUMBER_RUN = /\d(?:[ . -]?\d){8,13}/g;
// The two ways a page writes a number with its leading zero taken off. Matched
// in the text immediately before a run, so "+44 (0)20 7377 7000" and
// "020 7377 7000" resolve to the same number.
const INTERNATIONAL = /(?:\+\s?44|\b00\s?44)(?:[\s.-]*\(\s*0\s*\))?[\s.-]*$/;
const TRUNK_ZERO = /\(\s*0\s*\)[\s.-]*$/;


// tel: and mailto: links are the most reliable contact details on any page —
// somebody wrote them to be dialled — so they are read before the prose.
const TEL_HREF = /(?:href|data-href)\s*=\s*["']\s*tel:([^"'?]+)/gi;
const MAILTO_HREF = /(?:href|data-href)\s*=\s*["']\s*mailto:([^"'?&]+)/gi;

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// The same pattern anchored, for checking one address. Kept separate because the
// global form above carries a lastIndex and cannot be reused for a test.
const EMAIL_EXACT = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

// Words that turn a number-shaped run into something that must not be offered as
// a number to ring. A charity number and a phone number look identical.
const NOT_A_PHONE = /\b(?:nhs\s*number|company\s*(?:no|number|reg)|charity\s*(?:no|number)|registration\s*(?:no|number)|vat|invoice|account\s*(?:no|number)|ods\s*code|postcode|sort\s*code)\b/i;
const IS_FAX = /\bfax\b/i;

// An address that is machinery rather than a way of reaching a human.
const JUNK_EMAIL = /^(?:no-?reply|donotreply|do-not-reply|postmaster|abuse|webmaster|privacy|unsubscribe|sentry|wixpress|example|test)@|@(?:example\.(?:com|org)|sentry\.io|wixpress\.com|2x\.|localhost)/i;
const ASSET_SUFFIX = /\.(?:png|jpe?g|gif|webp|svg|css|js|woff2?|ttf)$/i;

// Turn what the page wrote into something a phone can dial. "+44 (0)20 7377
// 7000", "0044 20 7377 7000" and "020 7377 7000" are all the same number.
export function normaliseUkNumber(raw) {
  const trimmed = String(raw || '').trim();
  const digits = digitsOf(trimmed);
  if (trimmed.startsWith('+')) return '0' + digits.replace(/^44/, '').replace(/^0+/, '');
  if (digits.startsWith('0044')) return '0' + digits.slice(4).replace(/^0+/, '');
  return digits;
}

// UK national numbers are ten or eleven digits behind a zero, and the digit
// after that zero says what kind of number it is. Anything else in the same
// shape — a date, an NHS number, a reference off an invoice — is left alone
// rather than offered as something to dial.
export function isDialableUk(tel) {
  if (!/^0[12356789]\d{8,9}$/.test(tel)) return false;
  const body = tel.slice(1);
  if (/^(\d)\1+$/.test(body)) return false;            // 0111111111
  if ('0123456789'.includes(body) || '9876543210'.includes(body)) return false;
  return true;
}

// The words immediately before a number are what tell a receptionist whether
// they are looking at appointments, the switchboard or the fax. Taken from the
// page, trimmed to a label rather than a sentence.
function labelBefore(text, at) {
  const before = text.slice(Math.max(0, at - 80), at);
  const line = before.split(/[\n\r|•·]/).pop();
  return line
    .replace(/\s+/g, ' ')
    .replace(/[\s:–—-]+$/, '')
    .replace(/^.*?[.!?]\s+/, '')
    .trim()
    .slice(-48)
    .replace(/^\W+/, '')
    .trim();
}

/**
 * Every dialable UK number in a piece of text, in the order the page gives them.
 *
 * Returns `{ display, tel, label, kind }` — `display` is the exact run as the
 * page wrote it, so nothing has been re-typed on the way to the reader.
 */
export function extractPhones(text, { limit = 6 } = {}) {
  const source = String(text || '');
  const out = [];
  const seen = new Set();
  for (const match of source.matchAll(NUMBER_RUN)) {
    const run = match[0];
    const end = match.index + run.length;

    // A "+44" or a bracketed trunk zero sits just before the run rather than in
    // it. Where one does, it belongs to the number and is shown with it.
    const before = source.slice(Math.max(0, match.index - 16), match.index);
    const prefix = before.match(INTERNATIONAL) || before.match(TRUNK_ZERO);
    const start = prefix ? match.index - (before.length - prefix.index) : match.index;

    const display = source.slice(start, end).replace(/\s+/g, ' ').trim();
    const tel = prefix ? '0' + digitsOf(run).replace(/^0+/, '') : normaliseUkNumber(display);
    if (!isDialableUk(tel) || seen.has(tel)) continue;

    // Only the same line counts as context. A window that runs past a newline
    // reads the NEXT entry's label — which is how the appointments line ends up
    // labelled as the fax sitting under it.
    const label = labelBefore(source, start);
    const after = source.slice(end, end + 24).split(/[\n\r]/)[0];
    const context = label + ' ' + after;
    if (NOT_A_PHONE.test(context)) continue;

    seen.add(tel);
    out.push({ display, tel, label, kind: IS_FAX.test(context) ? 'fax' : 'phone' });
    if (out.length >= limit) break;
  }
  return out;
}

/** Every usable email address in a piece of text, best first. */
export function extractEmails(text, { limit = 4 } = {}) {
  const out = [];
  const seen = new Set();
  for (const match of String(text || '').matchAll(EMAIL)) {
    const address = match[0].toLowerCase().replace(/[.,;)]+$/, '');
    if (seen.has(address) || JUNK_EMAIL.test(address) || ASSET_SUFFIX.test(address)) continue;
    seen.add(address);
    out.push(address);
  }
  // An nhs.uk or nhs.net address is the one a receptionist wants; a generic
  // info@ on the same page is the fallback, not the headline.
  out.sort((a, b) => (/\.nhs\.(uk|net)$/.test(b) ? 1 : 0) - (/\.nhs\.(uk|net)$/.test(a) ? 1 : 0));
  return out.slice(0, limit);
}

// Strip a page down to readable text. Scripts, styles and markup go; the
// visible words stay, with enough spacing that "Telephone:020 8510 5555" does
// not arrive glued to the heading above it.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#160': ' ' };

export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?(?:br|p|div|li|tr|td|th|h[1-6]|section|article|header|footer)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (whole, name) => (name in ENTITIES ? ENTITIES[name] : whole))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The contact details on one page: the tel:/mailto: links first, because those
 * were written to be dialled, then anything the visible text offers.
 */
export function extractContacts(html, { phoneLimit = 6, emailLimit = 4 } = {}) {
  const raw = String(html || '');
  const text = /<[a-z!/]/i.test(raw) ? htmlToText(raw) : raw;

  const byTel = new Map();
  const addPhone = (phone) => {
    if (!phone) return;
    const known = byTel.get(phone.tel);
    if (!known) { if (byTel.size < phoneLimit) byTel.set(phone.tel, phone); return; }
    // The same number twice: once as a bare tel: href, once written out in the
    // prose with a heading over it. The prose form is how the page presents it
    // to a human, so it upgrades the href rather than being discarded as a
    // duplicate — otherwise the switchboard arrives as an unspaced digit run
    // with nothing saying what it is.
    if (!known.label && phone.label) {
      known.label = phone.label;
      known.display = phone.display;
      known.kind = phone.kind;
    }
  };
  for (const match of raw.matchAll(TEL_HREF)) {
    const display = decodeURIComponent(match[1]).replace(/\s+/g, ' ').trim();
    const tel = normaliseUkNumber(display);
    if (isDialableUk(tel)) addPhone({ display, tel, label: '', kind: 'phone' });
  }
  for (const phone of extractPhones(text, { limit: phoneLimit })) addPhone(phone);

  const emails = [];
  const seenEmail = new Set();
  for (const match of raw.matchAll(MAILTO_HREF)) {
    const address = decodeURIComponent(match[1]).trim().toLowerCase();
    if (!EMAIL_EXACT.test(address) || JUNK_EMAIL.test(address) || ASSET_SUFFIX.test(address)) continue;
    if (seenEmail.has(address)) continue;
    seenEmail.add(address);
    emails.push(address);
  }
  for (const address of extractEmails(text, { limit: emailLimit })) {
    if (!seenEmail.has(address) && emails.length < emailLimit) { seenEmail.add(address); emails.push(address); }
  }

  return { phones: [...byTel.values()].slice(0, phoneLimit), emails: emails.slice(0, emailLimit) };
}
