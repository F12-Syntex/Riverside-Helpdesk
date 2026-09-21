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
// Nothing is served from a store: every question is researched when it is
// asked, so a wrong answer can never be handed out a second time.
//
// `signal` ends the request and the read of its stream. Back hands one in: the
// answer being left is worked out by an agent that will keep running tools for
// another twenty seconds, and nobody is going to read it.
export async function askAgent({ question, history = '', customGuides = [], images = [], attachments = [], template = '', signal = null }, onEvent) {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: signal || undefined,
    // `attachments` are documents dropped onto the question and already read
    // into text by /api/attach — the reader's own file, sent up as context with
    // the question it belongs to and stored nowhere.
    //
    // `template` is set only by a slash command and says which card to render
    // instead of leaving it to be worked out. The server honours it only for a
    // template one of the commands claims.
    body: JSON.stringify({ question, history, customGuides, images, attachments, template }),
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
    // An abort mid-stream leaves the reader resolving normally in some
    // browsers, so check it here too rather than trusting read() to throw.
    if (signal && signal.aborted) { try { await reader.cancel(); } catch (e) {} throw new DOMException('Aborted', 'AbortError'); }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // the tail may be half an event
    for (const line of lines) handle(line);
  }
  handle(buffer);

  if (!answer) throw new Error('The assistant did not return an answer.');
  return answer;
}
