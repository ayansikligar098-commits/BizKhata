'use client';
import { useApp } from '@/lib/app-context';
import { ServicesView } from '@/components/views-services';

export default function Page() {
  const app = useApp();
  return <ServicesView ctx={app} />;
}
