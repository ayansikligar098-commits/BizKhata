'use client';
import { useApp } from '@/lib/app-context';
import { AuditLogView } from '@/components/views-reports';

export default function Page() {
  const app = useApp();
  return <AuditLogView ctx={app} />;
}
