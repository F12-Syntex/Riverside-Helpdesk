// AI formatter for notebook pages: fully restructures a note into a rich
// reference document (heading hierarchy, lists, tables, bolded key facts,
// highlights and colour-coded warnings) while preserving every fact. The
// client shows the result as a diff the user must confirm — nothing is saved
// here.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_RETENTION = { data_collection: 'deny' };
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_HEADERS = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://riverside-practice.local',
  'X-Title': 'Riverside Practice Q&A',
});

const PROMPT = `You are the document designer for a GP practice's internal notebook.
Rewrite the note below as a beautifully structured, easy-to-scan reference document —
the full treatment a careful human editor would give it, not just a tidy-up.

Structure — apply all of these wherever they fit:
- Organise the content under a clear heading hierarchy: ## for each main topic, ### for sub-topics. Move sentences into the right section when the original jumps around.
- Convert prose enumerations into bullet lists and step-by-step instructions into numbered lists.
- Use markdown tables (| Col | Col | with a |---| separator row) for anything tabular: contact numbers, opening hours, if/then rules, options and their outcomes.
- Use > blockquotes for tips, asides and "good to know" notes.
- Bold (**…**) the key facts a reader scans for: names, phone numbers, times, deadlines, quantities, form/document names.
- <mark>Highlight</mark> safety-critical warnings and must-not-miss rules.
- Colour-code emphasis where it earns its place: <span style="color:#d5281b">red for never-do / emergency actions</span>, <span style="color:#007f3b">green for always-do / confirmations</span>, <span style="color:#005eb8">blue for key informational callouts</span>. Also available: <u>underline</u> and <kbd>keyboard keys</kbd>. No other HTML tags or attributes.
- Fix spelling, punctuation and grammar throughout.

Content rules — never break these:
- Keep EVERY fact. Do not invent, drop, merge away or summarise away any information.
- The note may contain inline images, written as ![alt](url) on their own line. Keep every image, character-for-character (never alter or shorten the URL), and place each one where it belongs in the new structure — directly after the step, section or fact it illustrates. Never invent an image.
- You may tighten and clarify wording, but medical/procedural meaning, names, phone numbers, doses and times must stay exactly as written.
- Do not add a # title — the page already has one. Start at ##.
- Output ONLY the reformatted note text. No preamble, no explanation, no code fences.

NOTE:
`;

export async function POST(request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_AI_MODEL;
  if (!apiKey || !model) {
    return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY or OPENROUTER_AI_MODEL.' }, { status: 500 });
  }

  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const text = String(body?.text || '');
  if (!text.trim()) return NextResponse.json({ error: 'Nothing to format.' }, { status: 400 });
  if (text.length > 60000) return NextResponse.json({ error: 'Note is too long to format.' }, { status: 400 });

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: OPENROUTER_HEADERS(apiKey),
      // Only providers that do not retain prompt data (same policy as /api/ask).
      body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'user', content: PROMPT + text }], provider: NO_RETENTION }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json({ error: `OpenRouter error (${res.status}).`, detail: detail.slice(0, 500) }, { status: 502 });
    }
    const data = await res.json();
    let formatted = data?.choices?.[0]?.message?.content || '';
    // Strip an accidental fence despite the instructions.
    formatted = formatted.replace(/^\s*```(?:markdown|md)?\n([\s\S]*?)\n```\s*$/, '$1').trim();
    if (!formatted) return NextResponse.json({ error: 'No content returned by the model.' }, { status: 502 });
    return NextResponse.json({ formatted });
  } catch (e) {
    return NextResponse.json({ error: 'Could not reach OpenRouter.', detail: String(e).slice(0, 300) }, { status: 502 });
  }
}
