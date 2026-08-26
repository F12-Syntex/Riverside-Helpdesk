// Why the reader saw what they saw.
//
// The question log already stores what was asked and what was shown. That
// answers "what did it say?" and not "why did it say that?", and the second
// question is the one a significant event review actually asks — six weeks
// later, with the Notebook page rewritten twice since.
//
// So each turn also records:
//
//   requests   the message as it was split up, each with the acuity code gave
//              it, what happened to it, and whether the model's span was
//              genuinely verbatim. This is also the raw material for the eval
//              set: real questions, with what the scanners made of them.
//   rules      every deterministic rule that fired, by its permanent id, WITH
//              THE WORDS THAT FIRED IT. A rule id alone tells you a pattern
//              matched; the span tells you whether it should have.
//   blocks     each block on the card and where it came from. Most inherit the
//              card's Notebook pages; the ones a safety rule put there carry
//              the rule instead (see `sourced` in lib/templates/blocks.mjs).
//   notebook   the revision of each page the card stands in for, so "the page
//              says something different now" can be told from "the answer was
//              wrong at the time".
//   route      /accurx only: where READING the whole message said it goes, and
//              where the card ended up sending it. Two values rather than one,
//              because the reading may only ever raise what the patterns chose
//              (lib/templates/accurx-route.mjs) — so "it read duty doctor and
//              the card says physio" is a legible outcome and not a
//              contradiction, and the pair is what makes it legible. `mode`
//              joins them on the two routes that book an appointment with a
//              doctor: telephone or face-to-face, which is the other half of
//              what reception booked.
//
// Pure, and free of the database, so it can be tested directly and so nothing
// here can fail a turn.

const MAX = { requests: 12, rules: 24, blocks: 60, notebook: 8, span: 300, text: 600 };

const cut = (value, max) => String(value == null ? '' : value).trim().slice(0, max);

// A card's blocks, flattened. A disclosure holds its own blocks and they are
// as much on the card as anything else — the reader can open it.
function blockSources(blocks, cardSource, depth = 0, out = []) {
  for (const block of blocks || []) {
    if (!block || !block.type || out.length >= MAX.blocks) return out;
    out.push({
      type: block.type,
      // A block's own source when a rule put it there, the card's otherwise.
      source: cut(block.source || cardSource, 200),
      ...(depth ? { in: depth } : {}),
    });
    if (block.type === 'expand') blockSources(block.blocks, cardSource, depth + 1, out);
  }
  return out;
}

/**
 * Everything worth writing down about one turn.
 *
 * Every argument is optional: a turn with no decomposition, no card and no
 * Notebook is a perfectly ordinary turn and produces a small object rather than
 * an error.
 */
export function buildProvenance({
  scan = null,
  card = null,
  pages = [],
  stage2 = '',
  route = null,
} = {}) {
  const out = {};

  if (scan && (scan.items || []).length) {
    out.requests = scan.items.slice(0, MAX.requests).map((item) => ({
      id: item.id,
      gist: cut(item.gist, 80),
      text: cut(item.text, MAX.text),
      acuity: item.acuity || '',
      status: item.status || '',
      // Which half decided it. Absent means the deterministic table did, which
      // is the case worth being able to prove.
      ...(item.raisedBy ? { raisedBy: item.raisedBy } : {}),
      ...(item.verbatim === false ? { verbatim: false } : {}),
      ...(item.trivia ? { trivia: true } : {}),
    }));
    if (scan.dropped) out.dropped = scan.dropped;
  }

  if (scan && (scan.rules || []).length) {
    out.rules = scan.rules.slice(0, MAX.rules).map((rule) => ({
      id: rule.id,
      kind: rule.kind,
      span: cut(rule.span, MAX.span),
      ...(rule.itemId ? { itemId: rule.itemId } : {}),
    }));
  }

  if (card) {
    const cardSource = (card.source || []).join(' · ');
    const blocks = blockSources(card.blocks, cardSource);
    if (blocks.length) out.blocks = blocks;
  }

  // The revision of every Notebook page named on the card. Matched on the
  // title the card cites, which is the title the page carries.
  if (card && (card.source || []).length && (pages || []).length) {
    const named = [];
    for (const title of card.source) {
      const page = pages.find((p) => String(p.docTitle || '').toLowerCase().includes(String(title).toLowerCase()));
      if (!page || named.length >= MAX.notebook) continue;
      named.push({
        title: cut(page.docTitle, 200),
        updatedAt: page.updatedAt ? new Date(page.updatedAt).toISOString() : '',
      });
    }
    if (named.length) out.notebook = named;
  }

  // Named rather than a boolean: "which second pass ran" is the question, and
  // there may one day be more than one.
  if (stage2) out.stage2 = cut(stage2, 40);

  // What the reading made of it, beside what the card actually did. `read` is
  // the model's own answer, unfiltered — recording only the outcome would hide
  // every time it was overruled, which is precisely the thing worth watching.
  if (route && (route.read || route.card)) {
    out.route = {
      read: cut(route.read, 40),
      card: cut(route.card, 40),
      // Which kind of appointment, on the routes that book one with a doctor.
      // Absent everywhere else rather than recorded as "unsure": the reading is
      // told not to answer it off those routes, so a value there would be noise
      // in the one place somebody goes looking for a wrong slot type.
      ...(route.mode ? { mode: cut(route.mode, 20) } : {}),
    };
  }

  return out;
}
