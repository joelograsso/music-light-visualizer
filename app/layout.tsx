import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../src/style.css';
import '../src/ui/hud.css';

export const metadata: Metadata = {
  title: 'Music Light Visualizer',
  description: 'A reactive music light visualizer for mic, file, display, and Spotify context.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
