// Which contract covers a thing somebody actually does.
//
// THE GAP THIS FILLS. The NEL Local Contract Specifications name 42 contracts
// and the EMIS templates that record them. Reception do not ask in those words.
// "B12 injection" is not the name of a contract and is written nowhere on the
// document, so the string match — which is right, and stays first — says no
// contract by that name. Somewhere in those 42 rows is the service the injection
// is recorded under, and a template with several pages, one of which is the page
// to open. That is a question about what the words MEAN, and no amount of
// matching characters answers it.
//
// SO A MISS ASKS THE WEB, THEN PICKS A ROW OFF THE DOCUMENT. Two calls, in this
// order, and only ever after the string match has failed:
//
//   1. a web search on what covers this in North East London primary care —
//      NHS, ICB and Primary Care IT pages, through the same web model role the
//      contact lookup uses;
//   2. a model handed the 42 rows as data, plus what the search found, which
//      must answer with ONE specification copied exactly off that list, or with
//      nothing at all.
//
// WHAT THE MODEL MAY AND MAY NOT DO. It picks a row. It does not write the
// answer: the card is rendered from the row — specification, templates, status,
// area, capture date — exactly as every other contract card is, so a chosen row
// cannot come back with an invented template name or a status nobody published.
// `resolvePick` throws the answer away unless the specification is, character
// for character, a row on the document, and unless the template it named is,
// character for character, one of that row's templates. A model that half
// remembers "OneTemplate Nurse (B12 page)" produces no page, not a wrong one.
//
// AND THE CARD SAYS WHAT IT IS. It leads with a line saying the contract was not
// named in the question, that the row was chosen by what the words mean, and
// what the web said — naming the pages that were read. A reasoned match is a
// good lead, not a fact off the document, and it must never read like the
// latter.
import { z } from 'zod';
import { webSearch } from './web-search.mjs';

/** How long the whole intent lookup may take before the miss is reported as a miss. */
export const INTENT_TIMEOUT_MS = 30_000;

/**
 * What to ask the web.
 *
 * Steered at the two things that decide the answer — which NEL service the task
 * belongs to, and what records it in EMIS — rather than at the clinical
 * question, which nobody is asking. "B12 injection" on its own returns patient
 * leaflets about vitamin deficiency.
 */
export function contractIntentQuery(asked) {
  const subject = String(asked || '').trim();
  return '"' + subject + '" in NHS North East London general practice: which local contract, '
    + 'enhanced service (LES/LIS), locally commissioned service or PCN specification covers it, '
    + 'and how is it recorded in EMIS Web? '
    + 'Prefer NHS North East London ICB pages, Primary Care IT (primarycareit.co.uk) pages, '
    + 'NHS England service specifications and London LMC pages. '
    + 'Name the service the way the commissioner names it.';
}

/**
 * The document, as the list the model chooses from.
 *
 * Every row, both this practice's and the other boroughs' — a reader whose task
 * turns out to be a Tower Hamlets localisation is better told that than told
 * nothing. One line each: the area decides whether the row is ours, and the
 * template names are half of what identifies a row ("the wound care page").
 */
export function contractRoster(contracts = []) {
  return contracts
    .map((c) => {
      const templates = (c.templates || []).join('; ');
      return '- ' + c.specification + ' [' + c.area + ']'
        + (templates ? ' — templates: ' + templates : '');
    })
    .join('\n');
}

/**
 * What comes back. Strings rather than an enum, because an enum of 42 long names
 * is a large slice of the prompt for a constraint `resolvePick` enforces anyway
 * — and enforcing it in code is the version that cannot be talked out of.
 */
export const CONTRACT_INTENT_SCHEMA = z.object({
  specification: z.string().describe(
    'The contract this belongs under, copied EXACTLY from the list, character for character. '
    + 'Empty string if no row on the list covers it — that is a real and common answer, because '
    + 'the list is 42 NEL contracts and not everything a practice does is one of them.',
  ),
  template: z.string().describe(
    "Which of THAT ROW'S templates records it, copied exactly from that row's templates, including "
    + 'the page in brackets where the row names one. Empty string if the row names no templates, or '
    + 'if you cannot tell which of them it is. Never write a template name that is not on the row.',
  ),
  confident: z.boolean().describe(
    'True only if the sources say outright that this task is delivered under this contract. '
    + 'False for a reasonable inference — the card says which of the two it was.',
  ),
  why: z.string().describe(
    'One sentence, for the reader: why this contract covers what they asked about. '
    + 'No hedging, and do not restate the question.',
  ),
});

