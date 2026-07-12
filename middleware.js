import { NextResponse } from 'next/server';
import { canUseKnowledgeAdmin } from './lib/knowledge-admin-access';

export function middleware(request) {
  if (canUseKnowledgeAdmin(request)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  }
  return new NextResponse('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export const config = {
  matcher: ['/knowledge/:path*', '/api/knowledge/:path*'],
};
