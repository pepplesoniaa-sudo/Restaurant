import type { Metadata } from 'next';
import './design-tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Restaurant — Food market',
  description: 'Order from restaurants near you.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Browser extensions such as Grammarly and QuillBot add attributes to <html> and <body> before
  // React loads. suppressHydrationWarning ignores attribute differences on these two elements
  // only; mismatches in their children are still reported.
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
