# 🌍 Héberger Caption Battle gratuitement

Deux voies, toutes les deux **100 % gratuites**. Commence par la voie A : c'est
deux commandes et ça marche tout de suite.

---

## Où sont hébergés les médias ? (la question importante)

**Sur le serveur du jeu lui-même, et nulle part ailleurs.** Pas de Cloudinary,
pas d'Uploadthing, pas de compte S3 à ouvrir.

C'est possible parce que **les médias de ce jeu sont éphémères par nature** :

- un média ne sert que pendant la partie où il a été envoyé ;
- il est supprimé dès que sa room est détruite (`server/roomManager.js`) ;
- une room inactive est purgée au bout de 4 h ;
- au démarrage du serveur, le dossier est vidé — les rooms vivant en mémoire,
  tout fichier qui traîne est orphelin par définition (`server/storage.js`).

Donc **aucun stockage persistant n'est nécessaire**. Or c'est précisément le
stockage persistant qui est payant, ou demande une carte bancaire, chez tous
les hébergeurs. En s'en passant, on reste dans le gratuit sans compromis.

Le disque éphémère d'un conteneur gratuit suffit. Il est petit, d'où deux
garde-fous intégrés :

| Réglage | Défaut | Rôle |
|---|---|---|
| `MAX_UPLOAD_MB` | 15 | Taille max d'un média |
| `DISK_QUOTA_MB` | 400 | Budget disque total, toutes rooms confondues |

Au-delà de la limite le serveur répond `413`, et quand le quota est atteint il
répond `507` avec un message clair, plutôt que de saturer le conteneur. La
limite affichée dans l'interface suit automatiquement `MAX_UPLOAD_MB`.

> **Conséquence à connaître** : si le serveur redémarre, les parties en cours
> et leurs médias sont perdus. Pour une soirée entre amis c'est sans
> importance ; c'est le compromis qui rend l'hébergement gratuit possible.

---

## Voie A — Ton PC + tunnel Cloudflare (le plus simple)

**Pour :** jouer ce soir. Prêt en deux minutes, aucun compte, aucune carte.
**Contre :** ton PC doit rester allumé, et l'adresse change à chaque relance.

### 1. Installer `cloudflared`

| Système | Commande |
|---|---|
| Windows | `winget install --id Cloudflare.cloudflared` |
| macOS | `brew install cloudflared` |
| Linux (Debian/Ubuntu) | `sudo apt install cloudflared` |

À défaut, le binaire est ici : <https://github.com/cloudflare/cloudflared/releases>

### 2. Lancer le jeu

```bash
npm install
npm run build
npm start
```

### 3. Ouvrir le tunnel — dans un **second** terminal

```bash
npm run tunnel
```

Cloudflare affiche une adresse du type :

```
https://kind-meme-battle-xyz.trycloudflare.com
```

**C'est le lien à envoyer à tes amis.** Ils l'ouvrent sur leur téléphone, entrent
un pseudo, et rejoignent avec ton code de room. Rien à installer de leur côté.

Le tunnel gère le HTTPS et les WebSockets tout seul. `Ctrl+C` ferme tout.

> Le port par défaut est 3000. Si tu lances le jeu sur un autre port :
> `cloudflared tunnel --url http://localhost:8080`

---

## Voie B — Render (adresse permanente)

**Pour :** une adresse fixe qui marche même ton PC éteint.
**Contre :** le service s'endort après 15 min sans personne ; le premier joueur
à revenir attend ~1 minute de réveil.

Bonne nouvelle : Render maintient un service gratuit éveillé tant qu'il reçoit
des messages **WebSocket**, et pas seulement des requêtes HTTP. Une partie en
cours ne s'endort donc pas au milieu d'un round.

### Étapes

1. Pousse ce dépôt sur GitHub (c'est déjà fait).
2. Crée un compte sur <https://render.com> et connecte ton compte GitHub.
3. **New → Blueprint**, choisis ce dépôt. Render lit `render.yaml` et configure
   tout seul : build, démarrage, sonde de santé, limites disque.
4. Clique **Apply**. Le premier déploiement prend 3 à 5 minutes.
5. Tu obtiens une adresse `https://caption-battle-xxxx.onrender.com` — permanente.

`render.yaml` fixe déjà `MAX_UPLOAD_MB=12` et `DISK_QUOTA_MB=300`, calibrés pour
les 512 Mo de RAM de l'offre gratuite.

> **À vérifier au moment de l'inscription** : les sources publiques se
> contredisent sur l'obligation de renseigner une carte bancaire chez Render.
> Si l'inscription t'en réclame une et que tu n'en veux pas, reste sur la
> voie A, qui n'en demandera jamais.

### Limites de l'offre gratuite Render

| | |
|---|---|
| Heures | 750 h/mois (largement suffisant) |
| Veille | après 15 min sans trafic HTTP **ni** WebSocket |
| Réveil | ~1 minute |
| Disque | éphémère, remis à zéro à chaque déploiement — sans conséquence ici |
| RAM | 512 Mo |

---

## Voie C — Docker (Koyeb, Fly.io, un VPS…)

Un `Dockerfile` est fourni pour tout hébergeur qui accepte une image :

```bash
docker build -t caption-battle .
docker run -p 3000:3000 -e MAX_UPLOAD_MB=12 caption-battle
```

L'image est en deux étapes et ne contient que les dépendances de production.

---

## Vérifier que tout va bien

```bash
curl https://ton-adresse/api/health
```

```json
{
  "ok": true,
  "uptime": 412,
  "disk": { "used": "18.4 Mo", "quota": "300.0 Mo", "files": 6 },
  "maxUploadMb": 12
}
```

---

## Laquelle choisir ?

| | Voie A — Tunnel | Voie B — Render |
|---|---|---|
| Mise en place | 2 min | 5 min |
| Compte à créer | aucun | Render + GitHub |
| Carte bancaire | jamais | à vérifier |
| Adresse | change à chaque lancement | permanente |
| PC allumé | obligatoire | non |
| Latence | excellente | bonne (après réveil) |
| Coût | 0 € | 0 € |

**Pour jouer ce week-end : voie A.** Si le jeu prend et que tu veux un lien
durable à partager : voie B, en gardant la voie A comme repli.