/**
 * The prompt. The list is data, the web is evidence, and the answer is a row.
 *
 * IT HAD TO BE TOLD THAT AN ANSWER USUALLY EXISTS. The first version led with
 * how to return nothing — an empty specification is a real answer, national
 * immunisations are not NEL contracts, ordinary GMS is not on the list — and a
 * model reading that returns nothing for "dressing change", with "Simple Wound
 * Care Service" sitting in front of it, and for "housebound flu jab" with the
 * housebound vaccination contract on the same page. Refusing is the safe-looking
 * move for a model and the useless one for the reader, who asked because they
 * have work to record. The escape hatch is still there, at the end, narrowed to
 * what it is for: things that are plainly not one of these 42 services.
 *
 * The examples are the other half of it. They are three rows off this very
 * document, each reached from the words somebody at a desk would use, and they
 * do more to describe the job than another paragraph of rules would.
 */
export function contractIntentPrompt({ asked, roster, web = '' }) {
  const lines = [
    'A receptionist at a GP practice in City & Hackney, North East London, asked which EMIS Web',
    'template records this: "' + String(asked || '').trim() + '".',
    '',
    'They asked in the words of the job in front of them, and the job is work the practice gets paid',
    'for and has to record. The list below is the NEL Local Contract Specifications: every NEL',
    'contract Primary Care IT build templates for, and the templates that record each one. What they',
    'described is almost never written on it word for word. Your job is to say which of these',
    'contracts the task is delivered UNDER.',
    '',
    'THE LIST — choose one specification from it, copied exactly:',
    roster,
    '',
  ];
  if (web) {
    lines.push('WHAT A WEB SEARCH FOUND about how this is commissioned in North East London:', web, '');
  }
  lines.push(
    'HOW THIS GOES, on rows from this list:',
    '- "dressing change" is delivered under Simple Wound Care Service.',
    '- "flu jab for a housebound patient" is under NHS NEL Housebound Check and Winter Vaccination Support.',
    '- "spirometry" is under Respiratory Diagnostics — Spirometry and Feno (Adults).',
    'None of those three tasks is written on the list. Each is plainly the work one of those',
    'contracts pays for, and naming that row is the answer.',
    '',
    'RULES.',
    '1. The specification you return must be one of the lines above, character for character.',
    "2. The template you return must be one of THAT row's templates, character for character,",
    '   including the page named in brackets where the row names one. If you cannot tell which of a',
    "   row's templates it is, return an empty template — never guess a page.",
    '3. Set confident only when the row, its templates or the sources name this task outright.',
    '   An inference from what the contract is for is still the right answer; it is just not certain,',
    '   and the card tells the reader which it was.',
    '4. Return an empty specification only when the task is plainly none of these 42 services —',
    '   a passport countersignature, a private medical, a national childhood immunisation given',
    '   under the ordinary schedule. Do not return empty merely because the words are not on the list.',
    '5. Never invent a contract, a template, a page name or a status.',
  );
  return lines.join(String.fromCharCode(10));
}

/**
 * The model's answer, checked against the document.
 *
 * Returns null unless the specification names a real row. The template is kept
 * only when the row itself lists it; anything else is dropped silently, because
 * a card with the right contract and a made-up page is worse than a card with
 * the right contract and no page.
 */
export function resolvePick({ pick, contracts = [] }) {
  const wanted = String(pick?.specification || '').trim();
  if (!wanted) return null;
  const contract = contracts.find((c) => c.specification === wanted)
    // One tolerated difference: case and surrounding space. Anything else is a
    // name the model wrote rather than copied.
    || contracts.find((c) => c.specification.toLowerCase() === wanted.toLowerCase());
  if (!contract) return null;
  const named = String(pick?.template || '').trim();
  const template = (contract.templates || []).find((t) => t === named)
    || (contract.templates || []).find((t) => t.toLowerCase() === named.toLowerCase())
    || '';
  return {
    contract,
    template,
    confident: Boolean(pick?.confident),
    why: String(pick?.why || '').trim(),
  };
}

