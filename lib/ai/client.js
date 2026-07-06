// Client-side helper the UI uses to send a message. All the heavy lifting
// (retrieval, prompt building, calling the model, parsing, resolving citations)
// happens on the server in /api/ask; the browser just sends the message, recent
// history, any locally-stored custom guides and any attached images (as data
// URLs, already downscaled by the composer).
//
// The server decides for itself whether the message is a staff how-to question
// or an incoming patient request to route, and replies with a `kind` of either
// "answer" (intro/sections/message/tip — sections are markdown blocks, each
// flagged as document-backed with a citation or as clearly-marked AI judgement)
// or "triage" (urgency/actions/redFlags/route/patientMessage, with the same
// per-item provenance).
export async function askQuestion({ question, history = '', customGuides = [], images = [] }) {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history, customGuides, images }),
  });
  if (!res.ok) throw new Error('AI request failed (' + res.status + ')');
  const data = await res.json();
  if (!data || typeof data !== 'object') throw new Error('Bad AI response');

  const items = (arr) => Array.isArray(arr)
    ? arr.map((s) => ({
        text: s && s.text ? s.text : '',
        cite: s && s.cite ? s.cite : null,
        basis: s && s.basis === 'judgement' ? 'judgement' : 'documents',
      })).filter((s) => s.text)
    : [];
  const contacts = Array.isArray(data.contacts)
    ? data.contacts.map((c) => ({
        label: c && c.label ? c.label : '',
        phones: Array.isArray(c && c.phones) ? c.phones : [],
        emails: Array.isArray(c && c.emails) ? c.emails : [],
      })).filter((c) => c.label && (c.phones.length || c.emails.length))
    : [];

  if (data.kind === 'triage') {
    const BANDS = ['emergency', 'urgent', 'routine', 'self-care', 'unclear'];
    return {
      kind: 'triage',
      urgency: BANDS.includes(data.urgency) ? data.urgency : 'unclear',
      urgencyReason: typeof data.urgencyReason === 'string' ? data.urgencyReason : '',
      summary: typeof data.summary === 'string' ? data.summary : '',
      actions: items(data.actions),
      redFlags: items(data.redFlags),
      route: typeof data.route === 'string' ? data.route : '',
      patientMessage: typeof data.patientMessage === 'string' ? data.patientMessage : '',
      patientMessageCite: data.patientMessageCite || null,
      citations: Array.isArray(data.citations) ? data.citations : [],
      contacts,
    };
  }

  const sections = Array.isArray(data.sections)
    ? data.sections.map((s) => ({
        markdown: s && typeof s.markdown === 'string' ? s.markdown : '',
        cite: s && s.cite ? s.cite : null,
        basis: s && s.basis === 'judgement' ? 'judgement' : 'documents',
      })).filter((s) => s.markdown)
    : [];

  return {
    kind: 'answer',
    answerable: data.answerable !== false,
    intro: typeof data.intro === 'string' ? data.intro : '',
    sections,
    message: typeof data.message === 'string' ? data.message : '',
    messageCite: data.messageCite || null,
    tip: typeof data.tip === 'string' ? data.tip : '',
    citations: Array.isArray(data.citations) ? data.citations : [],
    contacts,
  };
}
