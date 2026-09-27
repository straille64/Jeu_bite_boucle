# 🎤 Caption Battle

Jeu de mèmes multijoueur en temps réel. Chacun upload un média (photo, GIF, vidéo
ou audio), tout le monde légende les médias des autres, puis on vote. Le plus
drôle rafle la mise.

**3 à 10 joueurs · aucun compte requis · dark mode · pensé mobile d'abord.**

```bash
npm install
npm run dev          # http://localhost:3000
```

Pour jouer avec des amis : **[HEBERGEMENT.md](HEBERGEMENT.md)** (gratuit, 2 minutes).

---

## 1. Architecture globale

Tout tourne dans **un seul process Node** : Next.js (rendu) et Socket.io
(temps réel) partagent le même serveur HTTP. Un seul port, aucun service
externe à provisionner, aucune clé d'API.

```
                    ┌──────────────────────────────────────────┐
   Navigateur       │            server.js  (port 3000)        │
  ┌───────────┐     │                                          │
  │ Next.js   │◄────┼── handle()  ──► pages, /api/upload        │
  │ (React)   │     │                                          │
  │           │◄────┼── media.serve() ──► GET /uploads/*        │
  │ socket.io │◄───►┼── Socket.io  ──► server/socket.js         │
  │  client   │ WS  │                       │                  │
  └───────────┘     │                       ▼                  │
                    │              server/gameEngine.js        │
                    │              (machine à états, pure)     │
                    │                       │                  │
                    │              server/roomManager.js       │
                    │              (Map en mémoire + purge)    │
                    └──────────────────────────────────────────┘
                                            │
                                     .data/uploads/  (disque)
```

### Où vit quoi

| Fichier | Rôle |
|---|---|
| `server.js` | Serveur HTTP unique : Next + Socket.io + médias |
| `server/gameEngine.js` | **Machine à états du jeu.** Fonctions pures sur un objet `room`. Aucune dépendance réseau — donc testable et rejouable seule. |
| `server/socket.js` | Traduit les événements Socket.io en appels du moteur, puis rediffuse l'état |
| `server/roomManager.js` | Registre des rooms en mémoire, purge des rooms inactives et des fichiers orphelins |
| `server/media.js` | Sert `/uploads/*` depuis le disque, avec support des requêtes `Range` |
| `server/constants.js` | Phases, limites, durées, formats acceptés |
| `app/api/upload/route.ts` | Réception du fichier : validation MIME + taille, écriture disque |
| `lib/useGame.ts` | Hook client : socket partagé, état, erreurs, réactions, compte à rebours |
| `components/` | Composants réutilisables (voir §5) |

### Deux décisions structurantes

**1. L'anonymat est tenu par le serveur, pas par l'interface.**
Le serveur ne diffuse jamais l'état brut d'une room. Chaque socket reçoit
`viewFor(room, playerId)`, une projection qui supprime les champs `ownerId` et
`authorId` tant que la phase `reveal` n'est pas atteinte. Un joueur qui ouvre
les devtools ne voit rien de plus qu'un joueur qui regarde l'écran — les
données ne sont simplement pas dans la charge utile.

**2. Les médias ne sont pas servis depuis `public/`.**
En production, Next fige la liste de ses fichiers statiques au moment du build :
un média uploadé après coup renverrait 404. Ils sont donc écrits dans
`.data/uploads/` et servis par `server/media.js`, avant que Next ne prenne la
main. Ce handler gère aussi les requêtes `Range`, sans lesquelles Safari refuse
de lire les vidéos et audios.

---

## 2. Le flow complet d'une partie

```
  ┌────────┐  host démarre   ┌────────┐  tous ont uploadé     ┌─────────┐
  │ LOBBY  │────────────────►│ UPLOAD │───────── ou ─────────►│ CAPTION │◄──┐
  └────────┘  (≥3 joueurs)   └────────┘      timer écoulé      └─────────┘   │
       ▲                                                            │        │
       │                                                 tous ont   │        │
       │                                                 légendé    ▼        │
       │                                                       ┌──────┐      │
       │                                                       │ VOTE │      │
       │                                                       └──────┘      │
       │                                                            │        │
       │                                              tous ont voté │        │
       │                                                            ▼        │
       │                                                      ┌────────┐     │
       │                                                      │ REVEAL │─────┘
       │                                                      └────────┘ média
       │                                                            │    suivant
       │                                          dernier média     │
       │  replay                                                    ▼
       │                            ┌──────────┐  round suivant ┌──────────┐
       └────────────────────────────│ GAME_END │◄───────────────│ ROUND_END│
                                    └──────────┘  dernier round └──────────┘
```

