// What was asked FOR, separated from how it was asked.
//
// THE PROBLEM IT FIXES. Both list lookups score a query against a few hundred
// names and then judge whether the best score is worth showing, and the bar
// rises with the number of words asked for — every word has to earn its place,
// which is what stops one weak token dragging back a confident wrong form. That
// rule is right for words that name something and wrong for the words around
// them. "which template for adhd" is four words asking about one, and the three
// that are not "adhd" cannot match anything on either list: the bar went to 200
// and the one real answer, scoring 108, was reported as no contract by that
// name. The reader had asked the question in English rather than in list-speak
// and was told the list was empty.
//
// WHAT IT REMOVES, AND WHY ONLY THIS. Two kinds of word, both of which carry no
// information about WHICH row is wanted:
//
//   - the asking itself: which, what, do I use, is there, please, find me;
//   - the name of the thing being looked for: form, template, referral,
//     document. Nearly every row on the referral tree is a "... Referral Form"
//     and nearly every contract row has a template against it, so these words
//     match everything and therefore distinguish nothing — while still raising
//     the bar every other word has to clear.
//
// WHAT IT NEVER REMOVES. Anything clinical, anything naming a service, and
// anything that is a word in a real row's name: "service", "screening",
// "pathway", "check", "clinic", "adult", "children". Those look like filler and
// are not — "Simple Wound Care Service" and "ADHD Shared Pathway" are found by
// exactly those words.
//
// IT CANNOT LOSE AN ANSWER. Removing a word can only lower the bar and can only
// remove a token that matched everything, so a query that found its row before
// still finds it. A query made entirely of these words is left alone, because
// there is nothing else to search with.

/**
 * Words that describe the asking rather than the thing asked for.
 *
 * Kept as one flat list rather than split by list, because /form and /template
 * are answered from each other's list on a miss — see the cross-list fallback
 * in lib/templates/referrals.mjs — and a query trimmed two different ways would
 * be judged against two different bars.
 */
export const ASK_WORDS = new Set([
  // Asking
  'which', 'what', 'whats', 'where', 'who', 'whose', 'how', 'why', 'when',
  'do', 'does', 'did', 'is', 'are', 'was', 'were', 'am', 'be',
  'i', 'we', 'you', 'my', 'our', 'me', 'us', 'it', 'its', 'this', 'that', 'there',
  'can', 'could', 'should', 'would', 'shall', 'will', 'need', 'needs', 'needed',
  'want', 'wants', 'looking', 'look', 'find', 'finding', 'get', 'give', 'show',
  'send', 'sending', 'use', 'using', 'used', 'fill', 'filling', 'complete',
  'please', 'thanks', 'help', 'about', 'with', 'from', 'any', 'some',
  'right', 'correct', 'proper', 'called', 'name', 'named',
  // Recording is what every one of these templates is FOR, so the word says
  // nothing about which page is wanted — and "where do I record an ambulance"
  // is how the question is actually asked. It stays a real word in a real page
  // name ("Record Chaperone"): a row's name is never trimmed, only the query,
  // so "record chaperone" still finds it on the word that distinguishes it.
  'record', 'records', 'recording', 'log', 'logging', 'code', 'coding',
  // Connectives. The matcher already ignores these, so dropping them changes no
  // score; they are here so that what is left really is the thing asked for, and
  // so the bar is not raised by the word "for".
  'a', 'an', 'the', 'for', 'of', 'to', 'in', 'on', 'at', 'and', 'or',
  // The thing being looked for, which every row already is
  'form', 'forms', 'template', 'templates', 'proforma',
  'referral', 'referrals', 'refer', 'referring', 'refered', 'referred',
  'request', 'requests', 'document', 'documents', 'paperwork', 'letter',
]);

/**
 * The query with the asking taken out of it.
 *
 * Returns the query unchanged when trimming would leave nothing — "/form form"
 * is a query about nothing, and searching for nothing is worse than searching
 * for the word that was typed.
 *
 * Punctuation and word order are preserved for what is left, because the query
 * is handed on to the alias expansion and to the matcher, both of which read
 * ordinary text.
 */
export function askedFor(query) {
  const asked = String(query || '').trim();
  if (!asked) return '';
  const kept = asked
    .split(/\s+/)
    .filter((word) => {
      const bare = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      return bare && !ASK_WORDS.has(bare);
    });
  return kept.length ? kept.join(' ') : asked;
}

/**
 * Did the trimming change anything?
 *
 * Read by the tests, which assert that the words above are the ones being
 * removed rather than that a particular query happens to work.
 */
export const wasTrimmed = (query) => askedFor(query) !== String(query || '').trim();
