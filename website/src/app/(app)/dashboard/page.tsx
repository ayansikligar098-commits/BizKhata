'use client';
import { useApp } from '@/lib/app-context';
import { DashboardView } from '@/components/views-dashboard';

export default function Page() {
  const app = useApp();
  return <DashboardView ctx={app} />;
}
