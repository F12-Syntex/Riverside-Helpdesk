// /practice — what the practice's own documents say, word for word.
//
// The other commands hand the model a template to fill in. This one hands it
// nothing: the passages are found by search and shown as they are written. No
// model runs, so nothing can be paraphrased, summarised, blended or invented on
// the way to the reader — and the answer costs nothing and arrives at once.
//
// That is deliberate rather than lazy. These are policies and protocols: what
// they say matters more than how readable a summary of them would be, and a
// receptionist quoting the infection-control policy needs the policy's wording,
// not a good-faith restatement of it.
import { answer, bullets, images, note, text } from './blocks.mjs';

// How many passages are worth showing, and how much of each. Five is what can
// be read without scrolling past the point of reading them; 700 characters is
// about a paragraph, which is what a policy makes its point in.
const MAX_PASSAGES = 5;
const MAX_PER_DOCUMENT = 2;
const MAX_CHARS = 700;

const tidy = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

function excerpt(body) {
  const clean = tidy(body);
  if (clean.length <= MAX_CHARS) return clean;
  // Cut at a sentence end where there is one nearby, so a passage does not stop
  // mid-clause and read as though the document does.
  const cut = clean.slice(0, MAX_CHARS);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return (stop > MAX_CHARS * 0.6 ? cut.slice(0, stop + 1) : cut.trimEnd()) + ' […]';
}

/**
 * Trim the search results to what is worth reading.
 *
 * Two passages per document at most: a long policy matches its own wording over
 * and over, and five extracts from one file is a worse answer than five files.
 */
export function choosePassages(passages = []) {
  const perDocument = new Map();
  const chosen = [];
  for (const passage of passages) {
    if (!passage || !tidy(passage.text)) continue;
    const key = passage.docTitle || passage.docId || '';
    const used = perDocument.get(key) || 0;
    if (used >= MAX_PER_DOCUMENT) continue;
    perDocument.set(key, used + 1);
    chosen.push(passage);
    if (chosen.length >= MAX_PASSAGES) break;
  }
  return chosen;
}

/**
 * The card.
 *
 * @param {object} input
 * @param {string} input.query      what was searched for
 * @param {Array}  input.passages   [{ docTitle, section, text, url }]
 * @param {number} [input.searched] how many documents there were to search
 */
export function practiceSearchAnswer({ query, passages = [], searched = 0 }) {
  const asked = tidy(query);
  const chosen = choosePassages(passages);

  if (!chosen.length) {
    return answer({
      title: asked || 'Practice documents',
      subtitle: 'Nothing in the documents matches',
      blocks: [
        note('The practice’s policies and protocols do not use these words. That is not the same as the practice having no answer — try the words the document itself would use, or ask the question plainly and the assistant will look in the Notebook as well.', 'info'),
        searched ? bullets([`${searched} document${searched === 1 ? '' : 's'} searched.`]) : null,
      ],
      source: [],
    });
  }

  const blocks = [
    note('Straight from the documents, word for word. Nothing here has been summarised or rewritten.', 'info'),
  ];

  for (const passage of chosen) {
    const heading = [passage.docTitle || 'Untitled document', tidy(passage.section)].filter(Boolean).join(' — ');
    blocks.push(text(`### ${heading}`));
    // A quote, marked as one, so it cannot be read as the assistant's own words.
    // No link to the file: the answer renderer has no links in its vocabulary,
    // and a markdown link would arrive at the reader as its own square brackets.
    // The documents are named here and listed again at the foot of the card,
    // which is what somebody needs to go and open the right one.
    blocks.push(text('> ' + excerpt(passage.text)));
    // Documents that are mostly a picture — a form, a poster, a screenshot of a
    // screen — carry their rendered pages. Quoting the text of a poster and not
    // showing the poster is the wrong half of it.
    if ((passage.images || []).length) blocks.push(images(passage.images.slice(0, 2)));
  }

  return answer({
    title: asked,
    subtitle: `${chosen.length} passage${chosen.length === 1 ? '' : 's'} from the practice documents`,
    blocks,
    // Named, so the card carries where every line of it came from.
    source: [...new Set(chosen.map((p) => p.docTitle).filter(Boolean))],
  });
}
