import { NextResponse } from 'next/server';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

export function hostName(raw) {
  const first = String(raw || '').split(',')[0].trim();
  if (!first) return '';
  try { return new URL(`http://${first}`).hostname.replace(/^\[|\]$/g, '').toLowerCase(); }
  catch (e) { return ''; }
}

export function isLocalKnowledgeAdminHost(rawHost) {
  return process.env.NODE_ENV === 'development' && LOOPBACK.has(hostName(rawHost));
}

export function canUseKnowledgeAdminHeaders(headers) {
  const host = headers.get('host') || '';
  const forwarded = headers.get('x-forwarded-host') || '';
  return isLocalKnowledgeAdminHost(host)
    && (!forwarded || isLocalKnowledgeAdminHost(forwarded));
}

export function canUseKnowledgeAdmin(request) {
  return canUseKnowledgeAdminHeaders(request.headers);
}

export function denyNonLocalKnowledgeAdmin(request) {
  if (canUseKnowledgeAdmin(request)) return null;
  return NextResponse.json({ error: 'Not found.' }, {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
