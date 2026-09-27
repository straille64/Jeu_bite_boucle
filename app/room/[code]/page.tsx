'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '@/lib/useGame';
import Lobby from '@/components/Lobby';
import GameScreen from '@/components/GameScreen';
import Scoreboard from '@/components/Scoreboard';

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = String(params.code || '').toUpperCase();
  const router = useRouter();
  const { socket, state, connected, error, setError, bursts, emit } = useGame();
  const [fatal, setFatal] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const joinTried = useRef(false);

  /* Resynchronisation au montage.
     Deux cas couverts par le même appel :
     - navigation depuis l'accueil : le socket est déjà dans la room, le
       serveur renvoie simplement l'état (sinon on n'en recevrait aucun
       tant que rien ne bouge) ;
     - rechargement de page : le socket est neuf, le serveur nous fait
       entrer avec le pseudo mémorisé.                                    */
  useEffect(() => {
    if (joinTried.current) return;
    joinTried.current = true;

    const name = localStorage.getItem('cb:name') || '';
    const send = () =>
      socket.emit('room:sync', { code, name }, (res: { error?: string }) => {
        if (res?.error) setFatal(res.error);
      });

    if (!name) {
      router.replace(`/?code=${code}`);
      return;
    }
    if (socket.connected) send();
    socket.on('connect', send);
    return () => {
      socket.off('connect', send);
    };
  }, [socket, code, router]);

  /* Chaque nouvelle phase (ou nouveau média) repart du haut de l'écran :
     sur mobile on resterait sinon scrollé au milieu de la vue précédente. */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [state?.phase, state?.media?.id]);

  function leave() {
    socket.emit('room:leave');
    router.push('/');
  }

  if (fatal) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="text-6xl">🚪</span>
        <h1 className="text-2xl font-black text-white">Impossible de rejoindre</h1>
        <p className="text-slate-400">{fatal}</p>
        <button onClick={() => router.push('/')} className="btn-primary w-full">
          ← Retour à l&apos;accueil
        </button>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <div className="text-center">
          <motion.span
            animate={{ rotate: [0, 12, -12, 0] }}
            transition={{ repeat: Infinity, duration: 1.6 }}
            className="inline-block text-5xl"
          >
            🎤
          </motion.span>
          <p className="mt-4 font-bold text-slate-300">Connexion à la room {code}…</p>
        </div>
      </main>
    );
  }

  const inGame = state.phase !== 'lobby';

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4 sm:px-6">
      {/* En-tête compact et collant : code, round, classement */}
      <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-3 border-b border-white/10 bg-ink-900/80 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <button onClick={() => router.push('/')} className="text-xl leading-none" aria-label="Accueil">
          🎤
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black tracking-[0.2em] text-white">{state.code}</p>
          <p className="text-[11px] font-semibold text-slate-500">
            {inGame
              ? `Round ${state.round}/${state.totalRounds}${
                  state.mediaCount > 0 && state.mediaIndex >= 0
                    ? ` · média ${state.mediaIndex + 1}/${state.mediaCount}`
                    : ''
                }`
              : `${state.players.filter((p) => p.connected).length} joueur(s) en attente`}
          </p>
        </div>

        {!connected ? (
          <span className="chip border-neon-pink/40 text-neon-pink">hors ligne</span>
        ) : null}

        {inGame ? (
          <button onClick={() => setDrawer((d) => !d)} className="btn-ghost px-3 py-2 text-sm">
            🏅 {state.players.find((p) => p.id === state.youId)?.score ?? 0}
          </button>
        ) : null}
      </header>

      <AnimatePresence>
        {drawer ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="card p-4">
              <p className="label mb-2.5">Classement en direct</p>
              <Scoreboard players={state.players} youId={state.youId} showDelta compact />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {state.phase === 'lobby' ? (
        <Lobby state={state} emit={emit} onLeave={leave} />
      ) : (
        <GameScreen
          state={state}
          emit={emit}
          bursts={bursts}
          react={(emoji, captionId) => socket.emit('reaction:send', { emoji, captionId })}
        />
      )}

      {/* Toast d'erreur non bloquant */}
      <AnimatePresence>
        {error ? (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed inset-x-4 bottom-5 z-50 mx-auto max-w-md"
          >
            <button
              onClick={() => setError(null)}
              className="w-full rounded-2xl border border-neon-pink/50 bg-ink-800/95 px-4 py-3.5
                         text-left text-sm font-semibold text-neon-pink shadow-glow-pink backdrop-blur-xl"
            >
              ⚠️ {error}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
