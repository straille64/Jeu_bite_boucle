'use client';

import { motion } from 'framer-motion';

interface Props {
  /** secondes restantes, null = pas de timer */
  left: number | null;
  /** durée totale de la phase, pour l'anneau de progression */
  total: number;
  label?: string;
}

/** Gros compte à rebours circulaire, lisible d'un coup d'œil sur mobile. */
export default function Timer({ left, total, label }: Props) {
  if (left == null) return null;

  const pct = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const urgent = left <= 10;
  const R = 26;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
          <circle cx="32" cy="32" r={R} className="fill-none stroke-white/10" strokeWidth="6" />
          <motion.circle
            cx="32"
            cy="32"
            r={R}
            className={`fill-none ${urgent ? 'stroke-neon-pink' : 'stroke-neon-cyan'}`}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            animate={{ strokeDashoffset: C * (1 - pct) }}
            transition={{ duration: 0.25, ease: 'linear' }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <motion.span
            key={left}
            initial={{ scale: urgent ? 1.35 : 1.1, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`text-xl font-black tabular-nums ${urgent ? 'text-neon-pink' : 'text-white'}`}
          >
            {left}
          </motion.span>
        </div>
      </div>
      {label ? <span className="label max-w-[8rem] leading-snug">{label}</span> : null}
    </div>
  );
}
