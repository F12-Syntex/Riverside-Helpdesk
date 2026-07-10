// Shared cosine similarity for embedding vectors — used by the knowledge-base
// retriever (rag/lib/store.mjs) and the Notebook's own semantic search
// (lib/notebook.js), which used to each carry an identical copy of this.
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}
