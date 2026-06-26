// Client-side helper the Medication Check UI uses to look one medicine up. All
// the work (cache lookup, web-search-grounded model call, citation verification,
// image fetch and caching) happens on the server in /api/medication; the browser
// just sends a medicine name and an optional question and receives a grounded,
// source-cited result. The page fans this out — one call per medicine — so cached
// medicines come back instantly and a slow one never blocks the others.

// Turn a pasted blob of text (a list with commas/new lines, a prescription
// snippet, or prose) into a list of medicine names, using the AI extractor on
// the server. Returns an array of names, or null when the extractor is
// unavailable/failed so the caller can fall back to a local parser.
export async function extractMedicines(text) {
  try {
    const res = await fetch('/api/medication/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null; // 503/502/4xx — caller falls back to local parsing
    const data = await res.json();
    if (!data || !Array.isArray(data.medicines)) return null;
    return data.medicines.map((m) => String(m || '').trim()).filter(Boolean);
  } catch (e) {
    return null;
  }
}

export async function checkMedication({ name, query = '' }) {
  const res = await fetch('/api/medication', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, query }),
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!data || typeof data !== 'object') throw new Error('Bad response from the medicines service.');

  // A 4xx/5xx with a known shape ({status} or {error}) is surfaced as a normal
  // result so the card can show the message; only an unexpected body throws.
  if (!res.ok && !data.status && !data.error) throw new Error('Medicines request failed (' + res.status + ')');

  if (data.status === 'not_found') {
    return { status: 'not_found', name: data.name || name, message: data.message || 'This medicine could not be found.' };
  }
  if (data.status !== 'ok') {
    return { status: 'error', name, message: data.message || data.error || 'Something went wrong. Please try again.' };
  }

  // A point is only kept when it carries a real source — mirrors the server's
  // keepSourced, the last line of defence on the "every point sourced" guarantee.
  const cleanPoints = (pts) => (Array.isArray(pts) ? pts : []).map((p) => ({
    text: p && p.text ? p.text : '',
    cite: p && p.cite && p.cite.url ? { url: p.cite.url, title: p.cite.title || p.cite.url, quote: p.cite.quote || '' } : null,
  })).filter((p) => p.text && p.cite && p.cite.url);

  // A grounded text field ({ text, cite }) is kept only when its source verified.
  const cleanField = (f) => (f && f.text && f.cite && f.cite.url
    ? { text: f.text, cite: { url: f.cite.url, title: f.cite.title || f.cite.url, quote: f.cite.quote || '' } }
    : null);

  const cleanRefs = (refs) => (Array.isArray(refs) ? refs : [])
    .filter((r) => r && r.url).map((r) => ({ url: r.url, title: r.title || r.url }));

  const qa = data.queryAnswer;
  return {
    status: 'ok',
    slug: data.slug || '',
    name: data.name || name,
    // The term the staff member typed when it was auto-corrected to this
    // medicine (empty when no correction was made).
    correctedFrom: data.correctedFrom || '',
    alsoKnownAs: cleanField(data.alsoKnownAs),
    summary: cleanField(data.summary),
    image: data.image && data.image.url ? data.image : null,
    sections: (Array.isArray(data.sections) ? data.sections : []).map((sec) => ({
      key: sec.key || 'about',
      tier: sec.tier === 'clinical' ? 'clinical' : 'plain',
      title: sec.title || '',
      points: cleanPoints(sec.points),
    })).filter((sec) => sec.points.length),
    references: cleanRefs(data.references),
    query: data.query || query || '',
    queryAnswer: qa
      ? {
          question: qa.question || query,
          emergency: !!qa.emergency,
          safetyMessage: qa.safetyMessage || '',
          unanswered: !!qa.unanswered,
          points: cleanPoints(qa.points),
          references: cleanRefs(qa.references),
        }
      : null,
    fromCache: !!data.fromCache,
    retrievedAt: data.retrievedAt || null,
  };
}
