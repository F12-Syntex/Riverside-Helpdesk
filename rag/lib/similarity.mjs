// Shared cosine similarity for embedding vectors — used by the knowledge-base
// retriever (rag/lib/store.mjs) and the Notebook's own semantic search
// (lib/notebook.js), which used to each carry an identical copy of this.
export function cosine(a, b) {
  // Vectors of different lengths are not comparable — that only happens when the
  // embedding model changed after the index was built. Comparing the overlapping
  // prefix would return a meaningless partial-dimension score that looks like a
  // real match, so treat a dimension mismatch (or a missing vector) as no match.
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}
