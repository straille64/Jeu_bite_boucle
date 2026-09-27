'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Sert les médias uploadés depuis `.data/uploads`.
 *
 * Pourquoi pas `public/` : en production, Next fige la liste des fichiers
 * statiques au moment du build — un média uploadé ensuite renverrait 404.
 * On les sert donc ici, avant de passer la main à Next.
 */
const UPLOAD_DIR = path.join(process.cwd(), '.data', 'uploads');

const TYPES = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

/** @returns {boolean} true si la requête a été traitée ici. */
function serve(req, res) {
  const url = (req.url || '').split('?')[0];
  if (!url.startsWith('/uploads/')) return false;

  let name;
  try {
    name = decodeURIComponent(url.slice('/uploads/'.length));
  } catch {
    res.writeHead(400).end('URL invalide');
    return true;
  }

  // Seuls les noms générés par l'API d'upload passent : pas de traversée.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,5}$/.test(name)) {
    res.writeHead(400).end('Nom de fichier invalide');
    return true;
  }

  const full = path.join(UPLOAD_DIR, name);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) {
    res.writeHead(400).end('Chemin refuse');
    return true;
  }

  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404).end('Media introuvable');
      return;
    }

    const headers = {
      'Content-Type': TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400, immutable',
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
    };

    // Requêtes Range : indispensables au seek vidéo/audio (Safari les exige).
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] !== '' || m[2] !== '')) {
      let start;
      let end;
      if (m[1] === '') {
        // Suffixe : bytes=-500 → les 500 derniers octets
        const n = Number(m[2]);
        start = Math.max(0, stat.size - n);
        end = stat.size - 1;
      } else {
        start = Number(m[1]);
        end = m[2] === '' ? stat.size - 1 : Math.min(Number(m[2]), stat.size - 1);
      }
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': end - start + 1,
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(full, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  });

  return true;
}

module.exports = { serve, UPLOAD_DIR };
