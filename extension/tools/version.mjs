// The version arithmetic, on its own so it can be tested without running git.
//
// Released versions are recorded as git tags (ext-v1.0.7), not as commits: this
// repository versions the web app on every commit and checks that number
// against the history (see CLAUDE.md and scripts/versions.mjs), so a build that
// pushed its own bump commit would falsify that check — and would re-trigger
// itself. Tags carry the state instead, and cost no commits.
const parse = (v) => v.split('.').map(Number);

/** The higher of two x.y.z versions; a when they are equal. */
export function higher(a, b) {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i] ? a : b;
  return a;
}

/** The highest x.y.z among ext-v tags, or null when there are none. */
export function highestTag(tags) {
  const versions = tags
    .map((t) => t.trim().replace(/^ext-v/, ''))
    .filter((t) => /^\d+\.\d+\.\d+$/.test(t));
  return versions.length ? versions.reduce(higher) : null;
}

/**
 * The version this build should ship.
 *
 *   * the highest released version, patch incremented — the ordinary case,
 *     one patch per push to main
 *   * the manifest's baseline instead, when it is higher — which is how a minor
 *     or major bump is made: raise it by hand in the commit that earns it, and
 *     that number ships as-is.
 */
export function nextVersion(baseline, released) {
  if (!released || higher(released, baseline) !== released) return baseline;
  const [maj, min, pat] = parse(released);
  return `${maj}.${min}.${pat + 1}`;
}
