import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/lib/app-context';

export const metadata: Metadata = {
  title: 'BizKhata — Business Accounting & Management',
  description:
    'BizKhata is a free business accounting and management platform for CSC Centers and small businesses: cash/UPI books, Money Transfer, customer khata, agents, receipts, reports and more.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