### Phase par phase

**LOBBY** — L'hôte crée la room et reçoit un code à 6 caractères (alphabet sans
`I`, `O`, `0`, `1` pour éviter les confusions à la dictée). Il règle le nombre
de rounds et les durées. Démarrage à partir de 3 joueurs connectés.

**UPLOAD** — Chaque joueur envoie **un seul** média. Le fichier part en HTTP
(`POST /api/upload`, avec barre de progression), puis son URL est annoncée sur
le WebSocket. Les autres voient un compteur `3/5 envoyés` et un bandeau
d'avatars — jamais qui a envoyé quoi. On passe à la suite dès que tout le monde
a uploadé, sans attendre la fin du timer.

**CAPTION** — Les médias sont présentés **un par un**, dans un ordre mélangé.
Tout le monde sauf le propriétaire écrit une caption, avec l'overlay qui se met
à jour pendant la frappe. Le propriétaire, lui, voit son média et attend — le
serveur refuse sa caption s'il essaie quand même. Une caption reste modifiable
tant que le timer tourne.

**VOTE** — Toutes les captions du média s'affichent ensemble, dans un ordre
re-mélangé. Chacun attribue de 1 à 5 étoiles. Sa propre caption est visible mais
marquée et non notable ; un bulletin qui la contient quand même est filtré côté
serveur. Réactions emoji diffusées en direct à toute la room pendant cette
phase.

**REVEAL** — On révèle qui a uploadé le média et qui a écrit quelle caption.

> **Score d'une caption** = somme des étoiles reçues, **+3** si c'est la
> meilleure du média (ex æquo inclus). Le classement se réordonne en direct.

Le scoring est **idempotent** : un média déjà noté ne peut pas être recompté,
même si la phase est jouée deux fois (reconnexion, timer limite).

**ROUND_END** — Classement du round, puis retour en UPLOAD pour le round
suivant.

**GAME_END** — Podium et classement final. L'hôte peut relancer immédiatement
avec la même équipe (scores remis à zéro, personne ne se reconnecte).

### Avancement des phases

Une phase se termine dès que **l'une** de ces conditions est vraie :

- tous les joueurs attendus ont répondu (le cas courant — on n'attend jamais un
  timer pour rien) ;
- le timer est écoulé ;
- l'hôte appuie sur *Passer cette phase*.

Une horloge serveur tourne toutes les 250 ms et fait avancer toutes les rooms.
Le client, lui, ne décide jamais d'un changement de phase : il affiche un compte
à rebours **recalé sur l'horloge serveur**, donc un client en avance ou en
retard reste synchrone.

### Cas limites gérés

| Situation | Comportement |
|---|---|
| Un joueur se déconnecte en pleine partie | Marqué « déco… », garde son score, 90 s pour revenir avant d'être retiré |
| L'hôte part | Le rôle passe automatiquement au premier joueur actif |
| Il ne reste qu'un joueur | La partie retombe proprement au lobby |
| Média sans légendeur possible | Le média est sauté |
| Rechargement de page | `room:sync` resynchronise sans jamais dupliquer le joueur |
| Room inactive 4 h | Room et fichiers supprimés |

---

## 3. Protocole temps réel

**Client → serveur**

| Événement | Charge utile | Effet |
|---|---|---|
| `room:create` | `{ name }` | Crée la room, renvoie le code |
| `room:join` | `{ code, name }` | Rejoint |
| `room:sync` | `{ code, name }` | Resynchronise (navigation / rechargement), idempotent |
| `room:settings` | `{ rounds?, captionSeconds?, voteSeconds? }` | Hôte uniquement |
| `game:start` / `game:replay` / `game:skip` | — | Hôte uniquement |
| `media:submit` | `{ url, kind, name }` | Après l'upload HTTP |
| `caption:submit` | `{ text }` | |
| `vote:submit` | `{ ballot: { captionId: étoiles } }` | |
| `reaction:send` | `{ emoji, captionId? }` | |

