'use client';
import { useApp } from '@/lib/app-context';
import { AgentProfileView } from '@/components/views-profiles';

/** /agents/<id> — one dedicated page per agent. */
export default function AgentProfilePageClient({ id }: { id: string }) {
  const app = useApp();
  return <AgentProfileView ctx={app} agentId={id} />;
}
