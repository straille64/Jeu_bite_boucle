# Image unique pour les hébergeurs qui prennent un Dockerfile
# (Koyeb, Fly.io, Hugging Face Spaces, un VPS…).
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.js ./
COPY --from=build /app/server.js ./
COPY --from=build /app/server ./server
# Disque éphémère : les médias ne survivent pas à un redémarrage, et c'est
# voulu — ils ne servent que le temps d'une partie.
RUN mkdir -p .data/uploads
EXPOSE 3000
CMD ["node", "server.js"]
