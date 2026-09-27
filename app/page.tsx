'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { getSocket } from '@/lib/useGame';

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'idle' | 'create' | 'join'>('idle');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Pseudo mémorisé : pas d'auth, juste du confort.
  useEffect(() => {
    setName(localStorage.getItem('cb:name') || '');
    const url = new URL(window.location.href);
    const c = url.searchParams.get('code');
    if (c) {
      setCode(c.toUpperCase().slice(0, 6));
      setMode('join');
    }
  }, []);

  async function go(action: 'create' | 'join') {
    const pseudo = name.trim();
    if (!pseudo) return setErr('Choisis un pseudo.');
    if (action === 'join' && code.trim().length !== 6) return setErr('Le code fait 6 caractères.');

    setBusy(true);
    setErr(null);
    localStorage.setItem('cb:name', pseudo);

    const socket = getSocket();
    const payload = action === 'create' ? { name: pseudo } : { name: pseudo, code: code.trim() };

    socket.emit(
      action === 'create' ? 'room:create' : 'room:join',
      payload,
      (res: { code?: string; error?: string }) => {
        setBusy(false);
        if (res?.error || !res?.code) return setErr(res?.error || 'Connexion impossible.');
        router.push(`/room/${res.code}`);
      },
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-8 px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <span className="animate-float inline-block text-6xl">🎤</span>
        <h1 className="mt-3 bg-gradient-to-r from-neon-violet via-neon-pink to-neon-amber bg-clip-text text-5xl font-black tracking-tighter text-transparent sm:text-6xl">
          Caption Battle
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-base text-slate-400">
          Balancez vos médias les plus douteux. Légendez ceux des autres. Le plus drôle rafle tout.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="card space-y-4 p-6"
      >
        <div className="space-y-2">
          <label className="label" htmlFor="pseudo">
            Ton pseudo
          </label>
          <input
            id="pseudo"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 16))}
            placeholder="ex. TontonRaclette"
            maxLength={16}
            className="input text-lg font-bold"
          />
        </div>

        {mode === 'join' ? (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
            <label className="label" htmlFor="code">
              Code de la room
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && go('join')}
              placeholder="ABC123"
              inputMode="text"
              autoCapitalize="characters"
              className="input mt-2 text-center text-3xl font-black tracking-[0.35em]"
            />
          </motion.div>
        ) : null}

        <div className="space-y-2.5 pt-1">
          {mode === 'join' ? (
            <>
              <button disabled={busy} onClick={() => go('join')} className="btn-primary w-full text-lg">
                {busy ? 'Connexion…' : '🎯 Rejoindre la partie'}
              </button>
              <button onClick={() => setMode('idle')} className="btn-ghost w-full">
                ← Retour
              </button>
            </>
          ) : (
            <>
              <button disabled={busy} onClick={() => go('create')} className="btn-primary w-full text-lg">
                {busy ? 'Création…' : '✨ Créer une partie'}
              </button>
              <button onClick={() => setMode('join')} className="btn-ghost w-full">
                🔑 J&apos;ai un code
              </button>
            </>
          )}
        </div>

        {err ? (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-neon-pink/40 bg-neon-pink/10 px-4 py-3 text-center text-sm font-semibold text-neon-pink"
          >
            {err}
          </motion.p>
        ) : null}
      </motion.div>

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          ['📤', 'Upload', 'Ton média, anonyme'],
          ['✍️', 'Caption', 'Légende ceux des autres'],
          ['⭐', 'Vote', 'La meilleure gagne'],
        ].map(([icon, t, d], i) => (
          <motion.div
            key={t}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 + i * 0.07 }}
            className="card px-2 py-4"
          >
            <div className="text-2xl">{icon}</div>
            <div className="mt-1.5 text-sm font-black text-white">{t}</div>
            <div className="mt-0.5 text-[11px] leading-tight text-slate-500">{d}</div>
          </motion.div>
        ))}
      </div>

      <p className="text-center text-xs text-slate-600">3 à 10 joueurs · aucun compte requis</p>
    </main>
  );
}
