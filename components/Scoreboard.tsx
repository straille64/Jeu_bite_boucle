'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { PlayerView } from '@/lib/types';

interface Props {
  players: PlayerView[];
  youId: string;
  /** affiche les points gagnés au round courant */
  showDelta?: boolean;
  compact?: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** Classement animé : les lignes se réordonnent en place (layout animation). */
export default function Scoreboard({ players, youId, showDelta, compact }: Props) {
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <AnimatePresence initial={false}>
        {players.map((p) => {
          const you = p.id === youId;
          return (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
                you
                  ? 'border-neon-violet/50 bg-neon-violet/10'
                  : 'border-white/10 bg-white/[0.035]'
              } ${!p.connected ? 'opacity-45' : ''}`}
            >
              <span className="w-7 shrink-0 text-center text-base font-black tabular-nums text-slate-400">
                {p.rank <= 3 ? MEDALS[p.rank - 1] : p.rank}
              </span>

              <span className="text-2xl leading-none">{p.avatar}</span>

              <span className="min-w-0 flex-1 truncate font-bold text-white">
                {p.name}
                {p.isHost ? <span className="ml-1.5 text-xs text-neon-amber">👑</span> : null}
                {!p.connected ? (
                  <span className="ml-1.5 text-xs font-semibold text-slate-500">déco…</span>
                ) : null}
              </span>

              {showDelta && p.roundDelta > 0 ? (
                <motion.span
                  key={`d-${p.roundDelta}`}
                  initial={{ opacity: 0, y: -8, scale: 1.3 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="rounded-full bg-neon-lime/15 px-2 py-0.5 text-sm font-black text-neon-lime"
                >
                  +{p.roundDelta}
                </motion.span>
              ) : null}

              <motion.span
                key={p.score}
                initial={{ scale: 1.25 }}
                animate={{ scale: 1 }}
                className="w-12 shrink-0 text-right text-lg font-black tabular-nums text-white"
              >
                {p.score}
              </motion.span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
