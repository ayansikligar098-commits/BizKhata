'use client';
import { useApp } from '@/lib/app-context';
import { AgentPaymentsView } from '@/components/views-profiles';

export default function Page() {
  const app = useApp();
  return <AgentPaymentsView ctx={app} />;
}
