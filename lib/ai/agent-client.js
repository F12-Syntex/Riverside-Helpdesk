// Client half of the agent endpoint.
//
// /api/agent streams newline-delimited JSON events while it works, so the chat
// can show each tool as it runs instead of a spinner that says nothing for
// twenty seconds. Events arrive in this order:
//
//   { type: 'status',      text }                        a phase started
//   { type: 'tool-start',  id, tool, label, detail }     a tool is running
//   { type: 'tool-result', id, tool, summary, items }    what it found
//   { type: 'answer',      payload }                     the finished answer
//   { type: 'error',       error, detail }               nothing usable
//
// `onEvent` is called for every one of them; the finished payload is also the
// resolved value, so callers that only want the answer can ignore the callback.
//
// An answer already given to the same question comes back from the server's
// cache, as a single `answer` event carrying `payload.cache`. `refresh: true`
// says to ignore anything stored and research the question again — that is what
// Reload on a cached answer sends.
export async function askAgent({ question, history = '', customGuides = [], images = [], attachments = [], refresh = false }, onEvent) {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // `attachments` are documents dropped onto the question and already read
    // into text by /api/attach — the reader's own file, sent up as context with
    // the question it belongs to and stored nowhere.
    body: JSON.stringify({ question, history, customGuides, images, attachments, refresh }),
  });
  if (!res.ok || !res.body) {
    // A failure before the stream opens is a plain JSON error body.
    let message = 'AI request failed (' + res.status + ')';
    try {
      const data = await res.json();
      if (data && data.error) message = data.error;
    } catch (e) { /* keep the status-code message */ }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = null;

  const handle = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event;
    try { event = JSON.parse(trimmed); } catch (e) { return; } // a partial line is never valid JSON
    if (event.type === 'answer') answer = event.payload;
    if (event.type === 'error') throw new Error(event.error || 'The assistant could not complete this answer.');
    if (onEvent) onEvent(event);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // the tail may be half an event
    for (const line of lines) handle(line);
  }
  handle(buffer);

  if (!answer) throw new Error('The assistant did not return an answer.');
  return answer;
}
