'use client';
import { useApp } from '@/lib/app-context';
import { UpiBookView } from '@/components/views-books';

export default function Page() {
  const app = useApp();
  return <UpiBookView ctx={app} />;
}