**Serveur → client**

| Événement | Charge utile |
|---|---|
| `room:state` | La projection complète pour **ce** joueur (`viewFor`) |
| `game:error` | `{ message }` — affiché en toast non bloquant |
| `reaction:burst` | `{ emoji, captionId }` — hors état, pour rester fluide |

Le serveur diffuse l'état **entier** (projeté) à chaque changement plutôt que
des deltas : à cette taille de charge utile, c'est plus simple et ça élimine
toute possibilité de désynchronisation du client.

---

## 4. Formats acceptés

| Type | Formats | Limite |
|---|---|---|
| Image | JPG, PNG, WebP | 25 Mo |
| GIF | GIF | 25 Mo |
| Vidéo | MP4, WebM, MOV | 25 Mo |
| Audio | MP3, WAV, OGG | 25 Mo |

Le type MIME est validé côté serveur contre une liste blanche, et le nom du
fichier stocké est généré (jamais celui fourni par le client). Les pistes audio
sont accompagnées d'un visualiseur animé, sans quoi l'écran serait vide.

---

## 5. Composants réutilisables

| Composant | Rôle |
|---|---|
| `MediaPlayer` | Lecteur unifié image / GIF / vidéo / audio + overlay de caption |
| `MediaUploader` | Sélection, glisser-déposer, preview locale, barre de progression |
| `CaptionInput` | Saisie avec compteur, envoi à la touche Entrée, overlay en direct |
| `VoteCard` | Une caption à noter : 1–5 étoiles + réactions emoji |
| `Scoreboard` | Classement animé, les lignes se réordonnent en place |
| `Timer` | Compte à rebours circulaire, vire au rose sous 10 s |
| `PhaseShell` | Cadre commun à toutes les phases (titre, timer, progression) |
| `ReactionBar` | Barre d'emojis + gerbe flottante partagée par la room |
| `Lobby` | Code de room, liste des joueurs, réglages de l'hôte |
| `GameScreen` | Aiguillage entre les 5 phases de jeu |

---

## 6. Tests

```bash
node scripts/simulate.js   # machine à états, sans réseau ni navigateur
node scripts/e2e.js        # partie complète : 3 clients + upload HTTP réel
                           # (nécessite un serveur lancé ; PORT=3000 par défaut)
```

`simulate.js` rejoue une partie de bout en bout sur le moteur seul : progression
des phases, scoring, bonus, déconnexion en cours de partie, replay, quorum.

`e2e.js` lance 3 clients Socket.io contre un vrai serveur et vérifie en plus
l'upload HTTP, le service des médias (`Range`, 416, traversée de répertoire),
l'anonymat effectif de la charge utile pendant le vote, le rejet des auto-votes,
la diffusion des réactions et l'absence de doublon à la resynchronisation.

---

## 7. Hébergement

👉 **Guide pas-à-pas : [HEBERGEMENT.md](HEBERGEMENT.md)** — deux voies gratuites,
tunnel Cloudflare (2 min, sans compte) ou Render (adresse permanente).

Le serveur étant **avec état** (rooms en mémoire, WebSocket persistant), il lui
faut un hébergement à process long. Pas de serverless : Vercel et consorts
découpent en fonctions sans état, les rooms seraient perdues entre deux requêtes
et les WebSockets ne tiendraient pas.

```bash
npm run build
npm start          # PORT=8080 npm start pour changer de port
```

### Médias et disque

Les médias sont servis par le jeu lui-même, sans service de stockage externe :
ils sont **éphémères par nature** (supprimés avec leur room, dossier vidé au
démarrage), donc aucun stockage persistant n'est nécessaire — c'est ce qui
permet de rester entièrement gratuit.

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | 3000 | Port d'écoute |
| `MAX_UPLOAD_MB` | 15 | Taille max d'un média (`413` au-delà) |
| `DISK_QUOTA_MB` | 400 | Budget disque total (`507` une fois atteint) |

`GET /api/health` renvoie l'état du service et l'occupation disque.

### Monter en charge

Un seul process suffit pour plusieurs dizaines de parties simultanées. Pour
passer à plusieurs instances, il faudrait sortir l'état des rooms vers Redis et
ajouter un adaptateur Socket.io.
