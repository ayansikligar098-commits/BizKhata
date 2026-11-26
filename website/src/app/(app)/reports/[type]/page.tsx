import { REPORT_TYPES } from '@/lib/routes';
import ReportTypePageClient from './client';

/** /reports/income | /reports/expenses | /reports/profit | /reports/service-wise */
export function generateStaticParams() {
  return REPORT_TYPES.map((type) => ({ type }));
}

export default function ReportTypePage({ params }: { params: { type: string } }) {
  return <ReportTypePageClient type={params.type} />;
}
