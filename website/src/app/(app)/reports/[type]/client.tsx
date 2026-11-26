'use client';
import { useApp } from '@/lib/app-context';
import { ReportsView } from '@/components/views-reports';
import { reportTabFromType } from '@/lib/routes';

/** /reports/<type> — the report type opens the matching Reports tab. */
export default function ReportTypePageClient({ type }: { type: string }) {
  const app = useApp();
  return <ReportsView ctx={app} tab={reportTabFromType(type)} />;
}
