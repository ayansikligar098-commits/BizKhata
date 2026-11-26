'use client';
import { useApp } from '@/lib/app-context';
import { DailyDhandhaView } from '@/components/views-dashboard';

export default function Page() {
  const app = useApp();
  return <DailyDhandhaView ctx={app} />;
}
