'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Garde-fous disque pour l'hébergement gratuit.
 *
 * Les médias de ce jeu sont **éphémères par nature** : ils ne servent que
 * le temps d'une partie et sont supprimés avec leur room. Aucun stockage
 * persistant n'est donc nécessaire — le disque éphémère d'un conteneur
 * gratuit suffit. En contrepartie il est petit, d'où le quota ci-dessous.
 */

const UPLOAD_DIR = path.join(process.cwd(), '.data', 'uploads');

const MB = 1024 * 1024;

function envInt(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : fallback;
}

/** Taille max d'un fichier. 15 Mo par défaut : tient sur 512 Mo de RAM. */
const MAX_UPLOAD_BYTES = envInt('MAX_UPLOAD_MB', 15) * MB;

/** Budget disque total pour tous les médias, toutes rooms confondues. */
const DISK_QUOTA_BYTES = envInt('DISK_QUOTA_MB', 400) * MB;

/** @returns {{bytes:number, files:number}} */
function usage() {
  let bytes = 0;
  let files = 0;
  let names;
  try {
    names = fs.readdirSync(UPLOAD_DIR);
  } catch {
    return { bytes: 0, files: 0 };
  }
  for (const name of names) {
    try {
      const st = fs.statSync(path.join(UPLOAD_DIR, name));
      if (st.isFile()) {
        bytes += st.size;
        files += 1;
      }
    } catch {
      /* fichier disparu entre readdir et stat : sans conséquence */
    }
  }
  return { bytes, files };
}

/** Le disque peut-il encore accueillir `size` octets ? */
function hasRoomFor(size) {
  return usage().bytes + size <= DISK_QUOTA_BYTES;
}

/**
 * Nettoyage au démarrage.
 *
 * Les rooms vivent en mémoire : après un redémarrage (ou le réveil d'un
 * service gratuit mis en veille), plus aucune room ne référence les
 * fichiers présents. Ils sont donc tous orphelins, par définition.
 */
function wipeOnBoot() {
  let names;
  try {
    names = fs.readdirSync(UPLOAD_DIR);
  } catch {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    return { removed: 0, freed: 0 };
  }
  let removed = 0;
  let freed = 0;
  for (const name of names) {
    const full = path.join(UPLOAD_DIR, name);
    try {
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      fs.unlinkSync(full);
      removed += 1;
      freed += st.size;
    } catch {
      /* déjà supprimé */
    }
  }
  return { removed, freed };
}

/**
 * Filet de sécurité : supprime les fichiers plus vieux que `maxAgeMs`.
 * La suppression normale se fait à la destruction d'une room ; ceci ne
 * rattrape que ce qu'un crash aurait laissé derrière.
 */
function sweepOld(maxAgeMs) {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  let names;
  try {
    names = fs.readdirSync(UPLOAD_DIR);
  } catch {
    return 0;
  }
  for (const name of names) {
    const full = path.join(UPLOAD_DIR, name);
    try {
      const st = fs.statSync(full);
      if (st.isFile() && st.mtimeMs < cutoff) {
        fs.unlinkSync(full);
        removed += 1;
      }
    } catch {
      /* ignoré */
    }
  }
  return removed;
}

const fmt = (bytes) => `${(bytes / MB).toFixed(1)} Mo`;

module.exports = {
  UPLOAD_DIR,
  MAX_UPLOAD_BYTES,
  DISK_QUOTA_BYTES,
  usage,
  hasRoomFor,
  wipeOnBoot,
  sweepOld,
  fmt,
};
