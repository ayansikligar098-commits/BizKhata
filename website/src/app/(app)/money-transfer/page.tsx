'use client';
import { useApp } from '@/lib/app-context';
import { MoneyTransferView } from '@/components/views-mt';

export default function Page() {
  const app = useApp();
  return <MoneyTransferView ctx={app} />;
}
