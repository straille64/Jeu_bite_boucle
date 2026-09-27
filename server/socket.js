'use strict';

const E = require('./gameEngine');
const RM = require('./roomManager');
const { PHASE, EMOJIS } = require('./constants');

const TICK_MS = 250;

/**
 * Branche la logique de jeu sur une instance Socket.io.
 *
 * Invariant central : le serveur ne diffuse jamais l'état brut d'une room.
 * Chaque socket reçoit `E.viewFor(room, playerId)`, qui masque les
 * `ownerId` / `authorId` tant que la phase REVEAL n'est pas atteinte.
 */
function attach(io) {
  /** socketId -> { code, playerId } */
  const links = new Map();

  function push(room) {
    for (const [socketId, link] of links) {
      if (link.code !== room.code) continue;
      io.to(socketId).emit('room:state', E.viewFor(room, link.playerId));
    }
  }

  function respond(ack, payload) {
    if (typeof ack === 'function') ack(payload);
  }

  /** Vide la file de transitions (une action peut en débloquer plusieurs). */
  function drain(room) {
    let guard = 0;
    while (E.shouldAdvance(room) && guard++ < 16) E.advance(room);
  }

  /* --- horloge globale : timers de phase, déconnexions, quorum --- */
  const tick = setInterval(() => {
    for (const room of RM.rooms.values()) {
      let changed = false;
      if (E.purgeStaleDisconnects(room)) changed = true;
      if (E.enforceQuorum(room)) changed = true;
      if (E.shouldAdvance(room)) {
        drain(room);
        changed = true;
      }
      if (changed) push(room);
    }
  }, TICK_MS);
  tick.unref?.();

  const sweeper = setInterval(() => RM.sweep(), 60_000);
  sweeper.unref?.();

  io.on('connection', (socket) => {
    /** Handler d'action de jeu : résout la room, applique, rediffuse. */
    function action(event, handler) {
      socket.on(event, (payload, ack) => {
        const link = links.get(socket.id);
        if (!link) return respond(ack, { error: 'Pas connecté à une room.' });
        const room = RM.get(link.code);
        if (!room) return respond(ack, { error: 'Room expirée.' });
        const res = handler(room, link, payload) || {};
        if (res.error) {
          socket.emit('game:error', { message: res.error });
          return respond(ack, res);
        }
        respond(ack, { ok: true });
        drain(room);
        push(room);
      });
    }

    function enter(room, name, ack) {
      const { player, error } = E.addPlayer(room, { id: socket.id, name });
      if (error) {
        socket.emit('game:error', { message: error });
        return respond(ack, { error });
      }
      links.set(socket.id, { code: room.code, playerId: player.id });
      socket.join(room.code);
      respond(ack, { code: room.code, playerId: player.id, name: player.name });
      push(room);
    }

    /* ---------------- room ---------------- */

    socket.on('room:create', ({ name } = {}, ack) => {
      enter(RM.create(), name, ack);
    });

    socket.on('room:join', ({ code, name } = {}, ack) => {
      const room = RM.get(code);
      if (!room) return respond(ack, { error: 'Room introuvable — vérifie le code.' });
      enter(room, name, ack);
    });

    /**
     * Resynchronisation après une navigation ou un rechargement de page.
     * Le client n'a pas d'état tant que rien ne bouge dans la room : ce
     * handler lui renvoie une projection immédiate, et le fait entrer
     * seulement s'il n'est pas déjà lié.
     */
    socket.on('room:sync', ({ code, name } = {}, ack) => {
      const existing = links.get(socket.id);
      if (existing) {
        const room = RM.get(existing.code);
        if (room) {
          socket.emit('room:state', E.viewFor(room, existing.playerId));
          return respond(ack, { code: room.code, playerId: existing.playerId });
        }
        links.delete(socket.id);
      }
      const room = RM.get(code);
      if (!room) return respond(ack, { error: 'Room introuvable ou expirée.' });
      enter(room, name, ack);
    });

    /* ---------------- contrôle hôte ---------------- */

    action('room:settings', (room, link, p) => E.updateSettings(room, link.playerId, p || {}));
    action('game:start', (room, link) => E.startGame(room, link.playerId));
    action('game:replay', (room, link) => E.replay(room, link.playerId));
    action('game:skip', (room, link) => E.hostSkip(room, link.playerId));

    /* ---------------- gameplay ---------------- */

    action('media:submit', (room, link, p = {}) => {
      if (typeof p.url !== 'string' || !/^\/uploads\/[A-Za-z0-9._-]+$/.test(p.url)) {
        return { error: 'Média invalide.' };
      }
      return E.submitMedia(room, link.playerId, { url: p.url, kind: p.kind, name: p.name });
    });

    action('caption:submit', (room, link, p = {}) => E.submitCaption(room, link.playerId, p.text));
    action('vote:submit', (room, link, p = {}) => E.submitVote(room, link.playerId, p.ballot));

    /* Réactions : canal léger, hors état, pour rester fluide. */
    socket.on('reaction:send', (p = {}) => {
      const link = links.get(socket.id);
      if (!link) return;
      const room = RM.get(link.code);
      if (!room || !EMOJIS.includes(p.emoji)) return;
      const res = E.addReaction(room, link.playerId, p.emoji, p.captionId);
      if (res.error) return;
      io.to(room.code).emit('reaction:burst', {
        emoji: res.emoji,
        captionId: res.captionId,
        at: Date.now(),
      });
    });

    /* ---------------- sortie ---------------- */

    socket.on('room:leave', () => teardown(true));
    socket.on('disconnect', () => teardown(false));

    function teardown(explicit) {
      const link = links.get(socket.id);
      if (!link) return;
      links.delete(socket.id);
      const room = RM.get(link.code);
      if (!room) return;
      // Hors partie on retire tout de suite ; en partie on laisse une fenêtre
      // de reconnexion pour ne pas perdre le score sur un refresh.
      if (explicit || room.phase === PHASE.LOBBY || room.phase === PHASE.GAME_END) {
        E.removePlayer(room, link.playerId);
      } else {
        E.markDisconnected(room, link.playerId);
      }
      E.enforceQuorum(room);
      drain(room);
      push(room);
    }
  });
}

module.exports = { attach };
