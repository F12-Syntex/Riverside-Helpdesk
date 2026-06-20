// Shared helper for rendering extracted plain text into a minimal HTML document
// that the in-app viewer can open. Used by the parsers that have no native HTML
// rendition of their own (RTF, legacy DOC).

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Turn blank-line-separated text into paragraphs, single newlines into <br>.
export function renderDocHtml(text) {
  const body = String(text)
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  return '<!doctype html><meta charset="utf-8"><body style="font-family:Hanken Grotesk,system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.6;">'
    + body + '</body>';
}
