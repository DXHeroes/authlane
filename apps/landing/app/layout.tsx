import type { Metadata } from 'next';
import { IBM_Plex_Mono, Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://authlane.io'),
  title: 'Authlane — Connected tools. Your traffic.',
  description:
    'A control plane for user-scoped connections and AI tools. Provider traffic stays on your infrastructure.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Authlane',
    description: 'The control plane for connected tools.',
    url: 'https://authlane.io',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} scheme-only-dark antialiased`}>
      <body>{children}</body>
    </html>
  );
}
