// Writes newly ingested documents into the canonical Postgres knowledge store.
// The committed file index remains a portable build artefact during migration,
// but live retrieval uses these indexed rows.
import { neon } from '@neondatabase/serverless';
import { config } from './config.mjs';

let ready = null;

async function connection() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const sql = neon(url);
  if (!ready) ready = (async () => {
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_entries (
        id text PRIMARY KEY, kind text NOT NULL, title text NOT NULL, content text NOT NULL DEFAULT '',
        data jsonb NOT NULL DEFAULT '{}'::jsonb, source_ref text NOT NULL DEFAULT '', authority integer NOT NULL DEFAULT 50,
        status text NOT NULL DEFAULT 'active', content_hash text NOT NULL DEFAULT '', claims_stale boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_passages (
        id text PRIMARY KEY, entry_id text NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
        ordinal integer NOT NULL DEFAULT 0, heading text NOT NULL DEFAULT '', content text NOT NULL,
        embedding vector(1536), location jsonb NOT NULL DEFAULT '{}'::jsonb,
        search_doc tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading,'') || ' ' || coalesce(content,''))) STORED,
        UNIQUE(entry_id, ordinal)
      )`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_passages_search_idx ON knowledge_passages USING gin(search_doc)`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_passages_embedding_idx ON knowledge_passages USING hnsw (embedding vector_cosine_ops)`;
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_claims (
        id bigserial PRIMARY KEY, entry_id text NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
        passage_id text REFERENCES knowledge_passages(id) ON DELETE CASCADE, subject text NOT NULL, predicate text NOT NULL,
        value text NOT NULL, normalized_key text NOT NULL, quote text NOT NULL DEFAULT '', confidence real NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_claims_key_idx ON knowledge_claims(normalized_key)`;
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_conflicts (
        id bigserial PRIMARY KEY, normalized_key text NOT NULL,
        claim_a bigint NOT NULL REFERENCES knowledge_claims(id) ON DELETE CASCADE,
        claim_b bigint NOT NULL REFERENCES knowledge_claims(id) ON DELETE CASCADE,
        reason text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'open', resolution text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, UNIQUE(claim_a, claim_b)
      )`;
  })();
  await ready;
  return sql;
}

function clean(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}

function parseClaims(raw) {
  const text = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  if (a < 0 || b < a) return [];
  try { const out = JSON.parse(text.slice(a, b + 1)); return Array.isArray(out) ? out.slice(0, 40) : []; }
  catch (e) { return []; }
}

async function claimsFor(title, content) {
  const cfg = config();
  if (!cfg.apiKey || !cfg.analysisModel) return [];
  const prompt = `Extract explicit operational claims from this NHS GP practice document as a JSON array only.
Each item: {"subject":"stable subject","predicate":"stable property/rule","value":"asserted value","quote":"exact source quote","confidence":0.0}.
Make subject and predicate reusable across documents. Include contact details, times, deadlines, routing rules, eligibility, required actions and prohibitions. Never infer. Maximum 40.
Title: ${title}\nText:\n${content.slice(0, 30000)}`;
  try {
    const res = await fetch(cfg.base + '/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': cfg.referer, 'X-Title': cfg.title }, body: JSON.stringify({ model: cfg.analysisModel, temperature: 0, messages: [{ role: 'user', content: prompt }], provider: cfg.noRetentionProvider }) });
    if (!res.ok) return [];
    const data = await res.json(); return parseClaims(data?.choices?.[0]?.message?.content);
  } catch (e) { return []; }
}

export async function upsertUnifiedDocument({ docId, title, sourceRef, summary, tags, records, vectors }) {
  const sql = await connection();
  if (!sql) return false;
  const id = `document:${docId}`;
  const content = records.map((r) => r.text).join('\n\n');
  await sql`
    INSERT INTO knowledge_entries(id,kind,title,content,data,source_ref,authority,status,content_hash,claims_stale,updated_at)
    VALUES(${id},'document',${title},${content},${JSON.stringify({ summary, tags })}::jsonb,${sourceRef},70,'active','',true,now())
    ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,content=EXCLUDED.content,data=EXCLUDED.data,
      source_ref=EXCLUDED.source_ref,status='active',claims_stale=true,updated_at=now()`;
  await sql`DELETE FROM knowledge_passages WHERE entry_id=${id}`;
  for (let i = 0; i < records.length; i++) {
    const r = records[i], vec = Array.isArray(vectors[i]) && vectors[i].length === 1536 ? '[' + vectors[i].join(',') + ']' : null;
    const location = { ...(r.view || {}), images: r.images || [], source: r.source || null };
    if (vec) await sql`INSERT INTO knowledge_passages(id,entry_id,ordinal,heading,content,embedding,location) VALUES(${`${id}:p${i}`},${id},${i},${r.section || ''},${r.text},${vec}::vector,${JSON.stringify(location)}::jsonb)`;
    else await sql`INSERT INTO knowledge_passages(id,entry_id,ordinal,heading,content,location) VALUES(${`${id}:p${i}`},${id},${i},${r.section || ''},${r.text},${JSON.stringify(location)}::jsonb)`;
  }
  const claims = await claimsFor(title, content);
  await sql`DELETE FROM knowledge_claims WHERE entry_id=${id}`;
  for (const c of claims) {
    const subject = String(c.subject || '').trim(), predicate = String(c.predicate || '').trim(), value = String(c.value || '').trim();
    if (!subject || !predicate || !value) continue;
    const key = clean(subject) + '|' + clean(predicate);
    await sql`INSERT INTO knowledge_claims(entry_id,subject,predicate,value,normalized_key,quote,confidence) VALUES(${id},${subject},${predicate},${value},${key},${String(c.quote || '')},${Number(c.confidence) || .8})`;
  }
  await sql`UPDATE knowledge_entries SET claims_stale=false WHERE id=${id}`;
  await sql`
    INSERT INTO knowledge_conflicts(normalized_key,claim_a,claim_b,reason)
    SELECT a.normalized_key,least(a.id,b.id),greatest(a.id,b.id),'Two active sources make different claims about the same subject.'
    FROM knowledge_claims a JOIN knowledge_claims b ON b.normalized_key=a.normalized_key AND b.id>a.id
    JOIN knowledge_entries ea ON ea.id=a.entry_id AND ea.status='active'
    JOIN knowledge_entries eb ON eb.id=b.entry_id AND eb.status='active'
    WHERE a.entry_id<>b.entry_id AND lower(trim(a.value))<>lower(trim(b.value))
      AND lower(trim(a.predicate)) NOT IN ('will ensure','must have processes in place to','must','should','is','has','procedure step','routing procedure step')
    ON CONFLICT(claim_a,claim_b) DO NOTHING`;
  return true;
}
