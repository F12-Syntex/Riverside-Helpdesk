// Prompt building and response parsing for the staff rota generator.
//
// The model is given the practice's staff list and the week's constraints and
// must return ONLY JSON describing a day-by-day rota. Generation is grounded in
// the inputs (staff, opening hours, requirements) rather than the document RAG
// store used by the Q&A bot — this is a planning task, not a retrieval one.

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Produce the seven dated days of the week beginning at `weekStarting`
// (a 'YYYY-MM-DD' string, expected to be a Monday) so the prompt and the parsed
// result share the same calendar and the model doesn't have to compute dates.
export function weekDays(weekStarting) {
  const out = [];
  const base = new Date(weekStarting + 'T00:00:00Z');
  if (isNaN(base.getTime())) return out;
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    out.push({ day: DAY_NAMES[d.getUTCDay()], date: iso });
  }
  return out;
}

export function buildRotaPrompt({ staff = [], weekStarting, openingHours = '', requirements = '' }) {
  const days = weekDays(weekStarting);
  const staffLines = staff.length
    ? staff.map((s) => {
        const bits = [s.name];
        if (s.role) bits.push('(' + s.role + ')');
        if (s.hoursPerWeek) bits.push('— contracted ' + s.hoursPerWeek + 'h/week');
        if (s.notes) bits.push('— ' + s.notes);
        return '- ' + bits.join(' ');
      }).join('\n')
    : '(no staff provided)';

  const dayList = days.map((d) => `  - ${d.day} ${d.date}`).join('\n');

  return [
    'You are an experienced GP practice manager at The Riverside Practice building a',
    'fair, workable staff rota for one week. Plan sensible shifts that cover the',
    'practice during its opening hours, respect each person\'s contracted hours,',
    'spread early/late shifts and weekend work fairly, and honour every stated',
    'constraint. Only roster the staff listed. If you cannot fully cover a period,',
    'do your best and explain the gap in "notes".',
    '',
    'STAFF:',
    staffLines,
    '',
    'WEEK (roster each of these dates; leave a day\'s "shifts" empty if the practice is closed):',
    dayList,
    '',
    'OPENING HOURS: ' + (openingHours || 'not specified — assume Mon–Fri 08:00–18:30, closed weekends'),
    '',
    'REQUIREMENTS / CONSTRAINTS: ' + (requirements || 'none given — use sensible reception/admin coverage'),
    '',
    'Respond with ONLY a JSON object (no markdown, no commentary) in exactly this shape:',
    '{',
    '  "days": [',
    '    {',
    '      "day": "Monday",',
    '      "date": "YYYY-MM-DD",',
    '      "shifts": [',
    '        { "staff": "Full Name", "role": "Receptionist", "start": "08:00", "end": "13:00" }',
    '      ]',
    '    }',
    '  ],',
    '  "notes": "short summary of coverage and any gaps or assumptions"',
    '}',
    '',
    'Use 24-hour times (HH:MM). Include all seven dates above in "days", in order.',
    'Every "staff" value must be one of the names listed above.',
  ].join('\n');
}

// Tolerant JSON extraction: models sometimes wrap JSON in ```json fences or add
// stray prose. Pull out the outermost {...} and parse it, then normalise the
// shape so the API/UI can rely on it.
export function parseRotaJson(text) {
  if (!text || typeof text !== 'string') return null;
  let body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;
  let obj;
  try {
    obj = JSON.parse(body.slice(first, last + 1));
  } catch (e) {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;

  const days = Array.isArray(obj.days) ? obj.days.map((d) => ({
    day: typeof d?.day === 'string' ? d.day : '',
    date: typeof d?.date === 'string' ? d.date : '',
    shifts: Array.isArray(d?.shifts) ? d.shifts.map((sh) => ({
      staff: typeof sh?.staff === 'string' ? sh.staff : '',
      role: typeof sh?.role === 'string' ? sh.role : '',
      start: typeof sh?.start === 'string' ? sh.start : '',
      end: typeof sh?.end === 'string' ? sh.end : '',
    })).filter((sh) => sh.staff) : [],
  })) : [];

  if (!days.length) return null;
  return { days, notes: typeof obj.notes === 'string' ? obj.notes : '' };
}
