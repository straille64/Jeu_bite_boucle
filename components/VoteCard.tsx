'use client';

import { motion } from 'framer-motion';
import { EMOJIS } from '@/lib/types';

interface Props {
  text: string;
  isYours: boolean;
  stars: number;
  onRate: (stars: number) => void;
  onReact: (emoji: string) => void;
  locked?: boolean;
  index: number;
}

/** Une caption pendant la phase de vote : notation 1–5 étoiles + réactions. */
export default function VoteCard({
  text,
  isYours,
  stars,
  onRate,
  onReact,
  locked,
  index,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`card p-4 ${
        isYours ? 'border-neon-violet/40 bg-neon-violet/10' : stars > 0 ? 'border-neon-cyan/40' : ''
      }`}
    >
      <p className="text-lg font-bold leading-snug text-white">“{text}”</p>

      {isYours ? (
        <p className="mt-3 text-sm font-semibold text-neon-violet">
          🙋 Ta caption — impossible de voter pour toi-même.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <motion.button
                key={n}
                whileTap={{ scale: 0.8 }}
                disabled={locked}
                onClick={() => onRate(n === stars ? 0 : n)}
                aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                className={`grid h-10 w-10 place-items-center rounded-xl text-xl transition ${
                  n <= stars
                    ? 'bg-neon-amber/20 text-neon-amber'
                    : 'text-slate-600 hover:bg-white/5 hover:text-slate-400'
                }`}
              >
                ★
              </motion.button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {EMOJIS.slice(0, 4).map((e) => (
              <motion.button
                key={e}
                whileTap={{ scale: 1.5 }}
                onClick={() => onReact(e)}
                className="grid h-9 w-9 place-items-center rounded-lg text-lg hover:bg-white/10"
              >
                {e}
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
