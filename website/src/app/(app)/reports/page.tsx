'use client';
import { useApp } from '@/lib/app-context';
import { ReportsView } from '@/components/views-reports';

export default function Page() {
  const app = useApp();
  return <ReportsView ctx={app} />;
}
