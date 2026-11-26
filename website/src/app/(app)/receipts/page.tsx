'use client';
import { useApp } from '@/lib/app-context';
import { ReceiptsView } from '@/components/views-receipts';

export default function Page() {
  const app = useApp();
  return <ReceiptsView ctx={app} />;
}
