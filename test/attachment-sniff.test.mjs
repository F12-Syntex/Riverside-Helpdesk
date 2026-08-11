import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentKind, extractAttachment, sniffAttachment } from '../lib/attachments/extract.mjs';

// Real bytes, built here rather than committed as fixtures, so the test says
// what it is testing.
const zip = (parts) => {
  // A local file header per entry is enough: the entry NAMES are what is
  // sniffed, and they are stored uncompressed exactly as here.
  const chunks = [];
  for (const name of parts) {
    const n = Buffer.from(name);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(n.length, 26);
    chunks.push(head, n);
  }
  return Buffer.concat(chunks);
};

const PDF = Buffer.from('%PDF-1.4\n...');
const OLE = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(16)]);
const RTF = Buffer.from('{\\rtf1\\ansi hello}');
const DOCX = zip(['[Content_Types].xml', 'word/document.xml']);
const XLSX = zip(['[Content_Types].xml', 'xl/workbook.xml']);
const PPTX = zip(['[Content_Types].xml', 'ppt/presentation.xml']);
const HTML = Buffer.from('<!DOCTYPE html><html><body>hi</body></html>');
const TEXT = Buffer.from('just some words');

/* ------------------------------------------------------ what it really is */

test('every format is recognised from its first bytes', () => {
  assert.equal(sniffAttachment(PDF), 'pdf');
  assert.equal(sniffAttachment(OLE), 'doc');
  assert.equal(sniffAttachment(RTF), 'rtf');
  assert.equal(sniffAttachment(DOCX), 'docx');
  assert.equal(sniffAttachment(XLSX), 'xlsx');
  assert.equal(sniffAttachment(PPTX), 'pptx');
  assert.equal(sniffAttachment(HTML), 'html');
});

test('plain text announces nothing, and that is not a failure', () => {
  // Nothing to sniff means fall back to the name, which is right for text.
  assert.equal(sniffAttachment(TEXT), '');
  assert.equal(sniffAttachment(Buffer.alloc(0)), '');
  assert.equal(sniffAttachment(null), '');
});

/* ------------------------------- the name is a claim, the bytes are a fact */

test('a file read with the wrong parser is not called damaged', async () => {
  // THE BUG. A legacy .doc saved as .docx, an RTF that Word named .doc — all
  // common at a surgery, all previously read with the parser the NAME asked
  // for, all reported to the reader as "may be password-protected or damaged".
  // The file was fine every time.
  await assert.doesNotReject(() => extractAttachment({ buffer: RTF, name: 'letter.doc' }));
  await assert.doesNotReject(() => extractAttachment({ buffer: RTF, name: 'letter.docx' }));
  await assert.doesNotReject(() => extractAttachment({ buffer: HTML, name: 'letter.doc' }));
});

test('a file with no extension at all is still read', async () => {
  const out = await extractAttachment({ buffer: RTF, name: 'letter' });
  assert.equal(out.kind, 'rtf');
  assert.match(out.text, /hello/);
});

test('the extension still decides when the bytes say nothing', async () => {
  const out = await extractAttachment({ buffer: TEXT, name: 'note.txt' });
  assert.equal(out.kind, 'text');
  assert.equal(attachmentKind('note.md'), 'text');
});

/* ------------------------------------------- saying only what is known */

test('a spreadsheet is called a spreadsheet, not a broken document', async () => {
  await assert.rejects(
    () => extractAttachment({ buffer: XLSX, name: 'figures.xlsx' }),
    (e) => {
      assert.match(e.message, /spreadsheet/i);
      assert.doesNotMatch(e.message, /damaged|password/i);
      return true;
    },
  );
});

test('a PowerPoint is named too', async () => {
  await assert.rejects(
    () => extractAttachment({ buffer: PPTX, name: 'slides.pptx' }),
    /PowerPoint/i,
  );
});

test('an unreadable file is never accused of being damaged', async () => {
  // A zip of nothing recognisable. Something is wrong with it, but nobody here
  // has established what — so the message says what to DO, and does not blame
  // a file that may be perfectly good.
  await assert.rejects(
    () => extractAttachment({ buffer: zip(['random/thing.bin']), name: 'thing.zip' }),
    (e) => {
      assert.doesNotMatch(e.message, /damaged/i);
      return true;
    },
  );
});

test('an unsupported type still says which type', async () => {
  await assert.rejects(
    () => extractAttachment({ buffer: TEXT, name: 'book.epub' }),
    /\.epub/,
  );
});

test('the limits are unchanged', async () => {
  await assert.rejects(() => extractAttachment({ buffer: Buffer.alloc(0), name: 'x.txt' }), /is empty/);
  await assert.rejects(
    () => extractAttachment({ buffer: Buffer.alloc(9 * 1024 * 1024), name: 'x.txt' }),
    /larger than 8MB/,
  );
  await assert.rejects(
    () => extractAttachment({ buffer: PDF, name: 'photo.png' }),
    /attached directly/,
  );
});
