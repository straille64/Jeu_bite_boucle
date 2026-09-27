'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { MediaKind } from '@/lib/types';

interface Props {
  url: string;
  kind: MediaKind;
  /** Caption superposée en temps réel (prévisualisation) */
  overlay?: string;
  className?: string;
  muted?: boolean;
}

/**
 * Lecteur unifié image / GIF / vidéo / audio, avec overlay de caption
 * façon mème. Le conteneur garde un ratio stable pour éviter les sauts
 * de layout quand on passe d'un média à l'autre.
 */
export default function MediaPlayer({ url, kind, overlay, className = '', muted = false }: Props) {
  return (
    <div
      className={`relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black/60 ${className}`}
    >
      <div className="flex min-h-[220px] w-full items-center justify-center">
        {kind === 'image' || kind === 'gif' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Média du round"
            className="max-h-[52vh] w-full object-contain"
            draggable={false}
          />
        ) : kind === 'video' ? (
          <video
            src={url}
            className="max-h-[52vh] w-full object-contain"
            controls
            playsInline
            loop
            autoPlay
            muted={muted}
          />
        ) : (
          <AudioViz url={url} />
        )}
      </div>

      {overlay ? <CaptionOverlay text={overlay} /> : null}
    </div>
  );
}

function CaptionOverlay({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4"
    >
      <p
        className="text-center text-lg font-black uppercase leading-tight tracking-tight text-white
                   sm:text-2xl"
        style={{
          textShadow:
            '0 2px 0 #000, 0 -2px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 0 4px 18px rgba(0,0,0,.9)',
        }}
      >
        {text}
      </p>
    </motion.div>
  );
}

/** Piste audio : on donne quelque chose à regarder, sinon l'écran est vide. */
function AudioViz({ url }: { url: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    el.addEventListener('play', on);
    el.addEventListener('pause', off);
    el.addEventListener('ended', off);
    return () => {
      el.removeEventListener('play', on);
      el.removeEventListener('pause', off);
      el.removeEventListener('ended', off);
    };
  }, []);

  return (
    <div className="flex w-full flex-col items-center gap-5 px-5 py-9">
      <div className="flex h-20 items-end gap-1.5">
        {Array.from({ length: 22 }).map((_, i) => (
          <motion.span
            key={i}
            className="w-2 rounded-full bg-gradient-to-t from-neon-violet to-neon-cyan"
            animate={
              playing
                ? { height: [8, 16 + ((i * 37) % 60), 8] }
                : { height: 10 + ((i * 13) % 18) }
            }
            transition={
              playing
                ? { duration: 0.5 + ((i % 5) * 0.12), repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.3 }
            }
          />
        ))}
      </div>
      <audio ref={ref} src={url} controls className="w-full max-w-md" />
    </div>
  );
}
