// Guide helpers shared by the client UI and the server API route. The data
// itself lives in ./seed and ./categories; this module only derives views of it.
import { SEED_GUIDES } from './seed';
import { CATEGORIES, BROWSE_AREAS, POPULAR_IDS, QUICK_IDS } from './categories';

export { SEED_GUIDES, CATEGORIES, BROWSE_AREAS, POPULAR_IDS, QUICK_IDS };

// Seed guides plus any custom guides the practice has added (passed in from the
// caller — on the client these come from localStorage; the server is told them
// per request so it can route to them too).
export function allGuides(customGuides = []) {
  const extra = Array.isArray(customGuides) ? customGuides : [];
  return SEED_GUIDES.concat(extra);
}

export function guideById(id, customGuides = []) {
  return allGuides(customGuides).find((g) => g.id === id) || null;
}

// A compact "id: question" list the model uses to decide whether an existing
// guide already answers a question (and should be shown instead of a fresh answer).
export function guideCatalog(customGuides = []) {
  return allGuides(customGuides).map((g) => '- ' + g.id + ': ' + g.question).join('\n');
}

export function categoryLabel(id) {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? c.label : '';
}
