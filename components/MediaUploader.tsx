'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ACCEPT_ATTR, type MediaKind } from '@/lib/types';
import { uploadMedia } from '@/lib/useGame';
import MediaPlayer from './MediaPlayer';

interface Props {
  onUploaded: (media: { url: string; kind: MediaKind; name: string }) => void;
  done: boolean;
}

/** Sélection + upload du média du round, avec preview locale avant envoi. */
export default function MediaUploader({ onUploaded, done }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; kind: MediaKind } | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    setErr(null);
    const kind = guessKind(file.type);
    if (!kind) {
      setErr('Format non supporté. JPG, PNG, WebP, GIF, MP4, WebM, MP3, WAV ou OGG.');
      return;
    }
    setPreview({ url: URL.createObjectURL(file), kind });
    setPct(0);
    try {
      const res = await uploadMedia(file, setPct);
      onUploaded({ url: res.url, kind: res.kind as MediaKind, name: res.name });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload impossible.');
      setPreview(null);
    } finally {
      setPct(null);
    }
  }

  if (done) {
    return (
      <div className="card p-6 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-5xl"
        >
          ✅
        </motion.div>
        <p className="mt-3 text-lg font-bold text-white">Média envoyé, et anonyme.</p>
        <p className="mt-1 text-sm text-slate-400">
          Personne ne sait que c&apos;est toi. On attend les autres…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />

      {preview ? (
        <MediaPlayer url={preview.url} kind={preview.kind} muted />
      ) : (
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handle(e.dataTransfer.files?.[0]);
          }}
          className={`card flex w-full flex-col items-center gap-3 border-dashed px-6 py-12 transition ${
            drag ? 'border-neon-violet bg-neon-violet/10' : 'border-white/20 hover:bg-white/5'
          }`}
        >
          <span className="animate-float text-6xl">🖼️</span>
          <span className="text-lg font-black text-white">Choisis ton média</span>
          <span className="max-w-xs text-center text-sm text-slate-400">
            Photo, GIF, vidéo ou audio. Le plus absurde possible — ce sont les autres qui devront
            le légender.
          </span>
          <span className="chip mt-1">JPG · PNG · WebP · GIF · MP4 · MP3 · WAV — 25 Mo max</span>
        </motion.button>
      )}

      {pct != null ? (
        <div className="space-y-1.5">
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-neon-violet to-neon-pink"
              animate={{ width: `${pct}%` }}
              transition={{ ease: 'linear', duration: 0.2 }}
            />
          </div>
          <p className="text-center text-sm font-semibold text-slate-400">Envoi… {pct}%</p>
        </div>
      ) : preview ? (
        <button onClick={() => input.current?.click()} className="btn-ghost w-full">
          🔄 Changer de média
        </button>
      ) : null}

      {err ? (
        <p className="rounded-2xl border border-neon-pink/40 bg-neon-pink/10 px-4 py-3 text-sm font-semibold text-neon-pink">
          {err}
        </p>
      ) : null}
    </div>
  );
}

function guessKind(mime: string): MediaKind | null {
  if (mime === 'image/gif') return 'gif';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return null;
}
