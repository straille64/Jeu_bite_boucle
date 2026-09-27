'use strict';

/**
 * Serveur unique : Next.js (rendu) + Socket.io (temps réel) dans le même
 * process. Un seul port, pas de service externe à provisionner.
 */
const { createServer } = require('http');
const next = require('next');
const { Server } = require('socket.io');
const { attach } = require('./server/socket');
const media = require('./server/media');

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || '0.0.0.0';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // Médias uploadés : servis depuis le disque, hors pipeline Next.
    if (media.serve(req, res)) return;
    handle(req, res);
  });

  const io = new Server(server, {
    path: '/api/socket',
    cors: { origin: true },
    maxHttpBufferSize: 1e6,
  });

  attach(io);

  server.listen(port, hostname, () => {
    console.log(`\n  🎤 Caption Battle → http://localhost:${port}  (${dev ? 'dev' : 'prod'})\n`);
  });
});
