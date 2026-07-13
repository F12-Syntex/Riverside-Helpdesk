import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SOURCES_DIR } from '../rag/lib/config.mjs';
import { resolveSourceDocIds } from '../rag/lib/sources.mjs';

test('colliding source names preserve the manifest-backed legacy id', () => {
  const doc = path.join(SOURCES_DIR, 'data-protection-policy.doc');
  const docx = path.join(SOURCES_DIR, 'Data Protection Policy.docx');
  const ids = resolveSourceDocIds([docx, doc], {
    documents: {
      'data-protection-policy': { path: 'rag/sources/data-protection-policy.doc' },
    },
  });

  assert.equal(ids.get(doc), 'data-protection-policy');
  assert.equal(ids.get(docx), 'data-protection-policy-docx');
});

test('source collision ids remain stable regardless of traversal order', () => {
  const doc = path.join(SOURCES_DIR, 'Policy.doc');
  const docx = path.join(SOURCES_DIR, 'Policy.docx');
  const manifest = { documents: { policy: { path: 'rag/sources/Policy.doc' } } };
  const forward = resolveSourceDocIds([doc, docx], manifest);
  const reverse = resolveSourceDocIds([docx, doc], manifest);

  assert.equal(forward.get(doc), reverse.get(doc));
  assert.equal(forward.get(docx), reverse.get(docx));
});
