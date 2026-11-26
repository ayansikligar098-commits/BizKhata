'use client';
import { useApp } from '@/lib/app-context';
import { MaintenanceView } from '@/components/views-people';

export default function Page() {
  const app = useApp();
  return <MaintenanceView ctx={app} />;
}
