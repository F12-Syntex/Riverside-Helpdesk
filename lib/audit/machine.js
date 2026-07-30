// Who did it — by machine, not by IP address.
//
// An IP address is the wrong handle for a practice. Every machine in the
// building shares one public address, so an IP-keyed log says "someone at the
// surgery" for every row; and a laptop taken home, or a phone on 4G, changes
// address between one question and the next, so the same person splits into
// several apparent users. Neither is what an audit log is for.
//
// So the browser mints its own identifier the first time the app is opened on a
// machine and keeps it (localStorage, mirrored into a long-lived cookie). It
// survives an address change, a reboot and a different network, and it is
// meaningless anywhere else — it identifies a machine, not a person, and no IP
// address is stored anywhere in this feature.
//
// This module is the naming half: turning the browser's description of itself
// into something readable in the log, and giving each machine a short stable
// code so staff can talk about "A4F2" before anybody has renamed it.

// A machine id is what the browser generated: "m-" and 24 hex characters.
export function isMachineId(value) {
  return /^m-[0-9a-f]{24}$/.test(String(value || ''));
}

const OS_RULES = [
  [/windows nt 10\.0/i, 'Windows'],
  [/windows nt 6\.[123]/i, 'Windows'],
  [/windows/i, 'Windows'],
  [/iphone os|ipad|ipod/i, 'iOS'],
  [/mac os x|macintosh/i, 'macOS'],
  [/android/i, 'Android'],
  [/cros/i, 'ChromeOS'],
  [/ubuntu|debian|fedora|linux/i, 'Linux'],
];

// Order matters: Edge and Opera both claim to be Chrome, and Chrome claims to
// be Safari, so the impostors have to be tested first.
const BROWSER_RULES = [
  [/edg(?:e|a|ios)?\/([\d.]+)/i, 'Edge'],
  [/opr\/([\d.]+)/i, 'Opera'],
  [/samsungbrowser\/([\d.]+)/i, 'Samsung Internet'],
  [/firefox\/([\d.]+)|fxios\/([\d.]+)/i, 'Firefox'],
  [/chrome\/([\d.]+)|crios\/([\d.]+)/i, 'Chrome'],
  [/version\/([\d.]+).*safari/i, 'Safari'],
  [/safari\/([\d.]+)/i, 'Safari'],
];

/**
 * What the browser said it is running on.
 *
 * Deliberately shallow. A user-agent string cannot be parsed exactly and the
 * log does not need it to be — "Windows PC · Chrome 131" is enough to tell one
 * machine at the desk from another, and anything finer would be a guess
 * dressed up as a fact.
 */
export function parseUserAgent(rawUa) {
  const ua = String(rawUa || '');
  if (!ua.trim()) return { os: '', browser: '', device: '' };

  let os = '';
  for (const [pattern, name] of OS_RULES) {
    if (pattern.test(ua)) { os = name; break; }
  }

  let browser = '';
  for (const [pattern, name] of BROWSER_RULES) {
    const hit = ua.match(pattern);
    if (!hit) continue;
    const version = (hit[1] || hit[2] || '').split('.')[0];
    browser = version ? `${name} ${version}` : name;
    break;
  }

  const tablet = /ipad|tablet|(android(?!.*mobile))/i.test(ua);
  const phone = !tablet && /iphone|ipod|android.*mobile|mobile safari|windows phone/i.test(ua);
  const device = phone ? 'Phone' : tablet ? 'Tablet' : os ? 'Computer' : '';

  return { os, browser, device };
}

/**
 * The one-line description shown under a machine's name in the audit log.
 * e.g. "Windows computer · Chrome 131".
 */
export function machineLabel({ os, browser, device } = {}) {
  const left = [os, device ? device.toLowerCase() : ''].filter(Boolean).join(' ');
  return [left, browser].filter(Boolean).join(' · ') || 'Unrecognised machine';
}

// A short, stable code derived from the id, so a machine nobody has named yet
// still has something to be called. Deterministic — the same machine is always
// the same code — and reversible into nothing: it is a hash of an identifier
// that was random to begin with.
export function machineCode(id) {
  const text = String(id || '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Base 32 without the letters that read as digits (I, L, O, U).
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let code = '';
  let value = hash;
  for (let i = 0; i < 4; i++) {
    code = alphabet[value % 32] + code;
    value = Math.floor(value / 32);
  }
  return code;
}

// What to call a machine: the name someone gave it, or its code.
export function machineName(machine) {
  const given = String(machine?.name || '').trim();
  if (given) return given;
  return 'Machine ' + machineCode(machine?.id);
}
