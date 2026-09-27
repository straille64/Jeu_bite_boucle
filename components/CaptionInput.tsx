'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  max: number;
  initial?: string;
  submitted: boolean;
  disabled?: boolean;
  onChange?: (text: string) => void;
  onSubmit: (text: string) => void;
}

/**
 * Saisie de caption. On remonte le texte en direct (`onChange`) pour que
 * l'overlay du MediaPlayer se mette à jour pendant la frappe.
 */
export default function CaptionInput({
  max,
  initial = '',
  submitted,
  disabled,
  onChange,
  onSubmit,
}: Props) {
  const [text, setText] = useState(initial);

  // Resynchronise si le serveur renvoie une caption déjà enregistrée
  useEffect(() => {
    if (initial && !text) {
      setText(initial);
      onChange?.(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const left = max - text.length;
  const ready = text.trim().length > 0 && !disabled;

  function update(v: string) {
    const next = v.slice(0, max);
    setText(next);
    onChange?.(next);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => update(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (ready) onSubmit(text.trim());
            }
          }}
          disabled={disabled}
          rows={3}
          autoFocus
          placeholder="Balance ta caption… (Entrée pour envoyer)"
          className="input resize-none text-lg font-semibold leading-snug"
        />
        <span
          className={`absolute bottom-2.5 right-3 text-xs font-bold tabular-nums ${
            left < 20 ? 'text-neon-pink' : 'text-slate-500'
          }`}
        >
          {left}
        </span>
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        disabled={!ready}
        onClick={() => onSubmit(text.trim())}
        className="btn-primary w-full text-lg"
      >
        {submitted ? '✏️ Modifier ma caption' : '🚀 Envoyer ma caption'}
      </motion.button>

      {submitted ? (
        <p className="text-center text-sm font-semibold text-neon-lime">
          ✓ Caption enregistrée — tu peux encore la retoucher avant la fin du timer.
        </p>
      ) : null}
    </div>
  );
}
