'use client';

import { motion } from 'framer-motion';
import Timer from './Timer';

interface Props {
  title: string;
  subtitle?: string;
  left: number | null;
  total: number;
  progress?: { current: number; of: number; label: string };
  children: React.ReactNode;
  aside?: React.ReactNode;
}

/** Cadre commun à toutes les phases : titre, timer, progression, contenu. */
export default function PhaseShell({
  title,
  subtitle,
  left,
  total,
  progress,
  children,
  aside,
}: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.28 }}
      className="space-y-5"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
          {progress ? (
            <p className="mt-2 chip">
              {progress.label} {progress.current}/{progress.of}
            </p>
          ) : null}
        </div>
        <Timer left={left} total={total} />
      </header>

      {children}
      {aside}
    </motion.section>
  );
}
