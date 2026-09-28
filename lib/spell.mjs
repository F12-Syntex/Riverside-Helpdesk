// Spell it out: a string, letter by letter, in words that survive a phone line.
//
// "Is that M for Mike or N for November?" is half of every call where an email
// address or a reference number is read out. This mode takes the string and
// gives reception the whole thing to read from: how to say it in one go, then
// every character with its word, so nothing has to be made up on the spot.
//
// NO MODEL AND NO NETWORK. It is a lookup table, so it runs in the browser
// (see the `local` fill in lib/commands.mjs) and nothing typed here is sent
// anywhere — which is also why it is not redacted: spelling a patient's surname
// back to them is exactly what this is for, and a redacted name cannot be
// spelled.
import { answer, expand, fields, field, message, note, table } from './templates/blocks.mjs';

// The NATO alphabet, with England for E: "Echo" is the one word callers most
// often do not recognise, and the practice asked for England. One place to
// change a word, and every card changes with it.
export const PHONETIC = {
  a: 'Alpha', b: 'Bravo', c: 'Charlie', d: 'Delta', e: 'England', f: 'Foxtrot', g: 'Golf',
  h: 'Hotel', i: 'India', j: 'Juliet', k: 'Kilo', l: 'Lima', m: 'Mike', n: 'November',
  o: 'Oscar', p: 'Papa', q: 'Quebec', r: 'Romeo', s: 'Sierra', t: 'Tango', u: 'Uniform',
  v: 'Victor', w: 'Whiskey', x: 'X-ray', y: 'Yankee', z: 'Zulu',
};

const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

// What a caller calls each symbol. A separator (the SEPARATORS set) also breaks
// the string into the chunks it is read out in.
export const SYMBOLS = {
  '@': 'at', '.': 'dot', '-': 'hyphen', '_': 'underscore', '/': 'forward slash', '\\': 'backslash',
  ' ': 'space', "'": 'apostrophe', '’': 'apostrophe', '+': 'plus', '&': 'and', ',': 'comma',
  ':': 'colon', ';': 'semicolon', '#': 'hash', '(': 'open bracket', ')': 'close bracket',
  '!': 'exclamation mark', '?': 'question mark', '*': 'star', '=': 'equals', '%': 'percent',
  '£': 'pound sign', '$': 'dollar sign', '"': 'quote mark',
};
const SEPARATORS = new Set(['@', '.', '-', '_', '/', ' ', '\\', ',', ':', ';', '+']);

// Long enough for any address or reference, short enough that the card is
// still something to read from rather than a wall of tiles.
export const SPELL_MAX = 160;

const isLetter = (ch) => /^[a-z]$/i.test(ch);

/**
 * One string, as the groups it is read out in.
 *
 * Returns { text, truncated, email, groups, spoken, letterByLetter }:
 *   groups          [{ sep, chars: [{ ch, say, kind }] }] — a run of letters and
 *                   digits, or one separator on its own
 *   spoken          the whole thing said naturally: "nelondonicb dot nhs dot net"
 *   letterByLetter  "N for November, E for England, …" — one line, to copy
 */
export function spellOut(input) {
  const raw = String(input || '').replace(/\s+/g, ' ').trim();
  const truncated = raw.length > SPELL_MAX;
  const text = truncated ? raw.slice(0, SPELL_MAX) : raw;
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
  // Capitals only matter where the string could be case-sensitive and actually
  // mixes them. An email address is not, and "SMITH" is just a surname typed in
  // capitals — saying "capital" twelve times would bury the letters.
  const mixed = !email && /[a-z]/.test(text) && /[A-Z]/.test(text);

  const groups = [];
  let run = null;
  for (const ch of Array.from(text)) {
    const lower = ch.toLowerCase();
    let item;
    if (isLetter(ch)) {
      const capital = mixed && ch !== lower;
      // `show` is what the tile draws. In capitals unless the case matters,
      // because a lower-case l and a 1 are the same shape at a glance.
      item = { ch, show: mixed ? ch : ch.toUpperCase(), say: (capital ? 'capital ' : '') + PHONETIC[lower], kind: capital ? 'capital' : 'letter' };
    } else if (/^[0-9]$/.test(ch)) {
      item = { ch, show: ch, say: DIGITS[Number(ch)], kind: 'digit' };
    } else {
      item = { ch, show: ch === ' ' ? '␣' : ch, say: SYMBOLS[ch] || ch, kind: 'symbol' };
    }

    if (SEPARATORS.has(ch)) {
      run = null;
      groups.push({ sep: true, chars: [item] });
      continue;
    }
    if (!run) {
      run = { sep: false, chars: [] };
      groups.push(run);
    }
    run.chars.push(item);
  }

  const spoken = groups
    .map((g) => (g.sep ? g.chars[0].say : g.chars.map((c) => c.ch).join('')))
    .filter((w) => w !== 'space')
    .join(' ');

  const letterByLetter = groups
    .flatMap((g) => g.chars)
    .map((c) => (c.kind === 'letter' || c.kind === 'capital'
      ? (c.kind === 'capital' ? 'capital ' : '') + c.ch.toUpperCase() + ' for ' + PHONETIC[c.ch.toLowerCase()]
      : c.say))
    .join(', ');

  return { text, truncated, email, groups, spoken, letterByLetter };
}

/**
 * The card. `spell` carries the same data for the tile view
 * (app/_components/chat/SpellCard.jsx); `blocks` are the plain rendering of it,
 * which is what any other view of an answer reads.
 */
export function spellAnswer(input) {
  const out = spellOut(input);
  if (!out.text) {
    return answer({
      title: 'Spell it out',
      blocks: [note('Type or paste what you need to spell — an email address, a surname, a reference — or pick one of the quick options under the field.', 'info')],
    });
  }

  const rows = out.groups.flatMap((g) => g.chars).map((c) => [c.show, c.say]);
  return {
    ...answer({
      title: out.email ? 'Spelling an email address' : 'Spelling it out',
      subtitle: out.text,
      blocks: [
        fields([
          field(out.email ? 'Email' : 'Text', out.text, { copy: true }),
          field('Say it as', out.spoken),
        ]),
        message(out.letterByLetter, 'Letter by letter'),
        expand('Every character', [table(['Character', 'Say'], rows)], rows.length + ' characters'),
        out.truncated ? note('Only the first ' + SPELL_MAX + ' characters are spelled.', 'warn') : null,
      ],
    }),
    spell: out,
  };
}
