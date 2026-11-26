'use client';
import { useApp } from '@/lib/app-context';
import { ReceiptGeneratorView } from '@/components/views-profiles';

export default function Page() {
  const app = useApp();
  return <ReceiptGeneratorView ctx={app} />;
}
