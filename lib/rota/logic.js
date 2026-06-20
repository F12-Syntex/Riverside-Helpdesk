// Shared rota logic — pure functions used by both the server (generation,
// validation) and the client (display, WhatsApp export). Adapted from the
// Claude design (Rota.dc.html): a week is a grid of shift codes per staff
// member over Monday–Friday.
//
// Shift codes: 'E' early, 'L' late, 'OFF' not working, 'AL' annual leave.

export const DSHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const DLONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DEFAULT_TIMES = { E: { start: '7:45', end: '4:15' }, L: { start: '10:00', end: '6:30' } };

export const SHIFT_META = {
  E: { bg: '#cfe0f0', color: '#003087' },
  L: { bg: '#c8e7e2', color: '#0b6b5f' },
  AL: { bg: '#f3e3a8', color: '#6b5601' },
  OFF: { bg: '#f0f4f5', color: '#768692' },
};

function pad(n) { return String(n).padStart(2, '0'); }
export function isoOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// Monday of the current week, in local time.
export function currentMonday() {
  const d = new Date();
  const wd = d.getDay(); // 0 Sun .. 6 Sat
  d.setDate(d.getDate() + (wd === 0 ? -6 : 1 - wd));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function mondayPlusWeeks(weeks) {
  const m = currentMonday();
  m.setDate(m.getDate() + weeks * 7);
  return m;
}

// The five working days of the week beginning at mondayISO ('YYYY-MM-DD').
export function weekDays(mondayISO) {
  const [y, m, d] = mondayISO.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  return [0, 1, 2, 3, 4].map((i) => {
    const dt = new Date(base);
    dt.setDate(base.getDate() + i);
    return { short: DSHORT[i], long: DLONG[i], date: dt.getDate() + ' ' + MONTHS[dt.getMonth()], iso: isoOf(dt) };
  });
}

export function weekRangeLabel(mondayISO) {
  const days = weekDays(mondayISO);
  const first = days[0];
  const last = days[4];
  const lastIso = last.iso.split('-').map(Number);
  return first.date.split(' ')[0] + '–' + last.date + ' ' + lastIso[0];
}

export function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
export function initials(n) {
  const p = String(n || '').trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase();
  return (p[0] || '?').slice(0, 2).toUpperCase();
}

// Days a staff member is on annual leave for the given week → array index → 'AL'.
function leaveConstraints(staff, days) {
  const out = {};
  staff.forEach((s) => {
    const row = [null, null, null, null, null];
    (s.leave || []).forEach((lv) => {
      const start = lv.start;
      const end = lv.end || lv.start;
      days.forEach((day, i) => {
        if (day.iso >= start && day.iso <= end) row[i] = 'AL';
      });
    });
    out[s.id] = row;
  });
  return out;
}

// Deterministic generator: everyone works each non-leave day, split fairly
// between early and late, keeping at least `minStaff` on each shift where the
// numbers allow. Mirrors the design's balancing, generalised to any team.
export function generateGrid(staff, mondayISO, minStaff = 2, seed = 0) {
  const days = weekDays(mondayISO);
  const cons = leaveConstraints(staff, days);
  const result = {};
  const counts = {};
  staff.forEach((s) => { counts[s.id] = { e: 0, l: 0 }; result[s.id] = cons[s.id].slice(); });

  for (let d = 0; d < 5; d++) {
    let avail = staff.filter((s) => result[s.id][d] === null).map((s) => s.id);
    const rot = avail.length ? (((d + seed) % avail.length) + avail.length) % avail.length : 0;
    avail = avail.slice(rot).concat(avail.slice(0, rot));
    avail.forEach((id) => {
      // Balance early/late by running counts; break ties differently per seed
      // so "Regenerate" yields a genuinely different (still fair) week.
      const pick = counts[id].e === counts[id].l
        ? (((seed + d) % 2 === 0) ? 'E' : 'L')
        : (counts[id].e < counts[id].l ? 'E' : 'L');
      result[id][d] = pick;
      counts[id][pick === 'E' ? 'e' : 'l']++;
    });
    const eIds = () => avail.filter((id) => result[id][d] === 'E');
    const lIds = () => avail.filter((id) => result[id][d] === 'L');
    let g = 0;
    while (eIds().length < minStaff && lIds().length > minStaff && g++ < 16) {
      const c = lIds().sort((a, b) => counts[b].l - counts[a].l)[0];
      result[c][d] = 'E'; counts[c].l--; counts[c].e++;
    }
    g = 0;
    while (lIds().length < minStaff && eIds().length > minStaff && g++ < 16) {
      const c = eIds().sort((a, b) => counts[b].e - counts[a].e)[0];
      result[c][d] = 'L'; counts[c].e--; counts[c].l++;
    }
  }
  return result;
}

export function shiftAt(grid, id, d) { return (grid && grid[id] && grid[id][d]) || null; }

// Coverage + fairness problems, as human-readable sentences.
export function analyze(grid, staff, minStaff = 2) {
  const issues = [];
  for (let d = 0; d < 5; d++) {
    let e = 0, l = 0;
    staff.forEach((s) => { const v = shiftAt(grid, s.id, d); if (v === 'E') e++; else if (v === 'L') l++; });
    if (e < minStaff) issues.push(`${DLONG[d]} early shift has only ${e} ${e === 1 ? 'person' : 'people'} (needs ${minStaff}).`);
    if (l < minStaff) issues.push(`${DLONG[d]} late shift has only ${l} ${l === 1 ? 'person' : 'people'} (needs ${minStaff}).`);
  }
  const work = [];
  staff.forEach((s) => {
    let e = 0, l = 0;
    for (let d = 0; d < 5; d++) { const v = shiftAt(grid, s.id, d); if (v === 'E') e++; else if (v === 'L') l++; }
    work.push({ name: firstName(s.name), days: e + l, e, l });
    if (Math.abs(e - l) >= 3) issues.push(`${firstName(s.name)} has an uneven split (${e} early, ${l} late).`);
  });
  const active = work.filter((w) => w.days > 0);
  if (active.length > 1) {
    const mx = active.reduce((a, b) => (b.days > a.days ? b : a));
    const mn = active.reduce((a, b) => (b.days < a.days ? b : a));
    if (mx.days - mn.days >= 3) issues.push(`Workload is uneven — ${mx.name} works ${mx.days} days but ${mn.name} only ${mn.days}.`);
  }
  return issues;
}

export function shiftRange(times, code) {
  const t = (times && times[code]) || DEFAULT_TIMES[code];
  return t ? `${t.start}–${t.end}` : '';
}

// Cell display model for the grid.
export function cellView(code, times) {
  if (code === 'E') return { bg: SHIFT_META.E.bg, color: SHIFT_META.E.color, main: shiftRange(times, 'E') };
  if (code === 'L') return { bg: SHIFT_META.L.bg, color: SHIFT_META.L.color, main: shiftRange(times, 'L') };
  if (code === 'AL') return { bg: SHIFT_META.AL.bg, color: SHIFT_META.AL.color, main: 'Leave' };
  if (code === 'OFF') return { bg: SHIFT_META.OFF.bg, color: SHIFT_META.OFF.color, main: 'Off' };
  return { bg: '#fff', color: '#768692', main: '' };
}

// Append am/pm to a "h:mm" time. Starts are morning, ends are afternoon/evening
// for these shifts; if the value already carries am/pm it's left as-is.
function ampm(t, isEnd) {
  const v = String(t || '').trim();
  if (/[ap]m/i.test(v)) return v.toLowerCase().replace(/\s+/g, '');
  return v + (isEnd ? 'pm' : 'am');
}

function dayHours(code, times) {
  if (code === 'E') return ampm(times.E.start, false) + '–' + ampm(times.E.end, true);
  if (code === 'L') return ampm(times.L.start, false) + '–' + ampm(times.L.end, true);
  if (code === 'AL') return 'Leave';
  return 'Off';
}

const SHIFT_EMOJI = { E: '\u{1F305}', L: '\u{1F306}', AL: '\u{1F334}', OFF: '\u{1F4A4}' };

// A WhatsApp-formatted rota using its rich text: *bold* title and names,
// _italic_ week range, an emoji per shift, and a small legend. Reads cleanly
// when pasted straight into a chat.
//   *The Riverside Practice — Duty rota*
//   _15–19 Jun 2026_
//
//   *Iqra*
//   🌅 Mon — 7:45am–4:15pm
//   ...
export function buildWhatsApp(grid, staff, mondayISO, times, practiceName = 'The Riverside Practice') {
  if (!grid) return '';
  const days = weekDays(mondayISO);
  const header = '*' + practiceName + ' — Duty rota*\n_' + weekRangeLabel(mondayISO) + '_';
  const blocks = staff.map((s) => {
    const lines = ['*' + firstName(s.name) + '*'];
    days.forEach((day, di) => {
      const code = shiftAt(grid, s.id, di) || 'OFF';
      const emoji = SHIFT_EMOJI[code] || SHIFT_EMOJI.OFF;
      lines.push(emoji + ' ' + day.short + ' — ' + dayHours(code, times));
    });
    return lines.join('\n');
  });
  const legend = '\u{1F305} Early   \u{1F306} Late   \u{1F334} Leave   \u{1F4A4} Off';
  return [header, ...blocks, legend].join('\n\n');
}

// Cells that differ between two grids, as a Set of "id:day" keys. Used to lock
// the manager's explicit change before rebalancing the rest around it.
export function changedKeys(prev, next, staff) {
  const keys = new Set();
  staff.forEach((s) => {
    const a = (prev && prev[s.id]) || [];
    const b = (next && next[s.id]) || [];
    for (let d = 0; d < 5; d++) if ((a[d] || 'OFF') !== (b[d] || 'OFF')) keys.add(s.id + ':' + d);
  });
  return keys;
}

// Fix coverage without touching the requested change: AL days and any cell in
// `lockedKeys` stay put; everyone else is nudged to get at least `minStaff` on
// each early and late shift. This is the "apply the change, then rebalance"
// step — it restores cover around what the manager asked for.
export function rebalance(grid, staff, lockedKeys, minStaff = 2) {
  const out = {};
  staff.forEach((s) => { out[s.id] = (grid[s.id] ? grid[s.id].slice() : ['OFF', 'OFF', 'OFF', 'OFF', 'OFF']); });
  const fixed = (id, d) => out[id][d] === 'AL' || (lockedKeys && lockedKeys.has(id + ':' + d));
  for (let d = 0; d < 5; d++) {
    const cE = () => staff.filter((s) => out[s.id][d] === 'E').length;
    const cL = () => staff.filter((s) => out[s.id][d] === 'L').length;
    let g = 0;
    while (cE() < minStaff && g++ < 40) {
      let c = staff.find((s) => !fixed(s.id, d) && out[s.id][d] === 'OFF');
      if (!c) c = staff.find((s) => !fixed(s.id, d) && out[s.id][d] === 'L' && cL() > minStaff);
      if (!c) break;
      out[c.id][d] = 'E';
    }
    g = 0;
    while (cL() < minStaff && g++ < 40) {
      let c = staff.find((s) => !fixed(s.id, d) && out[s.id][d] === 'OFF');
      if (!c) c = staff.find((s) => !fixed(s.id, d) && out[s.id][d] === 'E' && cE() > minStaff);
      if (!c) break;
      out[c.id][d] = 'L';
    }
  }
  return out;
}

// Validate/normalise an AI- or client-supplied grid against the real staff and
// their leave, so a bad model response can never corrupt stored data.
export function sanitiseGrid(raw, staff, mondayISO) {
  const days = weekDays(mondayISO);
  const cons = leaveConstraints(staff, days);
  const valid = new Set(['E', 'L', 'OFF', 'AL']);
  const out = {};
  staff.forEach((s) => {
    const row = (raw && Array.isArray(raw[s.id])) ? raw[s.id] : [];
    out[s.id] = [0, 1, 2, 3, 4].map((d) => {
      if (cons[s.id][d] === 'AL') return 'AL'; // leave always wins
      const v = String(row[d] || '').toUpperCase();
      return valid.has(v) ? v : 'OFF';
    });
  });
  return out;
}
