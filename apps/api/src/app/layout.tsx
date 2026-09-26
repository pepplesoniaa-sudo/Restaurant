import type { Metadata } from 'next';
import './design-tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Restaurant — Food market',
  description: 'Order from restaurants near you.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
