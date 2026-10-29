# Architecture — comment marche Sort my stuffs

> **À lire en premier par toute nouvelle session de travail.** État au 30/10/2026. Ce qui reste à faire est dans
> [ROADMAP.md](ROADMAP.md).

## 1. L'appli

Web app (PWA) en français pour trier petit à petit les **films**, **séries** et **animes** qu'on a vus, sa
wishlist et ses classements, par sessions courtes. Gratuite, sans publicité, open source.

- **Swipe** (deux modes : 4 coins par défaut — ↗ vu 👍, ↘ vu 😐, ↖ envie, ↙ pas envie — ou 2 directions).
  Tirage pondéré par les votes TMDB, filtres (période, genre, langue, note, personne), recommandations des titres
  aimés (« ✨ Comme … »), sagas enchaînées dans l'ordre.
- **Classement** par duels (insertion dichotomique), vérifications entre voisins, **déplacement à la main**
  (poignée ⠿ ou numéro), tier list, partage en image. Même chose pour prioriser la wishlist.
- **Ce soir ?**, **Mes listes**, **ajout manuel**, **stats & badges**.
- **Compte optionnel** (Google ou e-mail) : synchro entre appareils ; **amis** (code ou lien d'invitation) et page
  **« À deux »** : son top, wishlist commune, tirage à deux, conseils croisés, compatibilité.

## 2. Technique

| Élément | Choix |
|---|---|
| Front | Vite, React 19, TypeScript, CSS par écran (`src/styles/`) ; pages chargées à la demande (`App.tsx`) |
| Base locale | IndexedDB via **Dexie** (`src/lib/db.ts`), schéma 3 : `titles`, `details`, `answers`, `meta`, `synced` |
| Catalogue | API **TMDB** depuis le navigateur (`src/lib/tmdb.ts`, `src/lib/sync.ts`) |
| Comptes | **Supabase** (auth + PostgreSQL + règles RLS), schéma dans `supabase/schema.sql`, types dans `src/lib/database.types.ts` |
| Hébergement | **GitHub Pages** (`https://daviddza.github.io/Sort-your-stuffs/`), déployé par GitHub Actions à chaque push sur `main` |
| Secrets | GitHub : `TMDB_TOKEN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (injectés au build en `VITE_…`). En local : `.env.local` (ignoré par git) |
| Tests | **Vitest** (`tests/`, logique + base en mémoire) ; **Playwright** (`e2e/`, appli construite dans le Chrome installé, formats téléphone et PC) |

```
src/
  App.tsx            routeur par ancre (#/swipe/anime, #/rank/tv, #/duo/<id>…), pages chargées à la demande
  lib/               logique et données, sans affichage
    db.ts              base locale, migrations, fiches jointes à la lecture (withDetails)
    category.ts        catégories films / séries / animes
    tmdb.ts sync.ts    API TMDB, téléchargement du catalogue (une requête par seuil)
    ranking.ts         classement : insertion, vérifications, déplacement, séparation des animes
    cloud.ts cloudMerge.ts supabase.ts database.types.ts   compte et synchro
    friends.ts together.ts   amis, comparaison entre deux comptes
    stats badges activity themes tonight recommend tiers share backup settings fun hooks
  components/        Duel, DuelCard, RankedList, TierList, SwipeCard, Fiche, FilterSheet, common…
  pages/             un fichier par écran ; swipe/, settings/ (une rubrique par fichier), duo/ (un onglet par fichier)
supabase/schema.sql  tout le schéma serveur, relançable sans risque
tests/  e2e/         Vitest, Playwright
```

## 3. Données

### 3.1 Base locale (Dexie)

- `titles` : le catalogue TMDB + titres ajoutés à la main. Clé `movie:550` / `tv:1399`. **Sans les fiches
  détaillées** : elles sont dans `details` (même clé), jointes à la lecture par `withDetails` là où il en faut
  (wishlist, ce soir, stats, classement, à deux). Le titre garde deux repères : `detailsAt` (fiche à jour) et
  `collectionId` (saga). Garde-fou : un hook Dexie empêche d'enregistrer une fiche dans un titre.
- `answers` : une réponse par titre (`seen` / `unseen` / `wish`, avis `good` / `meh`, `updatedAt`).
- `meta` : classements `ranking:<catégorie>` et `ranking:wish:<catégorie>`, placement en cours `insert:…`,
  `activity`, `badges`, `boosts:movie|tv`, `saga:<id>`, `min-votes`, `show-anime`, `lastSync`, `lastExport`.
  `setMeta` date chaque écriture (`updatedAt`, pour la synchro).
- `synced` : état de la synchro (voir 4.1).
- `localStorage` : préférences propres à l'appareil (clé TMDB, abonnements, mode de swipe, filtres).

### 3.2 Catégories

Pour TMDB il n'y a que des films et des séries. L'appli distingue **films**, **séries** et **animes** : un anime
est une série TMDB du genre Animation en japonais (`category.ts`, `isAnimeTitle`). Les films d'animation japonais
restent des films. Partout où il s'agit de la catégorie de l'appli, le code dit `category` ; `type` est réservé
au type TMDB (`movie` / `tv`). Les classements anime sont séparés ; `splitAnimeRankings` sort les animes des
classements de séries sans perdre leur ordre (au démarrage, après chaque synchro, après un import).

### 3.3 Catalogue

`syncCatalogue` lance une requête `/discover` par seuil de votes (`catalogueQueries`) : films (1 000), séries
(50), animes (50), titres en français (films 150, séries 20), films d'avant 1980 (150). Un titre est gardé s'il
passe l'un des seuils qui le concernent. Les titres absents du nouveau téléchargement sont **supprimés** — sauf
ceux **vus ou en wishlist** (ajouts manuels compris), qui restent avec leur place dans les classements. Les titres
jamais triés ou « pas vu / pas envie » partent avec leur réponse, donc aussi sur le compte. Les seuils sont
synchronisés pour que deux appareils ne s'effacent pas des titres.

## 4. Compte et amis (Supabase)

### 4.1 Synchro (`cloud.ts`, `cloudMerge.ts`)

Local d'abord : l'appli lit et écrit dans Dexie ; la synchro tourne en arrière-plan (au démarrage, 5 s après une
modification, au retour sur l'onglet ou du réseau, toutes les 2 min).

- Chaque ligne (`a:<clé>` réponse, `m:<clé>` meta) est comparée à son **ombre** (table `synced`, empreinte de la
  dernière version synchronisée) : différente = modifiée sur l'appareil. Marche quel que soit le chemin
  d'écriture (import, effacement, catalogue…).
- Conflit : la date la plus récente gagne (à égalité, le compte) ; activité et badges fusionnés. Suppressions en
  pierres tombales (`deleted`). Relecture de 60 s de recouvrement. La lecture filtre sur son propre `user_id`
  (les règles laissent aussi lire ce que partagent les amis).
- Meta synchronisées : `isUserMeta` (`ranking:`, `saga:`, `boosts:`, `activity`, `badges`, `min-votes`,
  `show-anime`) — les mêmes que la sauvegarde JSON.
- Connexion Google en PKCE (`?code=…`, l'ancre reste au routeur).

### 4.2 Serveur (`supabase/schema.sql`)

Tables `profiles` (pseudo, code ami, partage), `answers`, `user_meta`, `friendships`. Règles RLS : chacun ses
lignes ; un ami lit en lecture seule ce qu'on partage (`share_wishlist` : wishlist et priorités ;
`share_ranking` : titres vus, avis, classements), jamais les « pas envie ». Fonctions : `add_friend`,
`find_friend_code`, `new_friend_code`, `delete_account`. Le script se relance en entier sans risque après chaque
modification (à faire par l'utilisateur dans *SQL Editor*).

Réglages du projet Supabase : URL du site et `http://localhost:5173/**` dans *Authentication → URL
Configuration* ; confirmation d'e-mail désactivée (l'envoi d'e-mails gratuit ne marche que pour l'équipe du
projet) ; fournisseur Google configuré (écran de consentement publié). Facebook abandonné (Meta exige une
entreprise vérifiée).

## 5. Tests et vérifications

- `npx tsc -b`, `npm test` (Vitest), `npm run build` avant chaque push.
- `npm run e2e` : Playwright sur l'appli construite, dans le Chrome installé, formats téléphone (tactile) et PC.
- `npm run e2e:live` : sur le vrai projet Supabase (comptes de test créés puis supprimés) — après toute
  modification de la synchro, des amis ou du schéma.

## 6. Conventions de travail

- Interface, messages de commit et commentaires **en français**, sobres.
- L'utilisateur a un **téléphone Android professionnel** (pas d'APK hors magasin) et utilise aussi l'appli sur
  **PC** : vérifier tout changement visible aux deux formats (393 × 760 tactile et PC).
- L'utilisateur demande en général de **pousser directement sur `main`** une fois vérifié ; vérifier ensuite que
  le déploiement passe. Commits terminés par la ligne `Co-Authored-By` demandée par l'outil.
- Proposer avant d'implémenter quand la demande est ouverte ; garder l'appli utilisable **sans compte** et les
  anciennes sauvegardes importables.
- Jamais de secret dans le dépôt (public) ; coûts d'hébergement à zéro (offres gratuites).
