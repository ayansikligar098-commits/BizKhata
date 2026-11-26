import React from 'react';
import { SERVICE_SLUGS } from '@/lib/routes';
import ServicePageClient from './client';

/** One static HTML file per service at build time (static export). */
export function generateStaticParams() {
  return Object.values(SERVICE_SLUGS).map((service) => ({ service }));
}

export default function ServicePage({ params }: { params: { service: string } }) {
  return (
    <React.Suspense fallback={null}>
      <ServicePageClient slug={params.service} />
    </React.Suspense>
  );
}
