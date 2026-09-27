/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: false,
  // Les uploads passent par une route handler (app/api/upload) et sont servis
  // par server/media.js — rien à configurer côté statiques Next.
};
