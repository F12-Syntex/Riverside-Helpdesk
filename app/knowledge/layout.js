import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { canUseKnowledgeAdminHeaders } from '@/lib/knowledge-admin-access';

export const dynamic = 'force-dynamic';

export default function KnowledgeAdminLayout({ children }) {
  const h = headers();
  if (!canUseKnowledgeAdminHeaders(h)) notFound();
  return children;
}
