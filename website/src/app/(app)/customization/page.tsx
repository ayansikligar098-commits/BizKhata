'use client';
import { useApp } from '@/lib/app-context';
import { CustomizationView } from '@/components/views-reports';

export default function Page() {
  const app = useApp();
  return <CustomizationView ctx={app} />;
}
