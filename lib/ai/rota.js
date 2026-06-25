// AI prompt + parsing for natural-language rota edits ("ask for any change").
//
// The manager types a request — anything from a single cell tweak to "Simin
// isn't in this week" or "I've already moved Iqra to a day off". We hand the
// model the current grid plus the team and ask it to return the whole updated
// grid as JSON. The server then sanitises the result against the real
// staff/leave before saving, so a bad response can never corrupt the rota.
import { weekDays, shiftAt } from '@/lib/rota/logic';

export function buildRotaChatPrompt({ staff, weekStarting, grid, times, message, minStaff = 2 }) {
  const days = weekDays(weekStarting);
  const dayHeader = days.map((d, i) => `${i}=${d.long} ${d.date}`).join(', ');

  const staffLines = staff.map((s) => {
    const codes = days.map((_, d) => shiftAt(grid, s.id, d) || 'OFF');
    const leaveDays = days.filter((_, d) => shiftAt(grid, s.id, d) === 'AL').map((d) => d.long);
    const bits = [`id ${s.id} — ${s.name}`];
    if (s.about) bits.push(`(${s.about})`);
    if (s.temporary) bits.push('[TEMPORARY — sets their own days; keep this row EXACTLY as-is]');
    bits.push(`current: [${codes.join(', ')}]`);
    if (leaveDays.length) bits.push(`on leave: ${leaveDays.join(', ')} (keep AL)`);
    return '- ' + bits.join(' ');
  }).join('\n');

  return [
    'You are the rota assistant for The Riverside Practice. A manager will tell you, in plain English,',
    'how they want the weekly staff rota changed. Carry out the request as fully and literally as possible.',
    `The week runs Monday–Friday. Day indexes: ${dayHeader}.`,
    'Each staff member has 5 shift codes (one per day, Mon→Fri). Codes:',
    `  E = early shift (currently ${times.E.start}–${times.E.end})`,
    `  L = late shift (currently ${times.L.start}–${times.L.end})`,
    '  OFF = not working that day',
    '  AL = annual leave (already booked — keep AL days as AL)',
    '',
    'WORDS THE PRACTICE USES (interpret these phrases):',
    '- "full day" = 7:45–6:30 (the whole opening day).',
    '- "early" / "early shift" / "opening" = the E shift.',
    '- "late" / "late shift" / "closing" = the L shift.',
    '- "off" / "day off" / "rest day" = OFF. "leave" / "holiday" / "annual leave" = AL (never change AL).',
    '- If a request asks for hours that are not one of the standard shifts (e.g. a "full day"),',
    '  update the relevant shift\'s start/finish in "times" so it matches, or pick the closest shift,',
    '  and say what you did in "reply".',
    '',
    'HOW TO INTERPRET REQUESTS — be flexible and do exactly what is asked:',
    '- Treat statements as instructions to apply. "I\'ve adjusted Iqra\'s Tuesday to off", "set Daniel to late on Friday",',
    '  "move Simin to early Monday" all mean: make that change now.',
    `- "X isn't coming this week" / "X is away all week" / "X is off" (no day given) → set ALL of X's non-leave days to OFF.`,
    '- "X is off on <day>" → set just that day to OFF. "Swap early/late on <day>" → flip E and L for everyone that day.',
    '- "Give X the same shifts as Y", "put X on lates this week", "X only works mornings" → apply across the whole week.',
    '- You may set anyone to OFF, move people between E and L, and decide who covers — there is no limit on changes.',
    '- NEVER change a staff member marked [TEMPORARY]: their days are set by hand. Leave their row exactly as given',
    '  and balance everyone else around it, unless the manager explicitly names that temporary person in the request.',
    `- Aim for at least ${minStaff} staff on each early and each late shift and a fair early/late split, BUT do NOT refuse`,
    '  or water down an explicit instruction to protect coverage. If the manager\'s change leaves a shift short, make the',
    '  change anyway — coverage problems are reported separately and the manager can choose to rebalance.',
    '- If the manager changes shift TIMES ("late starts at 10", "early finishes at 5pm", "5pm finish"), update the',
    '  matching value in "times" (24-hour or am/pm as given) and keep the grid otherwise unchanged unless they also asked.',
    '- If the request is unclear, make the most reasonable interpretation and explain it in "reply".',
    '',
    'CURRENT ROTA:',
    staffLines,
    '',
    'THE MANAGER SAYS: ' + message,
    '',
    'Respond with ONLY a JSON object (no markdown, no commentary):',
    '{',
    '  "grid": { "<staffId>": ["E","L","OFF","E","L"] },   // one array of 5 codes per staff id above',
    '  "times": { "E": { "start": "7:45", "end": "4:15" }, "L": { "start": "10:00", "end": "6:30" } },  // include ONLY if times changed',
    '  "reply": "one short, friendly sentence describing exactly what you changed"',
    '}',
    'Include every staff id in "grid". Keep AL days as AL. Use only the codes E, L, OFF, AL.',
  ].join('\n');
}

function validTimes(t) {
  const ok = (x) => x && typeof x.start === 'string' && typeof x.end === 'string' && x.start && x.end;
  if (t && ok(t.E) && ok(t.L)) {
    return { E: { start: t.E.start, end: t.E.end }, L: { start: t.L.start, end: t.L.end } };
  }
  return null;
}

export function parseGridResponse(text) {
  if (!text || typeof text !== 'string') return null;
  let body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;
  let obj;
  try { obj = JSON.parse(body.slice(first, last + 1)); } catch (e) { return null; }
  if (!obj || typeof obj !== 'object' || !obj.grid || typeof obj.grid !== 'object') return null;
  return {
    grid: obj.grid,
    times: validTimes(obj.times),
    reply: typeof obj.reply === 'string' ? obj.reply : 'Done.',
  };
}
