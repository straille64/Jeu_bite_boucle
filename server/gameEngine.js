'use strict';

const {
  PHASE,
  LIMITS,
  DURATIONS,
  DEFAULT_SETTINGS,
  STAR_MIN,
  STAR_MAX,
  BEST_CAPTION_BONUS,
  AVATARS,
} = require('./constants');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1

function randomId(n = 10) {
  let out = '';
  for (let i = 0; i < n; i++) out += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
  return out.toLowerCase();
}

function makeCode() {
  let out = '';
  for (let i = 0; i < LIMITS.CODE_LENGTH; i++) {
    out += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
  }
  return out;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/* ------------------------------------------------------------------ */
/*  Création / joueurs                                                */
/* ------------------------------------------------------------------ */

function createRoom(code) {
  return {
    code,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostId: null,
    phase: PHASE.LOBBY,
    round: 0,
    settings: { ...DEFAULT_SETTINGS },
    players: [],
    /** medias du round courant */
    medias: [],
    mediaOrder: [],
    currentIndex: -1,
    phaseEndsAt: null,
    /** historique léger des rounds terminés (pour l'écran final) */
    history: [],
    lastRoundDelta: {},
  };
}

function pickAvatar(room) {
  const used = new Set(room.players.map((p) => p.avatar));
  const free = AVATARS.filter((a) => !used.has(a));
  return free.length ? free[(Math.random() * free.length) | 0] : AVATARS[0];
}

function sanitizeName(raw) {
  const name = String(raw || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, LIMITS.MAX_NAME);
  return name || 'Anonyme';
}

function addPlayer(room, { id, name }) {
  // Idempotent : un socket qui resynchronise ne doit pas se dupliquer.
  const already = getPlayer(room, id);
  if (already) {
    already.connected = true;
    already.disconnectedAt = null;
    if (!room.hostId) room.hostId = id;
    touch(room);
    return { player: already };
  }
  if (room.players.length >= LIMITS.MAX_PLAYERS) {
    return { error: 'Room pleine (10 joueurs max).' };
  }
  if (room.phase !== PHASE.LOBBY && room.phase !== PHASE.GAME_END) {
    return { error: 'Partie déjà en cours — attends la fin du round.' };
  }
  const player = {
    id,
    name: sanitizeName(name),
    avatar: pickAvatar(room),
    score: 0,
    connected: true,
    disconnectedAt: null,
    ready: false,
  };
  room.players.push(player);
  if (!room.hostId) room.hostId = id;
  touch(room);
  return { player };
}

function getPlayer(room, id) {
  return room.players.find((p) => p.id === id) || null;
}

function activePlayers(room) {
  return room.players.filter((p) => p.connected);
}

/** Marque déconnecté (on garde le score pendant la grâce) */
function markDisconnected(room, id) {
  const p = getPlayer(room, id);
  if (!p) return;
  p.connected = false;
  p.disconnectedAt = Date.now();
  if (room.hostId === id) {
    const next = activePlayers(room)[0];
    room.hostId = next ? next.id : room.hostId;
  }
  touch(room);
}

function reconnect(room, id) {
  const p = getPlayer(room, id);
  if (!p) return null;
  p.connected = true;
  p.disconnectedAt = null;
  if (!activePlayers(room).some((x) => x.id === room.hostId)) room.hostId = id;
  touch(room);
  return p;
}

function removePlayer(room, id) {
  room.players = room.players.filter((p) => p.id !== id);
  room.medias = room.medias.filter((m) => m.ownerId !== id);
  for (const m of room.medias) {
    m.captions = m.captions.filter((c) => c.authorId !== id);
    delete m.votes[id];
  }
  room.mediaOrder = room.mediaOrder.filter((mid) => room.medias.some((m) => m.id === mid));
  if (room.hostId === id) {
    const next = activePlayers(room)[0];
    room.hostId = next ? next.id : null;
  }
  touch(room);
}

function purgeStaleDisconnects(room) {
  const now = Date.now();
  const stale = room.players.filter(
    (p) => !p.connected && p.disconnectedAt && now - p.disconnectedAt > LIMITS.DISCONNECT_GRACE_MS,
  );
  for (const p of stale) removePlayer(room, p.id);
  return stale.length > 0;
}

function touch(room) {
  room.updatedAt = Date.now();
}

/* ------------------------------------------------------------------ */
/*  Réglages / démarrage                                              */
/* ------------------------------------------------------------------ */

function updateSettings(room, playerId, patch) {
  if (room.hostId !== playerId) return { error: "Seul l'hôte peut changer les réglages." };
  if (room.phase !== PHASE.LOBBY && room.phase !== PHASE.GAME_END) {
    return { error: 'Réglages verrouillés pendant la partie.' };
  }
  if (patch.rounds != null) room.settings.rounds = clamp(Math.round(patch.rounds), 1, 10);
  if (patch.captionSeconds != null) {
    room.settings.captionSeconds = clamp(Math.round(patch.captionSeconds), 20, 120);
  }
  if (patch.voteSeconds != null) {
    room.settings.voteSeconds = clamp(Math.round(patch.voteSeconds), 15, 120);
  }
  touch(room);
  return { ok: true };
}

function startGame(room, playerId) {
  if (room.hostId !== playerId) return { error: "Seul l'hôte peut lancer la partie." };
  if (room.phase !== PHASE.LOBBY && room.phase !== PHASE.GAME_END) {
    return { error: 'Partie déjà lancée.' };
  }
  if (activePlayers(room).length < LIMITS.MIN_PLAYERS) {
    return { error: `Il faut au moins ${LIMITS.MIN_PLAYERS} joueurs.` };
  }
  for (const p of room.players) p.score = 0;
  room.history = [];
  room.round = 0;
  return beginRound(room);
}

function replay(room, playerId) {
  if (room.hostId !== playerId) return { error: "Seul l'hôte peut relancer." };
  room.phase = PHASE.LOBBY;
  room.round = 0;
  room.medias = [];
  room.mediaOrder = [];
  room.currentIndex = -1;
  room.phaseEndsAt = null;
  room.lastRoundDelta = {};
  for (const p of room.players) {
    p.score = 0;
    p.ready = false;
  }
  touch(room);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  Round : upload                                                     */
/* ------------------------------------------------------------------ */

function beginRound(room) {
  room.round += 1;
  room.medias = [];
  room.mediaOrder = [];
  room.currentIndex = -1;
  room.lastRoundDelta = {};
  for (const p of room.players) p.ready = false;
  setPhase(room, PHASE.UPLOAD, DURATIONS.UPLOAD);
  return { ok: true };
}

function setPhase(room, phase, seconds) {
  room.phase = phase;
  room.phaseEndsAt = seconds ? Date.now() + seconds * 1000 : null;
  touch(room);
}

/**
 * @param {{ownerId:string, url:string, kind:string, name?:string}} media
 */
function submitMedia(room, ownerId, media) {
  if (room.phase !== PHASE.UPLOAD) return { error: "Ce n'est pas la phase d'upload." };
  const player = getPlayer(room, ownerId);
  if (!player) return { error: 'Joueur inconnu.' };
  if (room.medias.some((m) => m.ownerId === ownerId)) {
    return { error: 'Tu as déjà envoyé ton média pour ce round.' };
  }
  room.medias.push({
    id: randomId(),
    ownerId,
    url: media.url,
    kind: media.kind,
    name: media.name || '',
    captions: [],
    votes: {}, // voterId -> { captionId: stars }
    reactions: [], // { emoji, captionId }
    scored: false,
  });
  player.ready = true;
  touch(room);
  return { ok: true };
}

function allUploaded(room) {
  const act = activePlayers(room);
  return act.length > 0 && act.every((p) => room.medias.some((m) => m.ownerId === p.id));
}

/** Passe de upload -> premier média en caption. */
function startCaptionRun(room) {
  if (room.medias.length === 0) {
    // Personne n'a uploadé : on saute le round.
    return finishRound(room);
  }
  room.mediaOrder = shuffle(room.medias.map((m) => m.id));
  room.currentIndex = -1;
  return nextMedia(room);
}

function currentMedia(room) {
  const id = room.mediaOrder[room.currentIndex];
  return room.medias.find((m) => m.id === id) || null;
}

function expectedCaptioners(room, media) {
  return activePlayers(room).filter((p) => p.id !== media.ownerId);
}

function nextMedia(room) {
  room.currentIndex += 1;
  while (room.currentIndex < room.mediaOrder.length) {
    const media = currentMedia(room);
    if (media && expectedCaptioners(room, media).length > 0) {
      setPhase(room, PHASE.CAPTION, room.settings.captionSeconds);
      return { ok: true };
    }
    room.currentIndex += 1; // média orphelin (propriétaire seul) -> on saute
  }
  return finishRound(room);
}

/* ------------------------------------------------------------------ */
/*  Caption                                                            */
/* ------------------------------------------------------------------ */

function submitCaption(room, playerId, text) {
  if (room.phase !== PHASE.CAPTION) return { error: "Ce n'est pas la phase de caption." };
  const media = currentMedia(room);
  if (!media) return { error: 'Aucun média en cours.' };
  if (media.ownerId === playerId) return { error: "C'est ton média, tu ne peux pas le légender." };
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.MAX_CAPTION);
  if (!clean) return { error: 'Caption vide.' };
  const existing = media.captions.find((c) => c.authorId === playerId);
  if (existing) {
    existing.text = clean; // on autorise l'édition tant que la phase tourne
  } else {
    media.captions.push({ id: randomId(), authorId: playerId, text: clean });
  }
  touch(room);
  return { ok: true };
}

function allCaptioned(room) {
  const media = currentMedia(room);
  if (!media) return true;
  const expected = expectedCaptioners(room, media);
  return expected.every((p) => media.captions.some((c) => c.authorId === p.id));
}

function startVote(room) {
  const media = currentMedia(room);
  if (!media || media.captions.length === 0) return nextMedia(room);
  // Ordre d'affichage figé et mélangé pour l'anonymat
  media.captions = shuffle(media.captions);
  setPhase(room, PHASE.VOTE, room.settings.voteSeconds);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  Vote                                                               */
/* ------------------------------------------------------------------ */

function expectedVoters(room, media) {
  // Tout le monde vote, y compris le propriétaire du média (il n'a pas de caption).
  // Un joueur n'est attendu que s'il existe au moins une caption qui n'est pas la sienne.
  return activePlayers(room).filter((p) => media.captions.some((c) => c.authorId !== p.id));
}

function submitVote(room, playerId, ballot) {
  if (room.phase !== PHASE.VOTE) return { error: "Ce n'est pas la phase de vote." };
  const media = currentMedia(room);
  if (!media) return { error: 'Aucun média en cours.' };
  const entries = Object.entries(ballot || {});
  const clean = {};
  for (const [captionId, stars] of entries) {
    const caption = media.captions.find((c) => c.id === captionId);
    if (!caption) continue;
    if (caption.authorId === playerId) continue; // pas de vote pour soi
    const n = Math.round(Number(stars));
    if (!Number.isFinite(n) || n < STAR_MIN) continue;
    clean[captionId] = clamp(n, STAR_MIN, STAR_MAX);
  }
  if (Object.keys(clean).length === 0) return { error: 'Attribue au moins une étoile.' };
  media.votes[playerId] = clean;
  touch(room);
  return { ok: true };
}

function allVoted(room) {
  const media = currentMedia(room);
  if (!media) return true;
  return expectedVoters(room, media).every((p) => media.votes[p.id]);
}

function addReaction(room, playerId, emoji, captionId) {
  const media = currentMedia(room);
  if (!media) return { error: 'Aucun média en cours.' };
  if (room.phase !== PHASE.VOTE && room.phase !== PHASE.REVEAL) {
    return { error: 'Réactions indisponibles ici.' };
  }
  media.reactions.push({ emoji, captionId: captionId || null, at: Date.now() });
  if (media.reactions.length > 300) media.reactions = media.reactions.slice(-300);
  return { ok: true, emoji, captionId: captionId || null };
}

/* ------------------------------------------------------------------ */
/*  Révélation & scoring                                               */
/* ------------------------------------------------------------------ */

/** Calcule les points du média courant et les applique (idempotent). */
function scoreCurrentMedia(room) {
  const media = currentMedia(room);
  if (!media || media.scored) return;

  const tally = new Map(); // captionId -> { stars, voters }
  for (const c of media.captions) tally.set(c.id, { stars: 0, voters: 0 });

  for (const ballot of Object.values(media.votes)) {
    for (const [captionId, stars] of Object.entries(ballot)) {
      const t = tally.get(captionId);
      if (!t) continue;
      t.stars += stars;
      t.voters += 1;
    }
  }

  const best = Math.max(0, ...[...tally.values()].map((t) => t.stars));
  const delta = {};

  for (const c of media.captions) {
    const t = tally.get(c.id);
    let pts = t.stars;
    const isBest = best > 0 && t.stars === best;
    if (isBest) pts += BEST_CAPTION_BONUS;
    c.stars = t.stars;
    c.voters = t.voters;
    c.isBest = isBest;
    c.points = pts;
    delta[c.authorId] = (delta[c.authorId] || 0) + pts;
    const author = getPlayer(room, c.authorId);
    if (author) author.score += pts;
  }

  media.scored = true;
  for (const [pid, pts] of Object.entries(delta)) {
    room.lastRoundDelta[pid] = (room.lastRoundDelta[pid] || 0) + pts;
  }
  touch(room);
}

function startReveal(room) {
  scoreCurrentMedia(room);
  setPhase(room, PHASE.REVEAL, DURATIONS.REVEAL);
  return { ok: true };
}

function finishRound(room) {
  room.history.push({
    round: room.round,
    delta: { ...room.lastRoundDelta },
    standings: leaderboard(room).map((p) => ({ id: p.id, name: p.name, score: p.score })),
  });
  if (room.round >= room.settings.rounds) {
    setPhase(room, PHASE.GAME_END, null);
  } else {
    setPhase(room, PHASE.ROUND_END, DURATIONS.ROUND_END);
  }
  return { ok: true };
}

function leaderboard(room) {
  return room.players
    .slice()
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

/* ------------------------------------------------------------------ */
/*  Avancement : appelé sur timer expiré OU quand tout le monde a fini  */
/* ------------------------------------------------------------------ */

/** Le round/phase doit-il avancer maintenant ? */
function shouldAdvance(room) {
  const expired = room.phaseEndsAt != null && Date.now() >= room.phaseEndsAt;
  switch (room.phase) {
    case PHASE.UPLOAD:
      return expired || allUploaded(room);
    case PHASE.CAPTION:
      return expired || allCaptioned(room);
    case PHASE.VOTE:
      return expired || allVoted(room);
    case PHASE.REVEAL:
    case PHASE.ROUND_END:
      return expired;
    default:
      return false;
  }
}

/** Fait avancer la machine d'un cran. Retourne true si l'état a changé. */
function advance(room) {
  switch (room.phase) {
    case PHASE.UPLOAD:
      startCaptionRun(room);
      return true;
    case PHASE.CAPTION:
      startVote(room);
      return true;
    case PHASE.VOTE:
      startReveal(room);
      return true;
    case PHASE.REVEAL:
      nextMedia(room);
      return true;
    case PHASE.ROUND_END:
      beginRound(room);
      return true;
    default:
      return false;
  }
}

/** L'hôte peut court-circuiter un timer d'attente. */
function hostSkip(room, playerId) {
  if (room.hostId !== playerId) return { error: "Seul l'hôte peut passer." };
  const skippable = [PHASE.UPLOAD, PHASE.CAPTION, PHASE.VOTE, PHASE.REVEAL, PHASE.ROUND_END];
  if (!skippable.includes(room.phase)) return { error: 'Rien à passer ici.' };
  room.phaseEndsAt = Date.now();
  return { ok: true };
}

/** Si trop peu de joueurs restent, on retombe au lobby proprement. */
function enforceQuorum(room) {
  const inGame = [PHASE.UPLOAD, PHASE.CAPTION, PHASE.VOTE, PHASE.REVEAL, PHASE.ROUND_END];
  if (!inGame.includes(room.phase)) return false;
  if (activePlayers(room).length >= 2) return false;
  setPhase(room, PHASE.LOBBY, null);
  room.medias = [];
  room.mediaOrder = [];
  room.currentIndex = -1;
  room.round = 0;
  return true;
}

/* ------------------------------------------------------------------ */
/*  Vue client (anonymat garanti côté serveur)                         */
/* ------------------------------------------------------------------ */

/**
 * Projette l'état pour un joueur donné. Les `ownerId` / `authorId` ne sortent
 * jamais du serveur avant la phase REVEAL — c'est ici que l'anonymat est tenu.
 */
function viewFor(room, viewerId) {
  const media = currentMedia(room);
  const revealed = room.phase === PHASE.REVEAL;

  const base = {
    code: room.code,
    phase: room.phase,
    round: room.round,
    totalRounds: room.settings.rounds,
    settings: room.settings,
    hostId: room.hostId,
    youId: viewerId,
    phaseEndsAt: room.phaseEndsAt,
    serverNow: Date.now(),
    players: leaderboard(room).map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      rank: p.rank,
      connected: p.connected,
      isHost: p.id === room.hostId,
      roundDelta: room.lastRoundDelta[p.id] || 0,
    })),
    mediaCount: room.mediaOrder.length || room.medias.length,
    mediaIndex: room.currentIndex,
    minPlayers: LIMITS.MIN_PLAYERS,
    maxPlayers: LIMITS.MAX_PLAYERS,
    maxCaption: LIMITS.MAX_CAPTION,
  };

  if (room.phase === PHASE.UPLOAD) {
    base.upload = {
      youUploaded: room.medias.some((m) => m.ownerId === viewerId),
      submitted: room.medias.length,
      expected: activePlayers(room).length,
      // uniquement des booléens : on ne dit pas QUI a uploadé QUOI
      readyIds: room.medias.map((m) => m.ownerId),
    };
  }

  if (media && [PHASE.CAPTION, PHASE.VOTE, PHASE.REVEAL].includes(room.phase)) {
    const isOwner = media.ownerId === viewerId;
    base.media = {
      id: media.id,
      url: media.url,
      kind: media.kind,
      isYours: isOwner,
      ownerId: revealed ? media.ownerId : null,
      reactions: media.reactions.slice(-40),
    };

    if (room.phase === PHASE.CAPTION) {
      const mine = media.captions.find((c) => c.authorId === viewerId);
      base.caption = {
        yourText: mine ? mine.text : '',
        youSubmitted: Boolean(mine),
        submitted: media.captions.length,
        expected: expectedCaptioners(room, media).length,
        waitingOn: expectedCaptioners(room, media)
          .filter((p) => !media.captions.some((c) => c.authorId === p.id))
          .map((p) => p.id),
      };
    }

    if (room.phase === PHASE.VOTE) {
      base.vote = {
        captions: media.captions.map((c) => ({
          id: c.id,
          text: c.text,
          isYours: c.authorId === viewerId,
        })),
        yourBallot: media.votes[viewerId] || null,
        youVoted: Boolean(media.votes[viewerId]),
        submitted: Object.keys(media.votes).length,
        expected: expectedVoters(room, media).length,
      };
    }

    if (revealed) {
      base.reveal = {
        captions: media.captions
          .slice()
          .sort((a, b) => (b.points || 0) - (a.points || 0))
          .map((c) => {
            const author = getPlayer(room, c.authorId);
            return {
              id: c.id,
              text: c.text,
              stars: c.stars || 0,
              voters: c.voters || 0,
              points: c.points || 0,
              isBest: Boolean(c.isBest),
              isYours: c.authorId === viewerId,
              author: author
                ? { id: author.id, name: author.name, avatar: author.avatar }
                : { id: c.authorId, name: 'Parti·e', avatar: '👻' },
            };
          }),
        owner: (() => {
          const o = getPlayer(room, media.ownerId);
          return o ? { id: o.id, name: o.name, avatar: o.avatar } : { name: 'Parti·e', avatar: '👻' };
        })(),
        bonus: BEST_CAPTION_BONUS,
      };
    }
  }

  if (room.phase === PHASE.GAME_END) {
    const lb = leaderboard(room);
    base.finalPodium = lb.slice(0, 3).map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      rank: p.rank,
    }));
    base.winnerId = lb.length ? lb[0].id : null;
  }

  return base;
}

module.exports = {
  PHASE,
  LIMITS,
  makeCode,
  randomId,
  createRoom,
  addPlayer,
  getPlayer,
  activePlayers,
  markDisconnected,
  reconnect,
  removePlayer,
  purgeStaleDisconnects,
  updateSettings,
  startGame,
  replay,
  submitMedia,
  submitCaption,
  submitVote,
  addReaction,
  shouldAdvance,
  advance,
  hostSkip,
  enforceQuorum,
  leaderboard,
  viewFor,
  currentMedia,
};