/**
 * The search, run for a contract question. Never throws: a search that cannot
 * run leaves the model to answer from the list alone, which is still better than
 * a miss, and the card says what it had.
 */
export async function searchForContract({ asked, apiKey, model }) {
  if (!apiKey || !model || !String(asked || '').trim()) {
    return { ok: false, summary: '', results: [] };
  }
  return webSearch({ apiKey, model, query: contractIntentQuery(asked) });
}

/**
 * The service names the web actually used, as things to look up on the document.
 *
 * WHY THIS EXISTS ALONGSIDE THE MODEL. The model is asked to pick a row and
 * sometimes will not: "dressing change" came back as nothing while "Simple Wound
 * Care Service" sat in the list it was reading, because refusing is the
 * safe-looking move. Meanwhile the search had returned a page titled "Wound care
 * service — NHS North East London", which is the answer said out loud.
 *
 * So the names the WEB used are run back through the document's own matcher.
 * Nothing here is generated: a candidate is a line the search returned, the
 * lookup is the same string match the command starts with, and what comes out is
 * a row of the document or nothing. It is a second, cheaper reader of the same
 * evidence, and it costs one more pass over 42 strings.
 */
const LINES = /\r?\n/;

export function webNameCandidates(web) {
  const out = [];
  const push = (line) => {
    const text = String(line || '')
      // Search results are titled "Thing — Site" or "Thing | Site"; the site is
      // not part of the name of a service.
      .split(/[|–—]|\s-\s/)[0]
      .replace(/^[-*\d.\s]+/, '')
      .replace(/[.:;]+$/, '')
      .trim();
    if (text.length >= 4 && text.length <= 90) out.push(text);
  };
  for (const line of String(web?.summary || '').split(LINES)) push(line);
  for (const result of web?.results || []) push(result?.title);
  return out.slice(0, 12);
}

/**
 * The best row the web's own words reach on the document, or null.
 *
 * `lookup` is the command's matcher, passed in rather than imported, so this
 * module stays free of the template layer and the test can watch what it is
 * asked. A candidate has to match confidently — the same bar the typed query
 * has to clear — because this is a guess about a guess, and a loose hit here
 * would put a confident wrong contract in front of somebody.
 */
export function contractFromWeb({ web, lookup }) {
  for (const candidate of webNameCandidates(web)) {
    const found = lookup(candidate);
    if (found && found.confident && found.matches && found.matches.length) {
      return { contract: found.matches[0], named: candidate };
    }
  }
  return null;
}

/**
 * Primary Care IT's own pages about this, when the document has nothing.
 *
 * The specifications name 42 contracts; PCIT's knowledge base documents every
 * template they build, including plenty that no contract on that list pays for.
 * "B12 injection" is the case in point: no contract covers it, and PCIT publish
 * a page called "Injection: B12 Template". Saying so beats saying nothing, and
 * it is not a claim about the document — it is a page title and the site it is
 * on, both carried back from the search exactly as they came.
 */
export function pcitPages(results = []) {
  return results
    .filter((r) => {
      try { return /(^|\.)primarycareit\.co\.uk$/.test(new URL(r.url).hostname); } catch (e) { return false; }
    })
    .map((r) => String(r.title || '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

/**
 * What the card shows about where the reasoning came from.
 *
 * The page title and its host, not a bare URL: a URL is not clickable on these
 * cards, and the host is what tells a reader whether to trust the line.
 */
export function sourceLines(results = []) {
  return results
    .map((r) => {
      let host = '';
      try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch (e) { host = ''; }
      const title = String(r.title || '').trim();
      if (!title && !host) return '';
      return host && title ? title + ' — ' + host : (title || host);
    })
    .filter(Boolean)
    .slice(0, 4);
}
