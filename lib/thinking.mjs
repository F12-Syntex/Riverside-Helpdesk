// HOW HARD THE ASSISTANT THINKS, WHICH IS ONLY EVER WHICH MODEL ANSWERS.
//
// Three choices beside the send button on the Ask page. Nothing about the turn
// changes between them — the same prompt, the same templates, the same checks,
// the same guards — except the model that does the reading and writing. That is
// deliberate: a "deeper" mode that also changed what the answer was built from
// would be two experiments at once, and when it gave a different answer nobody
// could say which half did it.
//
//   Fast   the Fast role: what every answer ran on before the choice existed.
//   Think  a stronger model, for a message with several things going on.
//   Deep   the strongest the practice will pay for, when it is a hard one.
//
// Which model each one is lives at /settings (lib/settings.js, the `think` and
// `deep` roles). This file has no database in it so the page can import it.
//
// TWO THINGS NEVER MOVE WITH IT. A message with a picture on it is read by the
// Images role whatever is chosen, because the chosen model may not see — and a
// turn that fails is worse than a turn that is merely quick. And the answer
// check is a decision model, not a chat model; nothing here can stand in for it.

export const THINKING_MODES = [
  { id: 'fast', label: 'Fast', role: 'fast', hint: 'Quickest. Right for most questions.' },
  { id: 'think', label: 'Think', role: 'think', hint: 'A stronger model. For a message with a few things in it.' },
  { id: 'deep', label: 'Deep', role: 'deep', hint: 'The strongest model. Slower — for the hard ones.' },
];

export const DEFAULT_THINKING = 'fast';

const BY_ID = new Map(THINKING_MODES.map((m) => [m.id, m]));

/** Is this one of the three? A stored or posted value is a string anybody could have edited. */
export function isThinkingMode(id) {
  return BY_ID.has(String(id || ''));
}

/** The mode, or Fast for anything that is not one. Never throws, never guesses upward. */
export function normaliseThinking(id) {
  return isThinkingMode(id) ? String(id) : DEFAULT_THINKING;
}

export function thinkingMode(id) {
  return BY_ID.get(normaliseThinking(id));
}

/**
 * The model a turn answers on, from the resolved roles (getModelRoles) and the
 * mode the question was asked in.
 *
 * A role that is somehow missing falls back to Fast rather than failing the
 * turn — Fast is what answered before the choice existed, so it is the one
 * answer that can never be a surprise.
 */
export function thinkingModel(roles, mode) {
  const fast = roles && roles.fast && roles.fast.model;
  const chosen = thinkingMode(mode);
  const resolved = roles && roles[chosen.role] && roles[chosen.role].model;
  return resolved
    ? { model: resolved, role: chosen.role, mode: chosen.id }
    : { model: fast, role: 'fast', mode: DEFAULT_THINKING };
}

/**
 * The model that reads an /accurx message.
 *
 * On Fast it is the AccurX role, exactly as before — a practice that bought a
 * better routing model on its own keeps it. Asked to Think or go Deep, the
 * reader is the model that was asked for: somebody who chose the strong model
 * for a hard message meant the routing as much as the wording.
 */
export function accurxModel(roles, mode) {
  if (normaliseThinking(mode) === DEFAULT_THINKING) {
    return (roles && roles.accurx && roles.accurx.model) || thinkingModel(roles, mode).model;
  }
  return thinkingModel(roles, mode).model;
}
