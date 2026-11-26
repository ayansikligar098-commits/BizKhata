'use client';
import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { AgentsView } from '@/components/views-people';
import { AgentProfileView } from '@/components/views-profiles';

/**
 * /agents — the list. A profile opens as /agents?id=<id> (query param):
 * the site is a static export, so /agents/<id> has no prerendered page
 * and client navigation to it 404s. The query form always serves this
 * page's HTML and renders the profile. Old /agents/<id> deep links
 * (served through the Pages rewrite in public/_redirects) still work via
 * the pathname fallback below.
 */
function PageInner() {
  const app = useApp();
  const pathname = usePathname();
  const search = useSearchParams();
  const id = search?.get('id') || pathname?.match(/^\/agents\/([^/]+)\/?$/)?.[1] || null;
  if (id) return <AgentProfileView ctx={app} agentId={id} />;
  return <AgentsView ctx={app} />;
}

export default function Page() {
  return (
    <Suspense>
      <PageInner />
    </Suspense>
  );
}
