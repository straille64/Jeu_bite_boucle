'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { RoomState } from './types';

type Ack = { ok?: true; error?: string; code?: string; playerId?: string; name?: string };

let shared: Socket | null = null;

/** Une seule connexion par onglet, réutilisée entre les pages. */
export function getSocket(): Socket {
  if (!shared) {
    shared = io({ path: '/api/socket', transports: ['websocket', 'polling'] });
  }
  return shared;
}

export interface Burst {
  id: number;
  emoji: string;
  captionId: string | null;
}

export function useGame() {
  const socket = useMemo(() => getSocket(), []);
  const [state, setState] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState<string | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const burstId = useRef(0);

  useEffect(() => {
    const onState = (s: RoomState) => setState(s);
    const onError = ({ message }: { message: string }) => setError(message);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onBurst = ({ emoji, captionId }: { emoji: string; captionId: string | null }) => {
      const id = ++burstId.current;
      setBursts((b) => [...b.slice(-24), { id, emoji, captionId }]);
      setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1800);
    };

    socket.on('room:state', onState);
    socket.on('game:error', onError);
    socket.on('reaction:burst', onBurst);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('room:state', onState);
      socket.off('game:error', onError);
      socket.off('reaction:burst', onBurst);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  // L'erreur s'effface d'elle-même : pas de modale à fermer en pleine partie.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4200);
    return () => clearTimeout(t);
  }, [error]);

  const emit = useCallback(
    <T = Ack>(event: string, payload?: unknown) =>
      new Promise<T>((resolve) => {
        socket.emit(event, payload ?? {}, (res: T) => resolve(res));
      }),
    [socket],
  );

  return { socket, state, connected, error, setError, bursts, emit };
}

/** Upload HTTP du média, séparé du canal WebSocket. */
export async function uploadMedia(file: File, onProgress?: (pct: number) => void) {
  return new Promise<{ url: string; kind: string; name: string }>((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body.error || 'Upload refusé.'));
      } catch {
        reject(new Error('Réponse serveur illisible.'));
      }
    };
    xhr.onerror = () => reject(new Error('Upload impossible — connexion perdue.'));
    xhr.send(form);
  });
}

/** Compte à rebours aligné sur l'horloge serveur (corrige le décalage client). */
export function useCountdown(endsAt: number | null, serverNow: number) {
  const offset = useRef(0);
  useEffect(() => {
    if (serverNow) offset.current = serverNow - Date.now();
  }, [serverNow]);

  const [left, setLeft] = useState(() => remaining(endsAt, offset.current));

  useEffect(() => {
    setLeft(remaining(endsAt, offset.current));
    if (endsAt == null) return;
    const t = setInterval(() => setLeft(remaining(endsAt, offset.current)), 200);
    return () => clearInterval(t);
  }, [endsAt]);

  return left;
}

function remaining(endsAt: number | null, offset: number) {
  if (endsAt == null) return null;
  return Math.max(0, Math.ceil((endsAt - (Date.now() + offset)) / 1000));
}
