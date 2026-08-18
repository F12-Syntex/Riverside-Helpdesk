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
//
// UNEDITED IS NOT THE SAME AS UNFORMATTED, which is what this card used to
// get wrong. Every passage arrived as a blockquote — a blue bar down the left,
// a tinted panel, a smaller type size — with its paragraphs flattened into one
// unbroken run of text, because the whitespace was collapsed on the way in. It
// read as machine output rather than as the practice's own writing, and it was
// harder to read than the policy it came from. The words are still exactly the
// words. They are laid out the way every other piece of text in this app is
// laid out: a heading naming the document, then its paragraphs, with the
// breaks and the lists the document itself had.
import { answer, bullets, images, note, text } from './blocks.mjs';

// How many passages are worth showing, and how much of each. Five is what can
// be read without scrolling past the point of reading them; 700 characters is
// about a paragraph, which is what a policy makes its point in.
const MAX_PASSAGES = 5;
const MAX_PER_DOCUMENT = 2;
const MAX_CHARS = 700;

const tidy = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

/**
 * The document's own words, ready to be read as prose.
 *
 * Runs of spaces go, and so do runs of blank lines, because those are how a PDF
 * extractor punctuates rather than how the policy does. Single line breaks and
 * paragraph breaks stay: they are the document's own shape, and flattening them
 * is what turned a page of policy into a wall.
 *
 * A leading `#` or `>` is stripped and its words kept. Those are the document's
 * punctuation, not ours, and left alone the answer renderer would read them as
 * markup and put a heading — or another blockquote — in the middle of the card.
 * List markers are left exactly as they are: a numbered protocol should still
 * arrive as a numbered protocol.
 */
function prose(body) {
  return String(body == null ? '' : body)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim().replace(/^#{1,6}\s+/, '').replace(/^>\s?/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function excerpt(body) {
  const clean = prose(body);
  if (clean.length <= MAX_CHARS) return clean;
  // Cut at a paragraph or a sentence end where there is one nearby, so a
  // passage does not stop mid-clause and read as though the document does.
  const cut = clean.slice(0, MAX_CHARS);
  const stop = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('. '), cut.lastIndexOf('.\n'), cut.lastIndexOf('; '));
  const kept = stop > MAX_CHARS * 0.6 ? cut.slice(0, stop + 1) : cut;
  return kept.trimEnd() + ' […]';
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

  const blocks = [];

  for (const passage of chosen) {
    const heading = [passage.docTitle || 'Untitled document', tidy(passage.section)].filter(Boolean).join(' — ');
    // The heading and the passage under it are ONE block, so they arrive
    // together rather than as two things that happen to be next to each other.
    // No link to the file: the answer renderer has no links in its vocabulary,
    // and a markdown link would arrive at the reader as its own square brackets.
    // The documents are named here and listed again at the foot of the card,
    // which is what somebody needs to go and open the right one.
    blocks.push(text(`### ${heading}\n\n${excerpt(passage.text)}`));
    // Documents that are mostly a picture — a form, a poster, a screenshot of a
    // screen — carry their rendered pages. Quoting the text of a poster and not
    // showing the poster is the wrong half of it.
    if ((passage.images || []).length) blocks.push(images(passage.images.slice(0, 2)));
  }

  const documents = new Set(chosen.map((p) => p.docTitle).filter(Boolean));
  const from = documents.size || chosen.length;

  return answer({
    title: asked,
    // The claim that used to be a banner across the top of the card. It is the
    // one thing about this answer a reader has to know — that no model touched
    // it — and one grey line under the title says it as well as a panel did,
    // without standing between the question and the answer to it.
    subtitle: `Word for word from ${from} practice document${from === 1 ? '' : 's'} — nothing summarised or rewritten`,
    blocks,
    // Named, so the card carries where every line of it came from.
    source: [...documents],
  });
}
