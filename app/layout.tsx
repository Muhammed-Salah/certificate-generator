import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Certify — Certificate Generator',
  description: 'Generate beautiful certificates with ease',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
