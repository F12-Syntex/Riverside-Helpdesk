// Client-side helper the UI uses to ask a question. All the heavy lifting
// (retrieval, prompt building, calling the model, parsing) now happens on the
// server in /api/ask; the browser just sends the question, recent history and
// any locally-stored custom guides, and receives a structured answer.
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
    guideId: typeof data.guideId === 'string' ? data.guideId : '',
    intro: typeof data.intro === 'string' ? data.intro : '',
    steps: Array.isArray(data.steps) ? data.steps : [],
    message: typeof data.message === 'string' ? data.message : '',
    tip: typeof data.tip === 'string' ? data.tip : '',
    images: Array.isArray(data.images) ? data.images : [],
    citations: Array.isArray(data.citations) ? data.citations : [],
  };
}
