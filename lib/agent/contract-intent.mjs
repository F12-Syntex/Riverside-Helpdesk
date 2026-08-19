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

// "TBC" and "N/A" are the table's words for "there isn't one". They are not
// templates and must never be offered as one to open.
const NOT_A_TEMPLATE = new Set(['TBC', 'N/A', '']);

/**
 * The templates themselves, each with the contracts it records.
 *
 * THE QUESTION IS WHICH TEMPLATE, NOT WHICH CONTRACT. 42 rows name 37 distinct
 * templates between them, and one template records several contracts: the
 * Treatment Room page carries three, the Local Contracts page five. A reader who
 * has a B12 injection in front of them does not want to be told which contract
 * pays for it — they want to know which template to open, and a template holds
 * dozens of things, of which theirs is one. So the list the model chooses from
 * is the list of templates, and the contracts ride along as what each one is
 * for, which is the evidence for choosing it.
 */
export function templateRoster(contracts = []) {
  const byTemplate = new Map();
  for (const contract of contracts) {
    for (const template of contract.templates || []) {
      if (NOT_A_TEMPLATE.has(template)) continue;
      if (!byTemplate.has(template)) byTemplate.set(template, []);
      byTemplate.get(template).push(contract.specification);
    }
  }
  return [...byTemplate.entries()]
    .map(([template, specs]) => '- ' + template + ' — records: ' + specs.join('; '))
    .join(String.fromCharCode(10));
}

/** Every template name on the document, deduplicated, in the order it appears. */
export function templateNames(contracts = []) {
  const names = [];
  for (const contract of contracts) {
    for (const template of contract.templates || []) {
      if (!NOT_A_TEMPLATE.has(template) && !names.includes(template)) names.push(template);
    }
  }
  return names;
}

/** The rows a given template records. */
export function contractsForTemplate(template, contracts = []) {
  return contracts.filter((c) => (c.templates || []).includes(template));
}

/**
 * One row's templates, with the table's two non-answers dropped.
 *
 * "TBC" and "N/A" are how the document says a template does not exist yet or
 * will never exist, and offering either as a thing to open in EMIS is the
 * clearest possible way to waste somebody's afternoon.
 */
export function templatesOf(contract) {
  return (contract?.templates || []).filter((t) => !NOT_A_TEMPLATE.has(t));
}

/**
 * What comes back. Strings rather than an enum, because an enum of 37 long names
 * is a large slice of the prompt for a constraint `resolvePick` enforces anyway
 * — and enforcing it in code is the version that cannot be talked out of.
 */
export const CONTRACT_INTENT_SCHEMA = z.object({
  template: z.string().describe(
    'The EMIS Web template most likely to hold the page for this, copied EXACTLY from the list, '
    + 'character for character, including the page named in brackets. Almost always one of them '
    + 'fits: a template holds dozens of pages and the reader has one job in front of them. '
    + 'Empty string only if the task is plainly nothing any of these templates record.',
  ),
  specification: z.string().describe(
    'Which of the contracts that template records is the one this task falls under, copied exactly. '
    + 'Empty string if the template records several and you cannot tell which.',
  ),
  confident: z.boolean().describe(
    'True only if the sources or the template name say outright that this is where the task is '
    + 'recorded. False for a reasonable inference — the card says which of the two it was.',
  ),
  why: z.string().describe(
    'One sentence, for the reader: why this is the template their job is recorded on. '
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
    'They asked in the words of the job in front of them. The list below is every template Primary',
    'Care IT build for the NEL local contracts, and what each one records. A template is not one',
    'form: it is a page set holding dozens of entries, so the job they described is almost never',
    'written on this list word for word — it is INSIDE one of these templates. Your job is to say',
    'which template that is.',
    '',
    'THE TEMPLATES — choose one, copied exactly:',
    roster,
    '',
  ];
  if (web) {
    lines.push('WHAT A WEB SEARCH FOUND about how this is done in North East London:', web, '');
  }
  lines.push(
    'HOW THIS GOES, on templates from this list:',
    '- "dressing change" is on OneTemplate NonPrescriber (Wound Care page).',
    '- "spirometry" is on OneProcedure (Spirometry/FeNO page).',
    '- "taking bloods" is on OneProcedure (Phlebotomy page).',
    '- "B12 injection" is an injection given by a nurse or HCA in the treatment room, so it is on',
    '  OneTemplate NonPrescriber (Treatment Room page).',
    'None of those four jobs is written on the list. Each one is plainly the kind of thing one of',
    'those templates holds, and naming that template is the answer.',
    '',
    'RULES.',
    '1. The template you return must be one of the lines above, character for character, including',
    '   the page named in brackets.',
    '2. Choose the most likely one. A reader who has this job in front of them is helped by the',
    "   best answer with a caveat and is not helped by silence — the card says outright when it was",
    '   worked out rather than looked up.',
    '   Clinical work done in the practice always has a template: an injection, a procedure, a',
    '   dressing, a swab, a check done by a nurse or an HCA in the treatment room belongs on the',
    '   treatment room page even when no contract on the list names that particular task.',
    '   Return an empty template ONLY for something that is not clinical work recorded in the',
    '   patient record at all — a passport countersignature, a room booking, an invoice.',
    '3. Where the template records several contracts, name the one this task falls under if you can',
    '   tell, copied exactly, and leave it empty if you cannot. Never write a contract that is not',
    '   listed against the template you chose.',
    '4. Set confident only when the template name or the sources say this outright.',
    '5. Never invent a template, a page name, a contract or a status.',
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
  const wantedTemplate = String(pick?.template || '').trim();
  if (!wantedTemplate) return null;
  const names = templateNames(contracts);
  // One tolerated difference: case and surrounding space. Anything else is a
  // name the model wrote rather than copied, and is thrown away.
  const template = names.find((t) => t === wantedTemplate)
    || names.find((t) => t.toLowerCase() === wantedTemplate.toLowerCase());
  if (!template) return null;

  // The contracts that template records, off the document — not off the model.
  const records = contractsForTemplate(template, contracts);
  const wantedContract = String(pick?.specification || '').trim();
  const contract = records.find((c) => c.specification === wantedContract)
    || records.find((c) => c.specification.toLowerCase() === wantedContract.toLowerCase())
    // A template that records exactly one contract needs nobody to say which.
    || (records.length === 1 ? records[0] : null);

  return {
    template,
    records,
    contract,
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
