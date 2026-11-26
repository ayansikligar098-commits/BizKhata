'use client';
import { useApp } from '@/lib/app-context';
import { KhataView } from '@/components/views-services';

export default function Page() {
  const app = useApp();
  return <KhataView ctx={app} />;
}
