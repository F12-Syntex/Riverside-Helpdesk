// Where the practice's shared drive is mounted, as Chrome sees it.
//
// It stays a placeholder in the repository on purpose: the real path is a
// property of the practice's network, not of this code, and it is set once —
// as the EXT_UPDATE_BASE variable in the GitHub Actions repository settings —
// without a commit. Two files must agree on it (the manifest's update_url and
// the codebase in updates.xml), so both read it from here.
export const DEFAULT_BASE = 'file:///Z:/PLACEHOLDER_PATH';

export function base() {
  return (process.env.EXT_UPDATE_BASE || DEFAULT_BASE).replace(/\/+$/, '');
}

export const updatesUrl = () => `${base()}/updates.xml`;
export const crxUrl = () => `${base()}/extension.crx`;
export const isPlaceholder = () => base() === DEFAULT_BASE;
