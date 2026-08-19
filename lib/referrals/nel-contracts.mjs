// Which EMIS Web template implements which NEL contract, searched by name.
//
// PCIT build the templates that record the work a contract pays for — the ADHD
// shared pathway, the wound care service, the housebound winter vaccination
// check. Staff know the contract's name and need the template's, and the two are
// not the same words. That mapping is the durable part of the mobilisation
// Sitrep, and it is what this answers.
//
// THE STATUS IS A SNAPSHOT AND SAYS SO. Every row also carries a build status,
// and the Sitrep is explicit that "the status of our development work will change
// through the week". A status read off a bulletin from 28 July is not the current
// state of the world, so the capture date travels with it and the card leads with
// the date before it says anything else. That is the whole reason this is a
// separate module from lib/referrals/nel-tree.mjs, whose form list does not rot
// at the same speed.
// Imported rather than read off disk, for the reason set out in nel-tree.mjs:
// this ends up in a browser bundle, and `node:fs` there fails the build.
import DATA from './nel-contracts.data.json' with { type: 'json' };
import { buildIndex, fuzzySearch, normalize, tokenize } from '../lookup/fuzzy.js';
import { askedFor } from './ask.mjs';
import { namedOutright } from './nel-tree.mjs';

// The areas whose rows are this practice's: everything NEL-wide, plus its own
// borough's localisations. The other four boroughs' rows are not shown — a
// Tower Hamlets localisation is not a thing City & Hackney can claim.
export const PRACTICE_AREAS = ['NEL-Wide Specifications', 'City & Hackney Localisations'];

/** The dataset. */
export function nelContracts() {
  return DATA;
}

// The bar rises with the number of words asked for, and is counted on the words
// that name something rather than on the ones that did the asking: "which
// template for adhd" is one word about a contract and three about wanting to
// know. See lib/referrals/ask.mjs.
const floorFor = (query) => 50 * Math.max(1, tokenize(askedFor(query)).length);

/** The searchable index over a list of contract rows. */
export function buildContractIndex(contracts = []) {
  return buildIndex(contracts.map((contract) => ({
    label: contract.specification,
    // The template names are searchable too, one alias each: somebody handed
    // "OneTemplate NonPrescriber (Wound Care page)", or told to fill in "NEL
    // Housebound Winter Vacs", can ask what it belongs to and get the
    // specification back. That direction is the common one — the template name is
    // what is written on the task, and the specification is what the contract is
    // called in every other conversation about it.
    aliases: contract.templates || [],
    category: contract.area,
    contract,
  })));
}

/** Contract rows ranked against a query, noise removed. */
export function rankContracts(index, query, limit = 5) {
  const floor = floorFor(query);
  const hits = fuzzySearch(index, askedFor(query), limit * 3).filter(({ score }) => score >= floor);
  if (!hits.length) return [];
  const cut = hits[0].score * 0.33;
  return hits
    .filter(({ score }) => score >= cut)
    .slice(0, limit)
    .map(({ entry, score }) => ({ ...entry.contract, score }));
}

/** One clear winner, or a shortlist? Same rule as the referral tree's. */
export function isConfident(matches, query) {
  if (!matches.length) return false;
  if (matches.length === 1) return true;
  // Named outright, as typed or with the asking words dropped from either side
  // — the same rule as the referral tree's, for the same reason.
  if (namedOutright(matches[0].specification, query)) return true;
  return matches[0].score >= matches[1].score * 1.35;
}

/**
 * Find the contract row(s) for what was asked.
 *
 * @returns {{
 *   query: string, matches: Array, elsewhere: Array, confident: boolean,
 *   capturedAt: string, source: string, support: object
 * }}
 */
export function findContracts(query, { areas = PRACTICE_AREAS, limit = 5, data = null } = {}) {
  const all = data || nelContracts();
  const asked = String(query || '').trim();
  const empty = {
    query: asked, matches: [], elsewhere: [], confident: false,
    capturedAt: all.capturedAt, source: all.source, support: all.support,
  };
  if (!asked) return empty;

  const mine = all.contracts.filter((c) => areas.includes(c.area));
  const matches = rankContracts(buildContractIndex(mine), asked, limit);
  if (matches.length) return { ...empty, matches, confident: isConfident(matches, asked) };

  // Another borough's localisation. Named rather than hidden, for the same reason
  // the referral tree names another borough's forms: it answers the question.
  const theirs = all.contracts.filter((c) => !areas.includes(c.area));
  return { ...empty, elsewhere: rankContracts(buildContractIndex(theirs), asked, limit) };
}
