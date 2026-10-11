// Parsing of the JSON a model returns, for the routes that still ask for it
// (/api/docfile). Pure functions — no I/O, no React.

// Parse the model's reply into a known shape. The model decides "kind" itself,
// so this returns an "answer" object (intro/sections/message/tip), a "triage"
// object (urgency/actions/redFlags/route/patientMessage) or a "docfile" object
// (date/source/department/actions/note for a filing title). Tolerates
// stray markdown fences and partial JSON; falls back to a plain answer.
// Models sometimes emit trailing garbage after the JSON object (a duplicated
// tail, commentary, a second object). lastIndexOf('}') swallows that garbage
// into the candidate string and the parse fails; instead walk from the first
// '{' tracking string/escape state and take the first balanced object.
function balancedJson(str) {
  const a = str.indexOf('{');
  if (a === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = a; i < str.length; i++) {
    const ch = str[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return str.slice(a, i + 1); }
  }
  return null;
}

// Inline "Source N" mentions belong in the source/quote fields, not the prose —
// strip them wherever the model leaks them into text.
function stripInlineSources(text) {
  return String(text || '')
    .replace(/[.,;(\s]*\b[Ss]ources?\s+\d+(?:\s*(?:,|and|&)\s*(?:[Ss]ources?\s+)?\d+)*\)?/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Same clean-up for a multi-line markdown section — collapse runs of spaces but
// keep the newlines, which carry the markdown block structure.
function stripInlineSourcesMd(text) {
  return String(text || '')
    .replace(/[.,;(]*[ \t]*\b[Ss]ources?\s+\d+(?:\s*(?:,|and|&)\s*(?:[Ss]ources?\s+)?\d+)*\)?/g, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim();
}

export function parseAiJson(raw) {
  const str = (raw || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  // Triage actions/red flags: inline text with basis + source/quote.
  const item = (x) => (x && typeof x === 'object')
    ? {
        text: stripInlineSources(x.text),
        basis: x.basis === 'judgement' ? 'judgement' : 'documents',
        source: parseInt(x.source, 10) || 0,
        quote: typeof x.quote === 'string' ? x.quote : '',
      }
    : { text: stripInlineSources(x), basis: 'documents', source: 0, quote: '' };
  // Answer sections: a markdown block with basis + source/quote. Tolerates the
  // model using "text" for the markdown field.
  const mdItem = (x) => (x && typeof x === 'object')
    ? {
        markdown: stripInlineSourcesMd(x.markdown != null ? x.markdown : x.text),
        basis: x.basis === 'judgement' ? 'judgement' : 'documents',
        source: parseInt(x.source, 10) || 0,
        quote: typeof x.quote === 'string' ? x.quote : '',
      }
    : { markdown: stripInlineSourcesMd(x), basis: 'documents', source: 0, quote: '' };
  const BANDS = ['emergency', 'urgent', 'routine', 'self-care', 'unclear'];
  try {
    // Balanced extraction first; fall back to a first-{…last-} slice for
    // output that is merely truncated but parseable after the naive cut.
    let o;
    const bal = balancedJson(str);
    try { o = JSON.parse(bal !== null ? bal : str); }
    catch (e1) {
      const a = str.indexOf('{');
      const b = str.lastIndexOf('}');
      if (a === -1 || b <= a) throw e1;
      o = JSON.parse(str.slice(a, b + 1));
    }
    if (o.kind === 'docfile') {
      // Filing-title fields are single short lines — collapse any stray
      // whitespace the model leaves in them.
      const line = (v) => typeof v === 'string' ? stripInlineSources(v).replace(/\s+/g, ' ').trim() : '';
      const action = (value) => value && typeof value === 'object'
        ? { text: line(value.text), evidence: line(value.evidence || value.quote) }
        : { text: line(value), evidence: '' };
      return {
        kind: 'docfile',
        date: line(o.date),
        dateEvidence: line(o.dateEvidence),
        dateType: line(o.dateType),
        source: line(o.source),
        department: line(o.department),
        actions: Array.isArray(o.actions) ? o.actions.map(action).filter((item) => item.text).slice(0, 6) : [],
        note: line(o.note),
        noteEvidence: line(o.noteEvidence),
      };
    }
    if (o.kind === 'triage') {
      return {
        kind: 'triage',
        urgency: BANDS.includes(o.urgency) ? o.urgency : 'unclear',
        urgencyReason: typeof o.urgencyReason === 'string' ? stripInlineSources(o.urgencyReason) : '',
        summary: typeof o.summary === 'string' ? stripInlineSources(o.summary) : '',
        actions: Array.isArray(o.actions) ? o.actions.map(item).filter((s) => s.text) : [],
        redFlags: Array.isArray(o.redFlags) ? o.redFlags.map(item).filter((s) => s.text) : [],
        route: typeof o.route === 'string' ? o.route.trim() : '',
        patientMessage: typeof o.patientMessage === 'string' ? o.patientMessage.trim() : '',
        patientMessageSource: parseInt(o.patientMessageSource, 10) || 0,
        patientMessageQuote: typeof o.patientMessageQuote === 'string' ? o.patientMessageQuote : '',
      };
    }
    let sections = Array.isArray(o.sections) ? o.sections.map(mdItem).filter((s) => s.markdown) : [];
    // Older-shape replies (or a model ignoring the new shape): map numbered
    // steps into one markdown line each so nothing is lost.
    if (!sections.length && Array.isArray(o.steps)) {
      sections = o.steps.map(item).filter((s) => s.text)
        .map((s, i) => ({ markdown: (i + 1) + '. ' + s.text, basis: s.basis, source: s.source, quote: s.quote }));
    }
    return {
      kind: 'answer',
      answerable: o.answerable === false ? false : true,
      intro: typeof o.intro === 'string' ? stripInlineSources(o.intro) : '',
      sections,
      message: typeof o.message === 'string' ? o.message.trim() : '',
      messageSource: parseInt(o.messageSource, 10) || 0,
      messageQuote: typeof o.messageQuote === 'string' ? o.messageQuote : '',
      tip: typeof o.tip === 'string' ? stripInlineSources(o.tip) : '',
    };
  } catch (e) {
    // Unparseable output. If it still looks like (broken) JSON, salvage the
    // field values by regex rather than showing raw JSON syntax to reception.
    if (/^\s*\{\s*"/.test(str)) {
      // Some models leave literal newlines/control characters inside JSON
      // strings; escape them so decoding a salvaged value can't throw.
      const unquote = (v) => {
        try {
          return JSON.parse('"' + v.replace(/[\u0000-\u001f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '"');
        } catch (err) { return v; }
      };
      const grab = (key) => {
        const m = str.match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\[\\s\\S])*)"'));
        return m ? stripInlineSources(unquote(m[1])) : '';
      };
      const sections = [];
      const secRe = /"(?:markdown|text)"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/g;
      for (let m; (m = secRe.exec(str)) && sections.length < 8;) {
        const t = stripInlineSourcesMd(unquote(m[1]));
        if (t && !sections.some((s2) => s2.markdown === t)) sections.push({ markdown: t, basis: 'documents', source: 0, quote: '' });
      }
      const intro = grab('intro');
      const tip = grab('tip');
      if (intro || sections.length) {
        return { kind: 'answer', answerable: true, intro, sections, message: '', messageSource: 0, messageQuote: '', tip };
      }
    }
    // Plain-prose fallback — drop anything that still looks like JSON syntax.
    const lines = (raw || '').split(/\n+/)
      .map((x) => x.replace(/^[-*\d.\)\s]+/, '').trim())
      .filter((x) => x && !/[{}\[\]]|"\w+"\s*:/.test(x));
    return {
      kind: 'answer',
      answerable: lines.length > 0,
      intro: '',
      sections: lines.slice(0, 6).map((t) => ({ markdown: stripInlineSourcesMd(t), basis: 'documents', source: 0, quote: '' })),
      message: '', messageSource: 0, messageQuote: '', tip: '',
    };
  }
}
