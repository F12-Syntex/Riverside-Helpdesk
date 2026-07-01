// Client-side helper the UI uses to ask a question. All the heavy lifting
// (retrieval, prompt building, calling the model, parsing, resolving citations)
// happens on the server in /api/ask; the browser just sends the question, recent
// history and any locally-stored custom guides, and receives a grounded answer
// whose steps each carry the source they came from.
export async function askQuestion({ question, history = '', customGuides = [] }) {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history, customGuides }),
  });
  if (!res.ok) throw new Error('AI request failed (' + res.status + ')');
  const data = await res.json();
  if (!data || typeof data !== 'object') throw new Error('Bad AI response');
  return {
    answerable: data.answerable !== false,
    intro: typeof data.intro === 'string' ? data.intro : '',
    steps: Array.isArray(data.steps)
      ? data.steps.map((s) => ({ text: s && s.text ? s.text : '', cite: s && s.cite ? s.cite : null }))
      : [],
    message: typeof data.message === 'string' ? data.message : '',
    messageCite: data.messageCite || null,
    tip: typeof data.tip === 'string' ? data.tip : '',
    citations: Array.isArray(data.citations) ? data.citations : [],
  };
}

// Triage a pasted patient request (for example an Accurx online consultation).
// Hits the same /api/ask endpoint in triage mode and returns grounded action
// notes: an urgency band, actions to take, safety-net red flags, a suggested
// route and an optional draft patient reply — each item carrying its source.
export async function triageRequest({ submission, customGuides = [] }) {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'triage', submission, customGuides }),
  });
  if (!res.ok) throw new Error('Triage request failed (' + res.status + ')');
  const data = await res.json();
  if (!data || typeof data !== 'object') throw new Error('Bad triage response');
  const items = (arr) => Array.isArray(arr)
    ? arr.map((s) => ({ text: s && s.text ? s.text : '', cite: s && s.cite ? s.cite : null })).filter((s) => s.text)
    : [];
  const BANDS = ['emergency', 'urgent', 'routine', 'self-care', 'unclear'];
  return {
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
