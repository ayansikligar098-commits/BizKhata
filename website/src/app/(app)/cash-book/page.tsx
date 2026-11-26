'use client';
import { useApp } from '@/lib/app-context';
import { CashBookView } from '@/components/views-books';

export default function Page() {
  const app = useApp();
  return <CashBookView ctx={app} />;
}
