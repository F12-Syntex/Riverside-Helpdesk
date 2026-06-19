// Word documents. Uses mammoth (pure JS, installed on demand) to extract the
// raw text. Embedded images are not yet pulled out (future extension).
export const exts = ['.docx'];

export async function parse(filePath) {
  let mammoth;
  try {
    mammoth = await import('mammoth');
  } catch (e) {
    throw new Error('DOCX support needs mammoth. Install it with:  npm i mammoth');
  }
  const { value } = await mammoth.extractRawText({ path: filePath });
  return [{ text: value || '', headingPath: [] }];
}
