'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { RoomState } from '@/lib/types';
import Scoreboard from './Scoreboard';

interface Props {
  state: RoomState;
  emit: (event: string, payload?: unknown) => Promise<unknown>;
  onLeave: () => void;
}

export default function Lobby({ state, emit, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  const isHost = state.youId === state.hostId;
  const ready = state.players.filter((p) => p.connected).length;
  const canStart = ready >= state.minPlayers;

  async function copy() {
    const link = `${window.location.origin}/?code=${state.code}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* clipboard refusé (http, permissions) : le code reste lisible à l'écran */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card p-6 text-center">
        <p className="label">Code de la room</p>
        <p className="mt-2 text-5xl font-black tracking-[0.25em] text-white sm:text-6xl">
          {state.code}
        </p>
        <button onClick={copy} className="btn-ghost mt-4 w-full">
          {copied ? '✓ Lien copié !' : '🔗 Copier le lien d’invitation'}
        </button>
      </motion.div>

      <div className="card p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-black text-white">Joueurs</h3>
          <span className="chip">
            {ready}/{state.maxPlayers}
          </span>
        </div>
        <div className="mt-3">
          <Scoreboard players={state.players} youId={state.youId} compact />
        </div>
        {!canStart ? (
          <p className="mt-3 text-center text-sm font-semibold text-neon-amber">
            Encore {state.minPlayers - ready} joueur
            {state.minPlayers - ready > 1 ? 's' : ''} pour démarrer.
          </p>
        ) : null}
      </div>

      <div className="card space-y-4 p-5">
        <h3 className="text-lg font-black text-white">Réglages</h3>
        <Slider
          label="Nombre de rounds"
          value={state.settings.rounds}
          min={1}
          max={10}
          suffix={state.settings.rounds > 1 ? 'rounds' : 'round'}
          disabled={!isHost}
          onChange={(rounds) => emit('room:settings', { rounds })}
        />
        <Slider
          label="Temps par caption"
          value={state.settings.captionSeconds}
          min={20}
          max={120}
          step={5}
          suffix="sec"
          disabled={!isHost}
          onChange={(captionSeconds) => emit('room:settings', { captionSeconds })}
        />
        <Slider
          label="Temps de vote"
          value={state.settings.voteSeconds}
          min={15}
          max={120}
          step={5}
          suffix="sec"
          disabled={!isHost}
          onChange={(voteSeconds) => emit('room:settings', { voteSeconds })}
        />
        {!isHost ? (
          <p className="text-sm text-slate-500">
            👑 Seul l&apos;hôte règle la partie. Tu peux souffler.
          </p>
        ) : null}
      </div>

      {isHost ? (
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={!canStart}
          onClick={() => emit('game:start')}
          className="btn-primary w-full py-5 text-xl"
        >
          🚀 Lancer la partie
        </motion.button>
      ) : (
        <div className="card p-5 text-center">
          <span className="animate-pulse-fast text-3xl">⏳</span>
          <p className="mt-2 font-bold text-white">En attente de l&apos;hôte…</p>
        </div>
      )}

      <button onClick={onLeave} className="btn-ghost w-full">
        Quitter la room
      </button>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        <span className="text-base font-black text-neon-cyan">
          {value} {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10
                   accent-neon-violet disabled:cursor-not-allowed disabled:opacity-40"
      />
    </div>
  );
}
