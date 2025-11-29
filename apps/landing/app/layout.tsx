import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Authlane - OAuth Made Simple',
  description: 'Unified OAuth infrastructure for your apps. Connect to 50+ services with a single API.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
