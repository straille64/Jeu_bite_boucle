'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { EMOJIS } from '@/lib/types';
import type { Burst } from '@/lib/useGame';

interface Props {
  onReact: (emoji: string) => void;
  bursts: Burst[];
}

/** Barre d'emojis + gerbe d'emojis flottants partagée par toute la room. */
export default function ReactionBar({ onReact, bursts }: Props) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 bottom-full h-36 overflow-hidden">
        <AnimatePresence>
          {bursts.map((b) => (
            <motion.span
              key={b.id}
              initial={{ opacity: 0, y: 40, scale: 0.5, x: `${10 + ((b.id * 37) % 80)}%` }}
              animate={{ opacity: [0, 1, 1, 0], y: -110, scale: [0.5, 1.5, 1.2, 1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.7, ease: 'easeOut' }}
              className="absolute bottom-0 text-3xl"
            >
              {b.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      <div className="card flex items-center justify-between gap-1 px-2 py-2">
        {EMOJIS.map((e) => (
          <motion.button
            key={e}
            whileTap={{ scale: 1.6 }}
            onClick={() => onReact(e)}
            className="grid h-11 flex-1 place-items-center rounded-xl text-2xl transition hover:bg-white/10"
          >
            {e}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
