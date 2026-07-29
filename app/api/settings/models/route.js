// Every model OpenRouter currently serves, so the settings page can offer the
// real list rather than a hand-maintained one that goes stale the week after it
// is written.
//
// Fetched from OpenRouter's public catalogue and trimmed to what the dropdown
// shows: the id staff will search by, the readable name, how much context it
// holds, what it costs, and whether it can read an image — the ingester reads
// document images with this model, so a text-only choice is worth flagging
// before it is saved rather than after.
//
// Cached in the process for an hour. The catalogue changes a few times a week
// and this endpoint is hit every time the page opens.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATALOGUE_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_MS = 60 * 60 * 1000;
const noStore = { 'Cache-Control': 'no-store' };

let cache = { at: 0, models: [] };

// Prices arrive as a per-token string ("0.00000015"). Per million is the unit
// the OpenRouter pricing page uses and the only one anyone can compare at a
// glance.
function perMillion(price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1_000_000 * 1000) / 1000;
}

function trim(model) {
  const modalities = model?.architecture?.input_modalities || [];
  return {
    id: String(model?.id || ''),
    name: String(model?.name || model?.id || ''),
    contextLength: Number(model?.context_length) || 0,
    promptPerMillion: perMillion(model?.pricing?.prompt),
    completionPerMillion: perMillion(model?.pricing?.completion),
    // The assistant reads pasted images and the ingester reads document pages,
    // so this is the one capability the page warns about.
    vision: Array.isArray(modalities) ? modalities.includes('image') : false,
  };
}

export async function GET() {
  if (cache.models.length && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json({ models: cache.models, cached: true }, { headers: noStore });
  }

  try {
    const headers = { Accept: 'application/json' };
    // The catalogue is public; the key is sent only when there is one, so a
    // server without it still gets the list.
    if (process.env.OPENROUTER_API_KEY) headers.Authorization = 'Bearer ' + process.env.OPENROUTER_API_KEY;
    const res = await fetch(CATALOGUE_URL, { headers, cache: 'no-store' });
    if (!res.ok) throw new Error('OpenRouter returned ' + res.status);
    const data = await res.json();
    const models = (Array.isArray(data?.data) ? data.data : [])
      .map(trim)
      .filter((m) => m.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!models.length) throw new Error('OpenRouter returned no models');
    cache = { at: Date.now(), models };
    return NextResponse.json({ models, cached: false }, { headers: noStore });
  } catch (e) {
    // A stale list beats no list: the page can still be used to change the model
    // while OpenRouter is unreachable, and typing an id by hand still works.
    if (cache.models.length) {
      return NextResponse.json({ models: cache.models, cached: true, stale: true }, { headers: noStore });
    }
    return NextResponse.json(
      { models: [], error: 'Could not reach OpenRouter’s model list: ' + String(e.message || e) },
      { status: 502, headers: noStore },
    );
  }
}
