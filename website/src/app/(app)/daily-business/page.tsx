'use client';
import { useApp } from '@/lib/app-context';
import { DailyBusinessView } from '@/components/views-daily';

export default function Page() {
  const app = useApp();
  return <DailyBusinessView ctx={app} />;
}
