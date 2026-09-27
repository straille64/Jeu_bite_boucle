import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Caption Battle — le jeu de mèmes entre potes',
  description:
    'Uploadez vos médias, légendez ceux des autres, votez pour la caption la plus savoureuse. 3 à 10 joueurs, en temps réel.',
};

export const viewport: Viewport = {
  themeColor: '#07060d',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
