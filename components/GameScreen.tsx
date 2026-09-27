'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { RoomState } from '@/lib/types';
import { useCountdown, type Burst } from '@/lib/useGame';
import MediaPlayer from './MediaPlayer';
import MediaUploader from './MediaUploader';
import CaptionInput from './CaptionInput';
import VoteCard from './VoteCard';
import Scoreboard from './Scoreboard';
import PhaseShell from './PhaseShell';
import ReactionBar from './ReactionBar';

interface Props {
  state: RoomState;
  emit: (event: string, payload?: unknown) => Promise<unknown>;
  react: (emoji: string, captionId?: string | null) => void;
  bursts: Burst[];
}

export default function GameScreen({ state, emit, react, bursts }: Props) {
  const left = useCountdown(state.phaseEndsAt, state.serverNow);
  const isHost = state.youId === state.hostId;

  const total = useMemo(() => {
    switch (state.phase) {
      case 'upload':
        return 150;
      case 'caption':
        return state.settings.captionSeconds;
      case 'vote':
        return state.settings.voteSeconds;
      case 'reveal':
        return 11;
      case 'roundEnd':
        return 9;
      default:
        return 0;
    }
  }, [state.phase, state.settings]);

  const roundLabel = `Round ${state.round}/${state.totalRounds}`;

  return (
    <div className="space-y-5">
      <AnimatePresence mode="wait">
        {state.phase === 'upload' ? (
          <PhaseShell
            key="upload"
            title="📤 Balance ton média"
            subtitle="Photo, GIF, vidéo ou audio. Ce sont les autres qui devront le légender."
            left={left}
            total={total}
            progress={{
              label: 'Envoyés',
              current: state.upload?.submitted ?? 0,
              of: state.upload?.expected ?? 0,
            }}
            aside={<WaitingStrip state={state} mode="upload" />}
          >
            <p className="chip">{roundLabel}</p>
            <MediaUploader
              done={Boolean(state.upload?.youUploaded)}
              maxMb={state.maxUploadMb}
              onUploaded={(m) => emit('media:submit', m)}
            />
          </PhaseShell>
        ) : null}

        {state.phase === 'caption' && state.media ? (
          <CaptionPhase key={`caption-${state.media.id}`} state={state} emit={emit} left={left} total={total} />
        ) : null}

        {state.phase === 'vote' && state.media ? (
          <VotePhase
            key={`vote-${state.media.id}`}
            state={state}
            emit={emit}
            react={react}
            bursts={bursts}
            left={left}
            total={total}
          />
        ) : null}

        {state.phase === 'reveal' && state.media && state.reveal ? (
          <RevealPhase
            key={`reveal-${state.media.id}`}
            state={state}
            left={left}
            total={total}
            react={react}
            bursts={bursts}
          />
        ) : null}

        {state.phase === 'roundEnd' ? (
          <PhaseShell
            key="roundEnd"
            title={`🏁 Fin du ${roundLabel.toLowerCase()}`}
            subtitle="Classement mis à jour. Le round suivant arrive."
            left={left}
            total={total}
          >
            <div className="card p-4">
              <Scoreboard players={state.players} youId={state.youId} showDelta />
            </div>
          </PhaseShell>
        ) : null}

        {state.phase === 'gameEnd' ? (
          <GameEnd key="gameEnd" state={state} emit={emit} isHost={isHost} />
        ) : null}
      </AnimatePresence>

      {isHost && ['upload', 'caption', 'vote', 'reveal', 'roundEnd'].includes(state.phase) ? (
        <button onClick={() => emit('game:skip')} className="btn-ghost w-full text-sm">
          ⏭️ Passer cette phase (hôte)
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CaptionPhase({
  state,
  emit,
  left,
  total,
}: { state: RoomState; emit: Props['emit']; left: number | null; total: number }) {
  const [draft, setDraft] = useState(state.caption?.yourText || '');
  const media = state.media!;

  if (media.isYours) {
    return (
      <PhaseShell
        title="🙈 C’est ton média"
        subtitle="Tu ne peux pas le légender. Regarde les autres se casser la tête."
        left={left}
        total={total}
        progress={{
          label: 'Captions',
          current: state.caption?.submitted ?? 0,
          of: state.caption?.expected ?? 0,
        }}
        aside={<WaitingStrip state={state} mode="caption" />}
      >
        <MediaPlayer url={media.url} kind={media.kind} muted />
        <p className="card p-4 text-center text-sm text-slate-400">
          Ton média est passé en anonyme. Personne ne sait que c&apos;est toi… pour l&apos;instant.
        </p>
      </PhaseShell>
    );
  }

  return (
    <PhaseShell
      title="✍️ Légende ce truc"
      subtitle="Drôle, absurde, savoureux — au choix. Anonyme jusqu’à la révélation."
      left={left}
      total={total}
      progress={{
        label: 'Captions',
        current: state.caption?.submitted ?? 0,
        of: state.caption?.expected ?? 0,
      }}
      aside={<WaitingStrip state={state} mode="caption" />}
    >
      <MediaPlayer url={media.url} kind={media.kind} overlay={draft} muted />
      <CaptionInput
        max={state.maxCaption}
        initial={state.caption?.yourText || ''}
        submitted={Boolean(state.caption?.youSubmitted)}
        onChange={setDraft}
        onSubmit={(text) => emit('caption:submit', { text })}
      />
    </PhaseShell>
  );
}

/* ------------------------------------------------------------------ */

function VotePhase({
  state,
  emit,
  react,
  bursts,
  left,
  total,
}: {
  state: RoomState;
  emit: Props['emit'];
  react: Props['react'];
  bursts: Burst[];
  left: number | null;
  total: number;
}) {
  const media = state.media!;
  const [ballot, setBallot] = useState<Record<string, number>>(state.vote?.yourBallot || {});
  const votable = (state.vote?.captions || []).filter((c) => !c.isYours);
  const rated = Object.values(ballot).filter((v) => v > 0).length;
  const sent = Boolean(state.vote?.youVoted);

  // Si le serveur a déjà un bulletin (refresh), on le reprend.
  useEffect(() => {
    if (state.vote?.yourBallot) setBallot(state.vote.yourBallot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.id]);

  function rate(id: string, stars: number) {
    setBallot((b) => {
      const next = { ...b };
      if (stars <= 0) delete next[id];
      else next[id] = stars;
      return next;
    });
  }

  return (
    <PhaseShell
      title="⭐ Vote pour la meilleure"
      subtitle="1 à 5 étoiles par caption. Interdit de voter pour la tienne."
      left={left}
      total={total}
      progress={{
        label: 'Votes',
        current: state.vote?.submitted ?? 0,
        of: state.vote?.expected ?? 0,
      }}
    >
      <MediaPlayer url={media.url} kind={media.kind} muted />

      <div className="space-y-3">
        {(state.vote?.captions || []).map((c, i) => (
          <VoteCard
            key={c.id}
            index={i}
            text={c.text}
            isYours={c.isYours}
            stars={ballot[c.id] || 0}
            locked={sent}
            onRate={(s) => rate(c.id, s)}
            onReact={(e) => react(e, c.id)}
          />
        ))}
      </div>

      {votable.length === 0 ? (
        <p className="card p-4 text-center text-sm text-slate-400">
          Aucune caption à noter ici — on attend les autres.
        </p>
      ) : sent ? (
        <p className="card p-4 text-center font-bold text-neon-lime">
          ✓ Vote envoyé — {state.vote?.submitted}/{state.vote?.expected} joueurs ont voté.
        </p>
      ) : (
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={rated === 0}
          onClick={() => emit('vote:submit', { ballot })}
          className="btn-primary w-full py-4 text-lg"
        >
          {rated === 0 ? 'Attribue au moins une étoile' : `🗳️ Valider mon vote (${rated})`}
        </motion.button>
      )}

      <ReactionBar onReact={(e) => react(e, null)} bursts={bursts} />
    </PhaseShell>
  );
}

/* ------------------------------------------------------------------ */

function RevealPhase({
  state,
  left,
  total,
  react,
  bursts,
}: {
  state: RoomState;
  left: number | null;
  total: number;
  react: Props['react'];
  bursts: Burst[];
}) {
  const media = state.media!;
  const reveal = state.reveal!;

  return (
    <PhaseShell
      title="🎭 Révélation"
      subtitle={`Média de ${reveal.owner.avatar} ${reveal.owner.name}`}
      left={left}
      total={total}
      progress={{ label: 'Média', current: state.mediaIndex + 1, of: state.mediaCount }}
    >
      <MediaPlayer
        url={media.url}
        kind={media.kind}
        overlay={reveal.captions[0]?.text}
        muted
      />

      <div className="space-y-3">
        {reveal.captions.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.22, type: 'spring', stiffness: 300, damping: 26 }}
            className={`card p-4 ${
              c.isBest ? 'border-neon-amber/60 bg-neon-amber/10 shadow-glow-pink' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 text-lg font-bold leading-snug text-white">
                “{c.text}”
              </p>
              <motion.span
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.22 + 0.18 }}
                className={`shrink-0 rounded-xl px-2.5 py-1 text-lg font-black tabular-nums ${
                  c.isBest ? 'bg-neon-amber/25 text-neon-amber' : 'bg-white/10 text-white'
                }`}
              >
                +{c.points}
              </motion.span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <motion.span
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.22 + 0.3 }}
                className={`chip ${c.isYours ? 'border-neon-violet/50 text-neon-violet' : ''}`}
              >
                {c.author.avatar} {c.isYours ? 'Toi' : c.author.name}
              </motion.span>
              <span className="chip">
                ★ {c.stars} · {c.voters} vote{c.voters > 1 ? 's' : ''}
              </span>
              {c.isBest ? (
                <span className="chip border-neon-amber/50 text-neon-amber">
                  🏆 Meilleure caption +{reveal.bonus}
                </span>
              ) : null}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="card p-4">
        <p className="label mb-2.5">Classement</p>
        <Scoreboard players={state.players} youId={state.youId} showDelta />
      </div>

      <ReactionBar onReact={(e) => react(e, null)} bursts={bursts} />
    </PhaseShell>
  );
}

/* ------------------------------------------------------------------ */

function GameEnd({
  state,
  emit,
  isHost,
}: {
  state: RoomState;
  emit: Props['emit'];
  isHost: boolean;
}) {
  const podium = state.finalPodium || [];
  const youWon = state.winnerId === state.youId;

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6"
    >
      <div className="text-center">
        <motion.div
          initial={{ scale: 0, rotate: -25 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 14 }}
          className="text-7xl"
        >
          {youWon ? '👑' : '🏆'}
        </motion.div>
        <h2 className="mt-3 bg-gradient-to-r from-neon-amber via-neon-pink to-neon-violet bg-clip-text text-4xl font-black tracking-tighter text-transparent">
          {youWon ? 'Tu as gagné !' : podium[0] ? `${podium[0].name} gagne !` : 'Partie terminée'}
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          {state.totalRounds} round{state.totalRounds > 1 ? 's' : ''} de pur n&apos;importe quoi.
        </p>
      </div>

      <div className="flex items-end justify-center gap-2.5">
        {[1, 0, 2].map((idx, slot) => {
          const p = podium[idx];
          if (!p) return <div key={slot} className="w-24" />;
          const h = idx === 0 ? 'h-36' : idx === 1 ? 'h-28' : 'h-24';
          return (
            <motion.div
              key={p.id}
              initial={{ height: 0, opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 + slot * 0.14 }}
              className="flex w-24 flex-col items-center"
            >
              <span className="text-3xl">{p.avatar}</span>
              <span className="mt-1 max-w-full truncate text-xs font-bold text-white">{p.name}</span>
              <div
                className={`${h} mt-1.5 flex w-full flex-col items-center justify-start rounded-t-2xl pt-2 ${
                  idx === 0
                    ? 'bg-gradient-to-t from-neon-amber/20 to-neon-amber/50'
                    : idx === 1
                      ? 'bg-gradient-to-t from-white/10 to-white/30'
                      : 'bg-gradient-to-t from-orange-900/30 to-orange-700/40'
                }`}
              >
                <span className="text-xl font-black">{['🥇', '🥈', '🥉'][idx]}</span>
                <span className="text-lg font-black tabular-nums text-white">{p.score}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="card p-4">
        <p className="label mb-2.5">Classement final</p>
        <Scoreboard players={state.players} youId={state.youId} />
      </div>

      {isHost ? (
        <button onClick={() => emit('game:replay')} className="btn-primary w-full py-4 text-lg">
          🔁 Rejouer avec la même équipe
        </button>
      ) : (
        <p className="card p-4 text-center text-sm text-slate-400">
          👑 L&apos;hôte peut relancer une partie.
        </p>
      )}
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */

/** Bandeau d'avatars indiquant qui a fini / qui on attend. */
function WaitingStrip({ state, mode }: { state: RoomState; mode: 'upload' | 'caption' }) {
  const doneIds = new Set(
    mode === 'upload'
      ? state.upload?.readyIds || []
      : state.players
          .filter((p) => !(state.caption?.waitingOn || []).includes(p.id))
          .map((p) => p.id),
  );

  return (
    <div className="card flex flex-wrap items-center gap-2 p-3">
      <span className="label mr-1">On attend</span>
      {state.players
        .filter((p) => p.connected)
        .map((p) => {
          const owner = mode === 'caption' && state.media?.isYours && p.id === state.youId;
          const done = doneIds.has(p.id) || owner;
          return (
            <motion.span
              key={p.id}
              animate={done ? { opacity: 1, scale: 1 } : { opacity: 0.35, scale: 0.92 }}
              className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${
                done
                  ? 'border-neon-lime/50 bg-neon-lime/10 text-neon-lime'
                  : 'border-white/10 bg-white/5 text-slate-400'
              }`}
            >
              <span className="text-base leading-none">{p.avatar}</span>
              {done ? '✓' : '…'}
            </motion.span>
          );
        })}
    </div>
  );
}
