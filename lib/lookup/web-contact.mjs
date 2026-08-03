// Finding an actual number for something the practice's directory and the CQC
// register do not hold.
//
// The old fallback ran a web search and showed the reader five links. A link is
// not a phone number: someone at the desk with a patient waiting still has to
// open three tabs and hunt. This searches, then goes and READS the pages it
// found, and lifts the numbers and addresses straight out of them.
//
// Nothing here asks a model for a number. The search model chooses which pages
// are worth reading and that is all it does; every digit shown to the reader is
// an exact substring of a page, carried back with the URL it came from so it can
// be checked. See lib/lookup/contact-extract.mjs for the extraction rules.
import { webSearch } from '../agent/web-search.mjs';
import { extractContacts } from './contact-extract.mjs';

// A page is read for its contact details, not archived: a couple of hundred
// kilobytes is far more than any "contact us" page needs, and the cap stops one
// enormous page stalling a lookup someone is waiting on.
const PAGE_TIMEOUT_MS = 7000;
const MAX_PAGE_BYTES = 400_000;
const MAX_PAGES = 4;

const UA = 'Mozilla/5.0 (compatible; RiversidePracticeLookup/1.0)';

// Read one page as text. Never throws: a page that blocks us, redirects away or
// times out simply contributes nothing, and the citation extract is still there.
//
// Exported because the agent's read_web_page tool reads a page for its words
// rather than its phone numbers, and one careful fetch — timeout, size cap,
// content-type check, no exceptions — is enough for both.
export async function fetchPageHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) return '';
    const type = String(res.headers.get('content-type') || '');
    if (type && !/text\/html|application\/xhtml|text\/plain/i.test(type)) return '';
    const body = await res.text();
    return body.length > MAX_PAGE_BYTES ? body.slice(0, MAX_PAGE_BYTES) : body;
  } catch (e) {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

// What the search model is asked to find. Steered hard at the page that carries
// the number — a trust's "contact us" page, not a news article that mentions it.
export function contactQuery(subject) {
  return `${subject} — UK NHS or healthcare service. Find the official page that lists its contact details: `
    + 'telephone number, switchboard, department direct lines, email address and address. '
    + 'Prefer the organisation\'s own website, nhs.uk service pages and NHS trust contact pages.';
}

const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

// An official-looking source is worth more than a directory aggregator that has
// scraped one. This only orders the results — nothing is hidden on this basis.
function trust(url) {
  const h = host(url);
  if (/(^|\.)nhs\.uk$|(^|\.)nhs\.net$/.test(h)) return 3;
  if (/(^|\.)gov\.uk$|(^|\.)org\.uk$/.test(h)) return 2;
  if (/(^|\.)co\.uk$|(^|\.)com$/.test(h)) return 1;
  return 0;
}

/**
 * Search the web for a contact and come back with real numbers.
 *
 * Returns `{ ok, contacts, results, reason }`:
 *   contacts — `{ title, url, host, phones, emails }`, only pages that yielded
 *              something, best source first.
 *   results  — every page the search returned, so a reader who wants to check
 *              the source still can.
 */
export async function findWebContacts({ apiKey, model, query, maxPages = MAX_PAGES }) {
  const subject = String(query || '').trim();
  if (!subject) return { ok: false, contacts: [], results: [], reason: 'Nothing to look up.' };

  // The citation extracts often carry the number on their own, so ask for
  // generous ones — reading the page is the second attempt, not the only one.
  const search = await webSearch({ apiKey, model, query: contactQuery(subject), snippetChars: 2500 });
  if (!search.ok) return { ok: false, contacts: [], results: [], reason: search.reason || 'Web search is unavailable.' };

  const pages = (search.results || []).slice(0, Math.max(1, maxPages));
  const fetched = await Promise.all(pages.map((page) => fetchPageHtml(page.url)));

  const contacts = [];
  pages.forEach((page, i) => {
    // The fetched page first — it has the footer and the "contact us" block that
    // a search extract usually cuts off — with the extract as the fallback for a
    // site that will not serve us.
    const found = extractContacts(fetched[i] || '');
    const fallback = extractContacts(page.snippet || '');
    const phones = found.phones.length ? found.phones : fallback.phones;
    const emails = found.emails.length ? found.emails : fallback.emails;
    if (!phones.length && !emails.length) return;
    contacts.push({ title: page.title, url: page.url, host: host(page.url), phones, emails });
  });

  contacts.sort((a, b) => trust(b.url) - trust(a.url) || b.phones.length - a.phones.length);
  return {
    ok: true,
    contacts,
    results: search.results || [],
    reason: contacts.length ? '' : 'The pages found do not publish a number.',
  };
}
