'use client';
import { useApp } from '@/lib/app-context';
import { ExpensesView } from '@/components/views-people';

export default function Page() {
  const app = useApp();
  return <ExpensesView ctx={app} />;
}
