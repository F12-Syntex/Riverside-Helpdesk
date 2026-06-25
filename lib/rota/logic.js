// Shared rota logic — pure functions used by both the server (generation,
// validation) and the client (display, WhatsApp export). Adapted from the
// Claude design (Rota.dc.html): a week is a grid of shift codes per staff
// member over Monday–Friday.
//
// Shift codes: 'E' early, 'L' late, 'F' full day, 'OFF' not working, 'AL'
// annual leave. ('F' is used mainly by temporary staff who work the whole day.)

export const DSHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const DLONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DEFAULT_TIMES = { E: { start: '7:45', end: '4:15' }, L: { start: '10:00', end: '6:30' }, F: { start: '7:45', end: '6:30' } };

export const SHIFT_META = {
  E: { bg: '#cfe0f0', color: '#003087' },
  L: { bg: '#c8e7e2', color: '#0b6b5f' },
  F: { bg: '#e7dff3', color: '#4b2e83' },
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

// A WhatsApp mention handle from a stored phone number: the digits in
// international form prefixed with "@", e.g. "+44 7459 533082" → "@447459533082".
// A UK local number ("07…") is given its +44 country code. Returns '' when there
// aren't enough digits to be a real number, so the caller falls back to the name.
export function pingHandle(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '44' + d.slice(1);
  return d.length >= 10 ? '@' + d : '';
}
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

// Sum each staff member's early/late tally across a set of past schedules.
// Feeds `generateGrid` so fairness carries across weeks: someone who has had
// more lates than earlies recently is started on an early when a week's split
// is otherwise a toss-up, and vice versa.
export function tallyHistory(schedules, staff) {
  const counts = {};
  staff.forEach((s) => { counts[s.id] = { e: 0, l: 0 }; });
  (schedules || []).forEach((sched) => {
    const grid = sched && sched.grid;
    if (!grid) return;
    staff.forEach((s) => {
      const row = grid[s.id];
      if (!Array.isArray(row)) return;
      for (let d = 0; d < 5; d++) {
        if (row[d] === 'E') counts[s.id].e++;
        else if (row[d] === 'L') counts[s.id].l++;
      }
    });
  });
  return counts;
}

// Deterministic generator: everyone works each non-leave day, split fairly
// between early and late, keeping at least `minStaff` on each shift where the
// numbers allow. Mirrors the design's balancing, generalised to any team.
//
// `history` (from tallyHistory) carries early/late fairness across weeks. It is
// used only to break the within-week start tie, so each individual week stays
// balanced (still a 3/2 split) while the long run evens out — nudging whoever
// is owed an early onto earlies first this week.
// Temporary staff (s.temporary) pick their own days, so they are never
// auto-assigned: their row is carried over verbatim from `prevGrid` (an
// early/late/blank pattern set by hand), with booked leave still winning. The
// shifts they ARE booked for count towards coverage, so the permanent team is
// balanced around them.
export function generateGrid(staff, mondayISO, minStaff = 2, seed = 0, history = null, prevGrid = null) {
  const days = weekDays(mondayISO);
  const cons = leaveConstraints(staff, days);
  const result = {};
  const counts = {};
  const bias = {};
  staff.forEach((s) => {
    counts[s.id] = { e: 0, l: 0 };
    if (s.temporary) {
      // Keep their hand-set pattern (only E/L survive; everything else is a
      // blank "not working" day), but never override booked leave.
      const prev = (prevGrid && Array.isArray(prevGrid[s.id])) ? prevGrid[s.id] : [];
      result[s.id] = [0, 1, 2, 3, 4].map((d) => (cons[s.id][d] === 'AL' ? 'AL' : (prev[d] === 'E' || prev[d] === 'L' || prev[d] === 'F' ? prev[d] : null)));
    } else {
      result[s.id] = cons[s.id].slice();
    }
    const h = history && history[s.id];
    // Positive → owed an early (more past lates); negative → owed a late.
    bias[s.id] = h ? (h.l - h.e) : 0;
  });

  for (let d = 0; d < 5; d++) {
    // Only permanent, non-leave staff are auto-assigned. Temporary staff keep
    // whatever they were booked for.
    let avail = staff.filter((s) => !s.temporary && result[s.id][d] === null).map((s) => s.id);
    const rot = avail.length ? (((d + seed) % avail.length) + avail.length) % avail.length : 0;
    avail = avail.slice(rot).concat(avail.slice(0, rot));
    avail.forEach((id) => {
      // Balance early/late by running counts within the week. On a tie, lean on
      // cross-week history first (keep the long run fair), then on the seed so
      // "Regenerate" still yields a genuinely different (still fair) week.
      const tie = bias[id] > 0 ? 'E' : bias[id] < 0 ? 'L' : (((seed + d) % 2 === 0) ? 'E' : 'L');
      const pick = counts[id].e === counts[id].l
        ? tie
        : (counts[id].e < counts[id].l ? 'E' : 'L');
      result[id][d] = pick;
      counts[id][pick === 'E' ? 'e' : 'l']++;
    });
    // Coverage counts everyone on shift (temporary staff included), but only
    // permanent staff in `avail` can be moved to fix it. A full day (F) covers
    // both the early and the late.
    const onE = () => staff.filter((s) => result[s.id][d] === 'E' || result[s.id][d] === 'F').length;
    const onL = () => staff.filter((s) => result[s.id][d] === 'L' || result[s.id][d] === 'F').length;
    const eIds = () => avail.filter((id) => result[id][d] === 'E');
    const lIds = () => avail.filter((id) => result[id][d] === 'L');
    let g = 0;
    while (onE() < minStaff && lIds().length && onL() > minStaff && g++ < 16) {
      const c = lIds().sort((a, b) => counts[b].l - counts[a].l)[0];
      result[c][d] = 'E'; counts[c].l--; counts[c].e++;
    }
    g = 0;
    while (onL() < minStaff && eIds().length && onE() > minStaff && g++ < 16) {
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
    staff.forEach((s) => { const v = shiftAt(grid, s.id, d); if (v === 'E' || v === 'F') e++; if (v === 'L' || v === 'F') l++; });
    if (e < minStaff) issues.push(`${DLONG[d]} early shift has only ${e} ${e === 1 ? 'person' : 'people'} (needs ${minStaff}).`);
    if (l < minStaff) issues.push(`${DLONG[d]} late shift has only ${l} ${l === 1 ? 'person' : 'people'} (needs ${minStaff}).`);
  }
  const work = [];
  staff.forEach((s) => {
    // Temporary staff set their own days, so their split/workload isn't ours to
    // judge — they don't count towards fairness warnings.
    if (s.temporary) return;
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
  if (code === 'F') return { bg: SHIFT_META.F.bg, color: SHIFT_META.F.color, main: shiftRange(times, 'F') };
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
  if (code === 'F') { const t = times.F || DEFAULT_TIMES.F; return ampm(t.start, false) + '–' + ampm(t.end, true); }
  if (code === 'AL') return 'Leave';
  return 'Off';
}

// A WhatsApp message ready to paste into the team chat: a short greeting, then
// a *bold* name per person with "* Day: hours" bullets, collapsing runs of
// identical consecutive days into ranges (e.g. "Mon–Fri"), then a sign-off.
//   Hi all,
//
//   Please see next week's rota below:
//
//   *Iqra*
//   * Mon–Fri: 7:45am–4:15pm
//   ...
//
//   Thank you.
export function buildWhatsApp(grid, staff, mondayISO, times) {
  if (!grid) return '';
  const days = weekDays(mondayISO);

  // Relative phrase for the week, so the greeting reads naturally.
  const cur = currentMonday();
  const target = new Date(mondayISO + 'T00:00:00');
  const diff = Math.round((target.getTime() - cur.getTime()) / (7 * 86400000));
  const intro = diff === 0 ? "this week's rota"
    : diff === 1 ? "next week's rota"
    : diff === -1 ? "last week's rota"
    : ('the rota for ' + weekRangeLabel(mondayISO));

  const blocks = staff.map((s) => {
    // Ping the person by their number so WhatsApp tags them; fall back to their
    // bold first name when no number is on file.
    const ping = pingHandle(s.phone);
    const lines = [ping || ('*' + firstName(s.name) + '*')];
    if (s.temporary) {
      // Temporary staff: only their booked days (skip blank "not working" days),
      // so a part-week reads cleanly rather than a wall of "Off".
      const worked = days.filter((_, di) => { const c = shiftAt(grid, s.id, di); return c === 'E' || c === 'L' || c === 'F' || c === 'AL'; });
      if (!worked.length) { lines.push('* No days set this week'); return lines.join('\n'); }
      days.forEach((day, di) => {
        const c = shiftAt(grid, s.id, di);
        if (c === 'E' || c === 'L' || c === 'F' || c === 'AL') lines.push('* ' + day.short + ': ' + dayHours(c, times));
      });
      return lines.join('\n');
    }
    days.forEach((day, di) => {
      lines.push('* ' + day.short + ': ' + dayHours(shiftAt(grid, s.id, di) || 'OFF', times));
    });
    return lines.join('\n');
  });

  return 'Hi all,\n\nPlease see ' + intro + ' below:\n\n' + blocks.join('\n\n') + '\n\nThank you.';
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
  const temp = new Set();
  staff.forEach((s) => {
    out[s.id] = (grid[s.id] ? grid[s.id].slice() : ['OFF', 'OFF', 'OFF', 'OFF', 'OFF']);
    if (s.temporary) temp.add(s.id);
  });
  // Temporary staff are hand-set: their booked shifts count towards coverage
  // (they're in `out`), but rebalancing never moves them.
  const fixed = (id, d) => out[id][d] === 'AL' || temp.has(id) || (lockedKeys && lockedKeys.has(id + ':' + d));
  for (let d = 0; d < 5; d++) {
    const cE = () => staff.filter((s) => out[s.id][d] === 'E' || out[s.id][d] === 'F').length;
    const cL = () => staff.filter((s) => out[s.id][d] === 'L' || out[s.id][d] === 'F').length;
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
  const valid = new Set(['E', 'L', 'F', 'OFF', 'AL']);
  const out = {};
  staff.forEach((s) => {
    const row = (raw && Array.isArray(raw[s.id])) ? raw[s.id] : [];
    out[s.id] = [0, 1, 2, 3, 4].map((d) => {
      if (cons[s.id][d] === 'AL') return 'AL'; // leave always wins
      const v = String(row[d] || '').toUpperCase();
      // Temporary staff only ever work an early or a late they were booked for;
      // anything else is a blank "not working" day (null), not a scheduled OFF.
      if (s.temporary) return (v === 'E' || v === 'L' || v === 'F') ? v : null;
      return valid.has(v) ? v : 'OFF';
    });
  });
  return out;
}
