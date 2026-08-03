// Reading a file dropped onto the Q&A.
//
// The browser cannot open a .docx or a PDF on its own, so a dropped document
// comes here to be turned into text and goes straight back to the page that
// dropped it. Nothing is written to disk, nothing is stored in the database and
// nothing is embedded: the text lives in the browser until the question it came
// with is asked, and is sent up with that question as context.
//
// That is deliberate. A document in the knowledge base is practice material —
// ingested, chunked, citable, and part of every future answer. A document
// dropped onto one question is the reader's own: a letter that arrived this
// morning, an email to shorten. Treating the second like the first would put a
// patient's letter into the practice's permanent material by accident.
//
// Images never come here. The model looks at those directly, so they take the
// path they already took (see QaApp's pendingImages).
import { NextResponse } from 'next/server';
import { extractAttachment, MAX_ATTACHMENT_BYTES } from '@/lib/attachments/extract.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A big PDF is read page by page, which takes a moment on a cold function.
export const maxDuration = 60;

export async function POST(request) {
  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return NextResponse.json({ error: 'That upload could not be read.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'No file was attached.' }, { status: 400 });
  }
  if (typeof file.size === 'number' && file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({
      error: `That file is larger than ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB.`,
    }, { status: 413 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await extractAttachment({ buffer, name: file.name, mime: file.type });
    return NextResponse.json(doc, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    // The message is written for the person who dropped the file — "I cannot
    // read .xlsx yet", "it is probably a scan" — so it is what they are shown.
    return NextResponse.json({ error: String(e.message || 'That file could not be read.').slice(0, 300) }, { status: 415 });
  }
}
