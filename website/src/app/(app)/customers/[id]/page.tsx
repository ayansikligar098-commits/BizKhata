import CustomerProfilePageClient from './client';

/**
 * Customer ids are created by the user at runtime, so no static HTML can be
 * prerendered for a specific id. A direct deep link is served by the Pages
 * rewrite in public/_redirects through /customers (which renders the profile
 * from the pathname); this route handles client-side navigation.
 *
 * NOTE: Next's static export requires generateStaticParams to return at
 * least one route, so one harmless placeholder id is prerendered. Real
 * customer ids are `cus-…`, so `placeholder` can never be a real customer.
 */
export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export const dynamicParams = false;

export default function CustomerPage({ params }: { params: { id: string } }) {
  return <CustomerProfilePageClient id={params.id} />;
}
