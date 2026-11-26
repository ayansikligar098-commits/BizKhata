'use client';
import { usePathname } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { AgentsView } from '@/components/views-people';
import { AgentProfileView } from '@/components/views-profiles';

/**
 * /agents — the list. A direct deep link /agents/<id> is served by the
 * Pages rewrite (see public/_redirects) through this same page, so the
 * pathname decides: an id segment renders that agent's profile.
 */
export default function Page() {
  const app = useApp();
  const pathname = usePathname();
  const m = pathname?.match(/^\/agents\/([^/]+)\/?$/);
  if (m) return <AgentProfileView ctx={app} agentId={m[1]} />;
  return <AgentsView ctx={app} />;
}
