'use strict';
/* Simulation headless d'une partie complète : valide la machine à états
   sans navigateur ni socket.  Usage : node scripts/simulate.js            */

const E = require('../server/gameEngine');
const { PHASE } = require('../server/constants');

const assert = (cond, msg) => {
  if (!cond) {
    console.error('✗ ' + msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log('✓ ' + msg);
};

const room = E.createRoom('TEST01');
const ids = ['p1', 'p2', 'p3', 'p4'];
ids.forEach((id, i) => E.addPlayer(room, { id, name: 'Joueur' + (i + 1) }));

assert(room.players.length === 4, '4 joueurs ajoutés');
assert(room.hostId === 'p1', 'p1 est hôte');
assert(E.startGame(room, 'p2').error, 'un non-hôte ne peut pas lancer');

E.updateSettings(room, 'p1', { rounds: 2, captionSeconds: 30, voteSeconds: 20 });
assert(room.settings.rounds === 2, 'réglages appliqués (2 rounds)');

assert(!E.startGame(room, 'p1').error, 'partie lancée');
assert(room.phase === PHASE.UPLOAD && room.round === 1, 'round 1, phase upload');

// --- uploads ---
ids.forEach((id, i) =>
  E.submitMedia(room, id, { url: `/uploads/m${i}.jpg`, kind: 'image', name: `m${i}.jpg` }),
);
assert(E.submitMedia(room, 'p1', { url: '/uploads/dup.jpg', kind: 'image' }).error, 'pas de double upload');
assert(E.shouldAdvance(room), 'tous uploadés -> avance');
E.advance(room);
assert(room.phase === PHASE.CAPTION, 'passage en phase caption');
assert(room.mediaOrder.length === 4, '4 médias dans la file');

let mediasSeen = 0;

function playMedia() {
  const media = E.currentMedia(room);
  assert(!!media, `média ${room.currentIndex + 1} présent`);

  // le propriétaire ne peut pas légender son propre média
  assert(E.submitCaption(room, media.ownerId, 'nope').error, 'owner bloqué en caption');

  for (const p of room.players) {
    if (p.id === media.ownerId) continue;
    const r = E.submitCaption(room, p.id, `caption de ${p.id}`);
    assert(!r.error, `caption acceptée pour ${p.id}`);
  }
  assert(E.shouldAdvance(room), 'toutes les captions -> avance');
  E.advance(room);
  assert(room.phase === PHASE.VOTE, 'passage en phase vote');

  // Anonymat pendant le vote
  const view = E.viewFor(room, 'p2');
  assert(view.media.ownerId === null, "ownerId masqué pendant le vote");
  assert(view.vote.captions.every((c) => !('authorId' in c)), 'authorId absent des captions');
  assert(view.vote.captions.filter((c) => c.isYours).length <= 1, 'sa propre caption est marquée');

  // Vote : chacun met 5 étoiles à la 1re caption qui n'est pas la sienne, 2 aux autres
  for (const p of room.players) {
    const ballot = {};
    let first = true;
    for (const c of media.captions) {
      if (c.authorId === p.id) continue;
      ballot[c.id] = first ? 5 : 2;
      first = false;
    }
    if (Object.keys(ballot).length === 0) continue;
    // vote pour soi-même : ignoré silencieusement
    const own = media.captions.find((c) => c.authorId === p.id);
    if (own) ballot[own.id] = 5;
    const r = E.submitVote(room, p.id, ballot);
    assert(!r.error, `vote accepté pour ${p.id}`);
    assert(!(own && media.votes[p.id][own.id]), `auto-vote ignoré pour ${p.id}`);
  }

  assert(E.shouldAdvance(room), 'tous ont voté -> avance');
  E.advance(room);
  assert(room.phase === PHASE.REVEAL, 'passage en révélation');

  const rv = E.viewFor(room, 'p2');
  assert(rv.media.ownerId === media.ownerId, 'ownerId révélé');
  assert(rv.reveal.captions.every((c) => c.author && c.author.name), 'auteurs révélés');
  assert(rv.reveal.captions.some((c) => c.isBest), 'une meilleure caption désignée');
  assert(
    rv.reveal.captions.every((c) => c.points >= c.stars),
    'points >= étoiles (bonus inclus)',
  );

  const before = room.players.reduce((s, p) => s + p.score, 0);
  E.advance(room); // reveal -> media suivant / fin de round
  const after = room.players.reduce((s, p) => s + p.score, 0);
  assert(after === before, 'scoring idempotent (pas de double comptage)');
  mediasSeen++;
}

while (room.phase === PHASE.CAPTION) {
  playMedia();
}

assert(mediasSeen === 4, `les 4 médias ont été joués (${mediasSeen})`);
assert(room.phase === PHASE.ROUND_END, 'fin du round 1');
assert(room.players.every((p) => p.score > 0), 'tout le monde a marqué');

E.advance(room); // roundEnd -> round 2 upload
assert(room.round === 2 && room.phase === PHASE.UPLOAD, 'round 2 démarré');

// Round 2 en accéléré, avec un joueur qui se déconnecte
ids.forEach((id, i) => E.submitMedia(room, id, { url: `/uploads/r2m${i}.jpg`, kind: 'image' }));
E.advance(room);
E.markDisconnected(room, 'p4');
assert(E.activePlayers(room).length === 3, 'p4 déconnecté, 3 actifs');

let guard = 0;
while (room.phase !== PHASE.GAME_END && guard++ < 200) {
  const media = E.currentMedia(room);
  if (room.phase === PHASE.CAPTION && media) {
    for (const p of E.activePlayers(room)) {
      if (p.id !== media.ownerId) E.submitCaption(room, p.id, 'x ' + p.id);
    }
  } else if (room.phase === PHASE.VOTE && media) {
    for (const p of E.activePlayers(room)) {
      const ballot = {};
      for (const c of media.captions) if (c.authorId !== p.id) ballot[c.id] = 3;
      if (Object.keys(ballot).length) E.submitVote(room, p.id, ballot);
    }
  }
  room.phaseEndsAt = Date.now() - 1; // force l'expiration des phases d'attente
  if (E.shouldAdvance(room)) E.advance(room);
}

assert(room.phase === PHASE.GAME_END, `partie terminée en ${guard} itérations`);
const final = E.viewFor(room, 'p1');
assert(final.finalPodium.length === 3, 'podium à 3');
assert(final.winnerId, 'un gagnant désigné');
assert(final.finalPodium[0].score >= final.finalPodium[1].score, 'podium trié');

assert(!E.replay(room, 'p1').error, 'replay possible');
assert(room.phase === PHASE.LOBBY && room.round === 0, 'retour au lobby, scores remis à 0');
assert(room.players.every((p) => p.score === 0), 'scores remis à zéro');

// Quorum : s'il ne reste qu'un joueur en partie, on retombe au lobby
const solo = E.createRoom('SOLO01');
E.addPlayer(solo, { id: 'a', name: 'A' });
E.addPlayer(solo, { id: 'b', name: 'B' });
E.addPlayer(solo, { id: 'c', name: 'C' });
E.startGame(solo, 'a');
E.markDisconnected(solo, 'b');
E.markDisconnected(solo, 'c');
assert(E.enforceQuorum(solo), 'quorum perdu détecté');
assert(solo.phase === PHASE.LOBBY, 'retour au lobby sur quorum perdu');

console.log('\n🎉 Simulation complète : la machine à états tient.\n');
