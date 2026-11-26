'use client';
import { useApp } from '@/lib/app-context';
import { DifferenceFinderView } from '@/components/views-reports';

export default function Page() {
  const app = useApp();
  return <DifferenceFinderView ctx={app} />;
}
