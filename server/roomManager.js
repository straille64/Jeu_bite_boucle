'use strict';

const fs = require('fs');
const path = require('path');
const E = require('./gameEngine');
const { LIMITS } = require('./constants');

const { UPLOAD_DIR, sweepOld } = require('./storage');

/** code -> room */
const rooms = new Map();
/** socketId -> { code, playerId } */
const sockets = new Map();

function create() {
  let code = E.makeCode();
  let guard = 0;
  while (rooms.has(code) && guard++ < 50) code = E.makeCode();
  const room = E.createRoom(code);
  rooms.set(code, room);
  return room;
}

function get(code) {
  return rooms.get(String(code || '').toUpperCase().trim()) || null;
}

function bindSocket(socketId, code, playerId) {
  sockets.set(socketId, { code, playerId });
}

function unbindSocket(socketId) {
  const link = sockets.get(socketId);
  sockets.delete(socketId);
  return link || null;
}

function socketLink(socketId) {
  return sockets.get(socketId) || null;
}

function destroy(code) {
  const room = rooms.get(code);
  if (!room) return;
  for (const m of room.medias) deleteUpload(m.url);
  rooms.delete(code);
}

function deleteUpload(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return;
  const base = path.basename(url);
  const full = path.join(UPLOAD_DIR, base);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) return;
  fs.promises.unlink(full).catch(() => {});
}

/** Purge les rooms inactives + les fichiers orphelins. */
function sweep() {
  // Filet de sécurité : fichiers qu'un crash aurait laissés derrière.
  sweepOld(LIMITS.ROOM_TTL_MS);
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.updatedAt > LIMITS.ROOM_TTL_MS || room.players.length === 0) {
      if (room.players.length === 0 && now - room.updatedAt < 60_000) continue; // grâce au démarrage
      destroy(code);
    }
  }
}

function stats() {
  return { rooms: rooms.size, sockets: sockets.size };
}

module.exports = { rooms, create, get, destroy, bindSocket, unbindSocket, socketLink, sweep, stats, deleteUpload, UPLOAD_DIR };
