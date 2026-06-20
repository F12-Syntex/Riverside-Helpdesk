// AI prompt + parsing for natural-language rota edits ("ask for any change").
//
// The manager types a request like "give Daniel Friday off" or "swap the early
// and late shifts on Tuesday". We hand the model the current grid plus the team
// and ask it to return the whole updated grid as JSON. The server then
// sanitises the result against the real staff/leave before saving, so a bad
// response can never corrupt the rota.
import { weekDays, shiftAt } from '@/lib/rota/logic';

export function buildRotaChatPrompt({ staff, weekStarting, grid, times, message, minStaff = 2 }) {
  const days = weekDays(weekStarting);
  const dayHeader = days.map((d, i) => `${i}=${d.long} ${d.date}`).join(', ');

  const staffLines = staff.map((s) => {
    const codes = days.map((_, d) => shiftAt(grid, s.id, d) || 'OFF');
    const leaveDays = days.filter((_, d) => shiftAt(grid, s.id, d) === 'AL').map((d) => d.long);
    const bits = [`id ${s.id} — ${s.name}`];
    if (s.about) bits.push(`(${s.about})`);
    bits.push(`current: [${codes.join(', ')}]`);
    if (leaveDays.length) bits.push(`on leave: ${leaveDays.join(', ')} (must stay AL)`);
    return '- ' + bits.join(' ');
  }).join('\n');

  return [
    'You are helping a GP practice manager edit a weekly staff rota for The Riverside Practice.',
    `The week runs Monday–Friday. Day indexes: ${dayHeader}.`,
    'Each staff member has 5 shift codes (one per day, Mon→Fri). Codes:',
    "  E = early shift (" + times.E.start + '–' + times.E.end + ')',
    '  L = late shift (' + times.L.start + '–' + times.L.end + ')',
    '  OFF = not working that day',
    '  AL = annual leave (FIXED — never change an AL day)',
    '',
    `Aim to keep at least ${minStaff} staff on every early shift and every late shift, and keep early/late fairly shared.`,
    '',
    'CURRENT ROTA:',
    staffLines,
    '',
    'THE MANAGER ASKS: ' + message,
    '',
    'Apply the request, keeping the rota balanced. Respond with ONLY a JSON object (no markdown):',
    '{',
    '  "grid": { "<staffId>": ["E","L","OFF","E","L"] },   // one array of 5 codes per staff id above',
    '  "reply": "one short, friendly sentence describing what you changed"',
    '}',
    'Include every staff id. Keep AL days as AL. Use only the codes E, L, OFF, AL.',
  ].join('\n');
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
  return { grid: obj.grid, reply: typeof obj.reply === 'string' ? obj.reply : 'Done.' };
}
