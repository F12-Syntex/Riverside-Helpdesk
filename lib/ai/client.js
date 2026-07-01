// Client-side helper the UI uses to send a message. All the heavy lifting
// (retrieval, prompt building, calling the model, parsing, resolving citations)
// happens on the server in /api/ask; the browser just sends the message, recent
// history and any locally-stored custom guides.
//
// The server decides for itself whether the message is a staff how-to question
// or an incoming patient request to route, and replies with a `kind` of either
// "answer" (intro/steps/message/tip) or "triage" (urgency/actions/redFlags/
// route/patientMessage). Both shapes carry source citations per item.
export async function askQuestion({ question, history = '', customGuides = [] }) {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history, customGuides }),
  });
  if (!res.ok) throw new Error('AI request failed (' + res.status + ')');
  const data = await res.json();
  if (!data || typeof data !== 'object') throw new Error('Bad AI response');

  const items = (arr) => Array.isArray(arr)
    ? arr.map((s) => ({ text: s && s.text ? s.text : '', cite: s && s.cite ? s.cite : null })).filter((s) => s.text)
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
    };
  }

  return {
    kind: 'answer',
    answerable: data.answerable !== false,
    intro: typeof data.intro === 'string' ? data.intro : '',
    steps: items(data.steps),
    message: typeof data.message === 'string' ? data.message : '',
    messageCite: data.messageCite || null,
    tip: typeof data.tip === 'string' ? data.tip : '',
    citations: Array.isArray(data.citations) ? data.citations : [],
  };
}
