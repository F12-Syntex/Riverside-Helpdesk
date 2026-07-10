// Client-side helper the UI uses to send a message. All the heavy lifting
// (retrieval, prompt building, calling the model, parsing, resolving citations)
// happens on the server in /api/ask; the browser just sends the message, recent
// history, any locally-stored custom guides and any attached images (as data
// URLs, already downscaled by the composer).
//
// The server decides for itself whether the message is a staff how-to question,
// an incoming patient request to route, or a pasted medical document to file,
// and replies with a `kind` of "answer" (intro/sections/message/tip — sections
// are markdown blocks, each flagged as document-backed with a citation or as
// clearly-marked AI judgement), "triage" (urgency/actions/redFlags/route/
// patientMessage, with the same per-item provenance) or "docfile" (a ready
// filing title plus its parts — no citations, it comes from the pasted
// document itself).
// The server already builds the exact "docfile" / "triage" / "answer" shape
// described above (see the three response branches in app/api/ask/route.js),
// so this just forwards it — no need to re-validate/re-coerce a shape the
// same codebase already guarantees.
export async function askQuestion({ question, history = '', customGuides = [], images = [] }) {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history, customGuides, images }),
  });
  if (!res.ok) throw new Error('AI request failed (' + res.status + ')');
  const data = await res.json();
  if (!data || typeof data !== 'object' || !data.kind) throw new Error('Bad AI response');
  return data;
}
