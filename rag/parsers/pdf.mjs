// PDFs. Extracts the selectable text per page via pdfjs-dist (a pure-JS
// dependency — installed on demand). This is text extraction, not OCR. A
// scanned/image-only PDF has no selectable text; rendering those pages to images
// for the vision model is a future extension (see rag/README.md).
export const exts = ['.pdf'];

export async function parse(filePath) {
  let pdfjs;
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (e) {
    throw new Error('PDF support needs pdfjs-dist. Install it with:  npm i pdfjs-dist');
  }
  const fs = await import('node:fs');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const sections = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
    if (text) sections.push({ text, page: p, headingPath: [`Page ${p}`], section: `Page ${p}` });
  }
  if (!sections.length) {
    throw new Error('No selectable text in PDF — it may be scanned images. Export the pages as images and ingest those, or add a renderer (see rag/README.md).');
  }
  return sections;
}
