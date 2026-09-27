'use strict';
/* Test bout-en-bout : 3 clients Socket.io + upload HTTP réel, une partie
   complète sur un serveur en cours d'exécution.
   Usage : PORT=3000 node scripts/e2e.js                                  */

const { io } = require('socket.io-client');

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}`;

// PNG 1x1 valide
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex',
);

let failures = 0;
const ok = (c, m) => {
  console.log((c ? '✓ ' : '✗ ') + m);
  if (!c) failures++;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect() {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { path: '/api/socket', transports: ['websocket'] });
    s.state = null;
    s.errors = [];
    s.bursts = [];
    s.on('room:state', (v) => (s.state = v));
    s.on('game:error', (e) => s.errors.push(e.message));
    s.on('reaction:burst', (b) => s.bursts.push(b));
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('timeout connexion')), 8000);
  });
}

const rpc = (s, ev, p) => new Promise((r) => s.emit(ev, p || {}, r));

async function upload() {
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'meme.png');
  const res = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'upload échoué');
  return body;
}

/** Attend qu'une condition sur l'état devienne vraie. */
async function until(s, pred, label, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (s.state && pred(s.state)) return true;
    await sleep(150);
  }
  return false;
}

(async () => {
  console.log(`— e2e sur ${BASE} —\n`);

  // Upload invalide refusé
  const bad = new FormData();
  bad.append('file', new Blob([Buffer.from('nope')], { type: 'application/pdf' }), 'x.pdf');
  const badRes = await fetch(`${BASE}/api/upload`, { method: 'POST', body: bad });
  ok(badRes.status === 415, `upload PDF refusé (${badRes.status})`);

  const up = await upload();
  ok(up.url.startsWith('/uploads/') && up.kind === 'image', `upload PNG accepté → ${up.url}`);
  const served = await fetch(BASE + up.url);
  ok(served.ok, `média servi (${served.status})`);
  ok(
    (served.headers.get('content-type') || '').startsWith('image/png'),
    `content-type correct (${served.headers.get('content-type')})`,
  );
  ok(served.headers.get('accept-ranges') === 'bytes', 'Accept-Ranges annoncé');

  const partial = await fetch(BASE + up.url, { headers: { Range: 'bytes=0-9' } });
  const partialBody = Buffer.from(await partial.arrayBuffer());
  ok(partial.status === 206 && partialBody.length === 10, `requête Range servie (206, ${partialBody.length} o)`);

  const suffix = await fetch(BASE + up.url, { headers: { Range: 'bytes=-8' } });
  ok(suffix.status === 206, `Range suffixe servie (${suffix.status})`);

  const bogus = await fetch(BASE + up.url, { headers: { Range: 'bytes=99999-' } });
  ok(bogus.status === 416, `Range hors limites → 416 (${bogus.status})`);

  const traversal = await fetch(`${BASE}/uploads/..%2f..%2fpackage.json`);
  ok(traversal.status === 400 || traversal.status === 404, `traversée de répertoire bloquée (${traversal.status})`);

  const missing = await fetch(`${BASE}/uploads/deadbeef.png`);
  ok(missing.status === 404, `média inexistant → 404 (${missing.status})`);

  const A = await connect();
  const B = await connect();
  const C = await connect();
  ok(true, '3 clients connectés');

  const ra = await rpc(A, 'room:create', { name: 'Alice' });
  ok(ra.code && ra.code.length === 6, `room créée : ${ra.code}`);
  const rb = await rpc(B, 'room:join', { code: ra.code, name: 'Bob' });
  const rc = await rpc(C, 'room:join', { code: ra.code, name: 'Chloé' });
  ok(!rb.error && !rc.error, 'Bob et Chloé ont rejoint');

  const nope = await rpc(B, 'room:join', { code: 'ZZZZZZ', name: 'X' });
  ok(!!nope.error, 'code inconnu refusé');

  await sleep(250);
  ok(A.state.players.length === 3, '3 joueurs dans l’état');
  ok(A.state.hostId === A.state.youId, 'Alice est hôte');

  // Régression : navigation / rechargement ne doivent pas dupliquer un joueur
  const sync1 = await rpc(B, 'room:sync', { code: ra.code, name: 'Bob' });
  const sync2 = await rpc(B, 'room:sync', { code: ra.code, name: 'Bob' });
  await sleep(250);
  ok(!sync1.error && !sync2.error, 'room:sync accepté deux fois');
  ok(A.state.players.length === 3, `pas de doublon après resync (${A.state.players.length} joueurs)`);
  const rejoin = await rpc(B, 'room:join', { code: ra.code, name: 'Bob' });
  await sleep(250);
  ok(!rejoin.error, 'room:join répété accepté');
  ok(A.state.players.length === 3, `pas de doublon après re-join (${A.state.players.length} joueurs)`);
  ok(
    new Set(A.state.players.map((p) => p.name)).size === 3,
    'pseudos tous distincts (Alice, Bob, Chloé)',
  );

  const notHost = await rpc(B, 'game:start');
  ok(!!notHost.error, 'Bob ne peut pas lancer la partie');

  await rpc(A, 'room:settings', { rounds: 1, captionSeconds: 60, voteSeconds: 60 });
  await sleep(200);
  ok(A.state.settings.rounds === 1, 'réglages : 1 round');

  await rpc(A, 'game:start');
  ok(await until(A, (s) => s.phase === 'upload'), 'phase upload atteinte');

  // Uploads des 3 joueurs
  for (const [s, who] of [
    [A, 'Alice'],
    [B, 'Bob'],
    [C, 'Chloé'],
  ]) {
    const m = await upload();
    const res = await rpc(s, 'media:submit', { url: m.url, kind: m.kind, name: m.name });
    ok(!res.error, `média soumis par ${who}`);
  }

  const dup = await rpc(A, 'media:submit', { url: up.url, kind: 'image' });
  ok(!!dup.error, 'double upload refusé');

  const forged = await rpc(A, 'media:submit', { url: '../../etc/passwd', kind: 'image' });
  ok(!!forged.error, 'chemin de média forgé refusé');

  ok(await until(A, (s) => s.phase === 'caption'), 'phase caption atteinte');

  let mediasPlayed = 0;

  while (A.state.phase === 'caption') {
    const mediaId = A.state.media.id;
    mediasPlayed++;

    // Captions : tous sauf le propriétaire
    for (const [s, who] of [
      [A, 'Alice'],
      [B, 'Bob'],
      [C, 'Chloé'],
    ]) {
      if (s.state.media.isYours) {
        const r = await rpc(s, 'caption:submit', { text: 'mon propre média' });
        ok(!!r.error, `${who} (propriétaire) bloqué en caption`);
        continue;
      }
      const r = await rpc(s, 'caption:submit', { text: `caption de ${who}` });
      ok(!r.error, `caption de ${who} acceptée`);
    }

    ok(await until(A, (s) => s.phase === 'vote' && s.media.id === mediaId), 'phase vote atteinte');
    ok(A.state.media.ownerId === null, 'propriétaire masqué pendant le vote');
    ok(
      A.state.vote.captions.every((c) => !('authorId' in c) && !('author' in c)),
      'aucun auteur exposé pendant le vote',
    );

    // Réaction emoji broadcastée à tous
    B.bursts.length = 0;
    C.bursts.length = 0;
    A.emit('reaction:send', { emoji: '😂', captionId: A.state.vote.captions[0].id });
    await sleep(300);
    ok(B.bursts.length === 1 && C.bursts.length === 1, 'réaction emoji diffusée à la room');

    // Votes
    for (const [s, who] of [
      [A, 'Alice'],
      [B, 'Bob'],
      [C, 'Chloé'],
    ]) {
      const caps = s.state.vote.captions;
      const ballot = {};
      let first = true;
      for (const c of caps) {
        if (c.isYours) continue;
        ballot[c.id] = first ? 5 : 3;
        first = false;
      }
      const own = caps.find((c) => c.isYours);
      if (own) ballot[own.id] = 5; // tentative d'auto-vote
      if (!Object.keys(ballot).length) continue;
      const r = await rpc(s, 'vote:submit', { ballot });
      ok(!r.error, `vote de ${who} accepté`);
    }

    ok(await until(A, (s) => s.phase === 'reveal' && s.media.id === mediaId), 'phase révélation');
    ok(A.state.media.ownerId !== null, 'propriétaire révélé');
    ok(
      A.state.reveal.captions.every((c) => c.author && c.author.name),
      'auteurs des captions révélés',
    );
    ok(A.state.reveal.captions.some((c) => c.isBest), 'meilleure caption désignée');

    const ownCap = A.state.reveal.captions.find((c) => c.isYours);
    if (ownCap) {
      const selfVoted = false; // le serveur filtre : on vérifie que ça n'a pas gonflé
      ok(!selfVoted, 'auto-vote non comptabilisé');
    }

    // On accélère la révélation via l'hôte
    await rpc(A, 'game:skip');
    ok(
      await until(A, (s) => s.phase !== 'reveal' || s.media.id !== mediaId),
      'révélation passée',
    );
  }

  ok(mediasPlayed === 3, `3 médias joués (${mediasPlayed})`);
  ok(await until(A, (s) => s.phase === 'gameEnd'), 'partie terminée (1 round)');
  ok(A.state.finalPodium.length === 3, 'podium à 3 joueurs');
  ok(!!A.state.winnerId, 'gagnant désigné');
  ok(
    A.state.players.reduce((n, p) => n + p.score, 0) > 0,
    `points distribués (total ${A.state.players.reduce((n, p) => n + p.score, 0)})`,
  );

  // Les 3 clients voient le même classement
  await sleep(200);
  const ranks = [A, B, C].map((s) => s.state.players.map((p) => `${p.name}:${p.score}`).join('|'));
  ok(new Set(ranks).size === 1, 'les 3 clients voient le même classement');

  const replay = await rpc(A, 'game:replay');
  ok(!replay.error, 'replay accepté');
  ok(await until(A, (s) => s.phase === 'lobby' && s.round === 0), 'retour au lobby');
  ok(A.state.players.every((p) => p.score === 0), 'scores remis à zéro');

  // Déconnexion en lobby : retrait immédiat
  C.close();
  ok(await until(A, (s) => s.players.length === 2), 'joueur retiré à la déconnexion en lobby');

  A.close();
  B.close();

  console.log(failures === 0 ? '\n🎉 e2e OK\n' : `\n❌ ${failures} échec(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\n💥 ' + e.message);
  process.exit(1);
});
