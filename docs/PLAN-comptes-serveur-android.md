# Plan : comptes utilisateurs, données sur serveur, comparaison entre comptes, appli Android / Play Store

> **À lire en premier par toute nouvelle session de travail.** Ce document est autonome : il décrit l'appli
> telle qu'elle existe, les conventions du projet, puis le plan des prochaines évolutions, étape par étape.
> État au 29/10/2026 : **phases 1 à 3 implémentées** (comptes e-mail / Google, synchro, amis, « À deux »). Phases 4 et 5 à faire.

---

## 1. Le projet aujourd'hui

### 1.1 L'appli

**Sort my stuffs** est une web app (PWA) personnelle, en français, pour construire petit à petit la liste des
films et séries qu'on a vus, sa wishlist et son classement, par sessions courtes (5–10 min).

- **Swipe** films / séries (deux modes, réglables) :
  - *4 coins* (par défaut) : ↗ vu et bien (👍), ↘ vu et bof (😐), ↖ envie (wishlist), ↙ pas envie ;
  - *2 directions* : vu / pas vu, puis 2ᵉ swipe « aimé ou bof ? » ou « envie ou pas ? ».
- Tirage pondéré par la popularité TMDB, sessions thématiques (période, genre, langue), recommandations TMDB des
  titres aimés tirées plus souvent (« ✨ Comme … »), sagas enchaînées en entier dans l'ordre de sortie
  (étiquette « 🎞️ Saga · 2/8 »), note TMDB sur la carte, résumé, fiche complète (durée, genres, bande-annonce,
  plateformes FR via JustWatch).
- **Classement** par duels (insertion dichotomique, ~log₂ n duels par titre) : les « bien » d'abord, les « bof »
  ensuite ; duels de vérification entre voisins ; « Mon classement » ; tier list S→D ; partage en image.
- **Wishlist** : liste, priorisation par duels, filtre « dispo sur mes abonnements ».
- **Ce soir, je regarde quoi ?** : tirage dans la wishlist pondéré par les priorités.
- **Mes listes** (vus / pas vus, corrections), **ajout manuel** (recherche TMDB), **stats & badges**.
- Réglages : clé TMDB, abonnements, mode de swipe, catalogue (seuils de votes), export / import JSON,
  effacement des choix.

### 1.2 Technique

| Élément | Choix |
|---|---|
| Front | Vite 8, React 19, TypeScript 7, CSS par écran (`src/styles/`) |
| Données | 100 % locales : IndexedDB via **Dexie** (`src/lib/db.ts`) — tables `titles`, `answers`, `meta` |
| Catalogue | API **TMDB** appelée depuis le navigateur (`src/lib/tmdb.ts`, `src/lib/sync.ts`) |
| PWA | `vite-plugin-pwa` (installable, affiches en cache) |
| Hébergement | **GitHub Pages**, dépôt public `DavidDZA/Sort-your-stuffs`, URL `https://daviddza.github.io/Sort-your-stuffs/` |
| Déploiement | GitHub Actions (`.github/workflows/deploy.yml`) à chaque push sur `main` : `npm ci` → `npm test` → build |
| Clé TMDB | secret GitHub `TMDB_TOKEN`, injecté au build (`VITE_TMDB_TOKEN`) ; une clé saisie dans les réglages est prioritaire |
| Tests | **Vitest** (44 tests, `tests/`), `fake-indexeddb` pour la base |

Organisation du code (voir aussi `README.md`) :

```
src/
  App.tsx            routeur par ancre (#/swipe/movie, #/rank/tv…) + fenêtres globales (fiche, messages)
  lib/               logique et données, sans affichage
    db.ts              base locale : Title, Answer (status seen|unseen|wish, tier good|meh), Meta
    tmdb.ts            API TMDB : discover, recherche, fiches détaillées, sagas, plateformes
    sync.ts            téléchargement du catalogue (découpage par dates, limite 500 pages)
    ranking.ts         classement (insertion dichotomique, avis bien/bof, vérifications)
    stats.ts badges.ts activity.ts themes.ts tonight.ts recommend.ts tiers.ts share.ts backup.ts settings.ts fun.ts hooks.ts
  components/        SwipeCard, Duel, RankedList, TierList, Fiche, Toaster, common (Poster, TitleRow…)
  pages/             Home, Rank, Wishlist, Lists, Stats, Tonight, AddManual, swipe/*, settings/*
  styles/            un fichier CSS par écran, importés dans l'ordre par index.css
tests/               Vitest
```

Données locales importantes (table `meta`, clés) : `ranking:movie|tv`, `ranking:wish:movie|tv`,
`insert:…` (placement en cours), `activity` (tris par jour), `badges`, `boosts:movie|tv`, `saga:<id>`,
`lastSync`, `lastExport`. Préférences dans `localStorage` : `tmdb-token`, `min-votes`, `my-providers`,
`swipe-mode`, `swipe-theme:*`, `tonight-filters`.

### 1.3 Conventions de travail (à respecter)

- Interface et messages de commit **en français** ; code commenté en français, sobrement.
- L'utilisateur a un **Redmi Note 11 Pro 5G (HyperOS 1, Android 13), téléphone professionnel** : il ne peut pas
  installer d'APK hors magasin. Il utilise aussi l'appli sur **PC**. Les écrans ont des réglages différents
  PC (souris) / téléphone (tactile) via `@media (hover: hover) and (pointer: fine)` et `useIsDesktop()`.
- Avant chaque push : `npx tsc -b`, `npm test`, `npm run build` ; pour tout changement visible, vérifier par
  captures au format téléphone (393 × 760) et PC (Playwright piloté sur le Chrome installé :
  `C:/Program Files/Google/Chrome/Application/chrome.exe`, avec `npx vite preview`).
- L'utilisateur demande en général de **pousser directement** sur `main` une fois vérifié ; vérifier ensuite que
  le déploiement GitHub Actions passe. Commits terminés par la ligne `Co-Authored-By` demandée par l'outil.
- Proposer avant d'implémenter quand la demande est ouverte (« propose avant »).
- Node est installé dans `C:\Program Files\nodejs` (l'ajouter au PATH du shell si besoin).

---

## 2. Objectifs de la suite

1. **Comptes utilisateurs** (e-mail + mot de passe) et **données stockées sur un serveur** : synchro entre
   appareils (PC ↔ téléphone), plus de sauvegarde manuelle.
2. **Lier des comptes** (amis) et **comparer** : wishlist commune (titres présents dans les deux wishlists),
   « Ce soir à deux », « Tu devrais voir », compatibilité des classements.
3. **Appli Android** publiée sur le **Google Play Store**.

**Contraintes fixées par l'utilisateur** : l'appli reste **entièrement gratuite, sans publicité, sans achat
intégré**, et **open source** (dépôt public). Conséquences : usage non commercial de TMDB, aucun secret dans le
dépôt (clés en secrets GitHub, keystore Android hors dépôt), coûts d'hébergement à garder à zéro (offres
gratuites), choix d'une licence (D7), publication possible aussi sur F-Droid (§ 8.2).

L'ordre conseillé est 1 → 2 → 3 : les comptes sont nécessaires au partage, et une appli Android ne partage pas
les données du navigateur (sans serveur, l'utilisateur perdrait ses données en passant à l'appli).

---

## 3. Décisions à faire valider par l'utilisateur avant de coder

| # | Question | Recommandation |
|---|---|---|
| D1 | Connexion par **e-mail + mot de passe** (demandé) ou lien magique ? | ✅ Validé (29/10) : e-mail + mot de passe avec « mot de passe oublié », **plus Google** (Facebook abandonné : Meta exige une entreprise vérifiée) |
| D2 | Ce qu'un ami peut voir : tout (vus, classement, wishlist) ou une sélection ? | ✅ Validé : réglage par compte, wishlist + top visibles, les vus en option |
| D3 | Public visé : l'utilisateur et quelques proches, ou ouvert à tous ? | ✅ Validé : proches au départ |
| D4 | Garder l'usage **sans compte** (100 % local) ? | ✅ Validé : le compte reste optionnel |
| D5 | Appli Android : **Capacitor** (appli native qui embarque le site) ou **TWA** (le site en plein écran) ? | Capacitor (voir § 7) |
| D6 | Nom de l'appli sur le Play Store, nom de package (ex. `fr.<nom>.sortmystuffs`) | À choisir par l'utilisateur |
| D7 | **Licence open source** du dépôt (fichier `LICENSE` à ajouter) | MIT (simple, permissive) ; GPL-3.0 si l'on veut que les dérivés restent open source |

---

## 4. Phase 1 — Comptes et données sur serveur

### 4.1 Choix : Supabase

Service hébergé (pas de serveur à gérer) : authentification (mots de passe chiffrés, e-mails de
réinitialisation), base **PostgreSQL**, règles d'accès par ligne (**Row Level Security**), fonctions serveur
(Edge Functions). Offre gratuite suffisante (500 Mo de base).

- ⚠️ Offre gratuite : un projet **inactif 7 jours est mis en pause** (données conservées, réactivation manuelle
  dans le tableau de bord). Sans souci en usage régulier ; sinon offre payante.
- Alternatives écartées : Firebase (requêtes de comparaison moins naturelles), serveur perso type PocketBase
  (coût et maintenance d'un serveur).
- Le site reste sur GitHub Pages ; le catalogue TMDB reste téléchargé localement par chaque appareil (identique
  pour tous, inutile de le stocker côté serveur).

### 4.2 Actions de l'utilisateur

1. Créer un compte sur supabase.com, puis un projet (région Europe).
2. Transmettre l'**URL du projet** et la **clé `anon` publique** (faite pour être embarquée dans le site ; la
   sécurité repose sur les règles RLS). Les ajouter comme secrets GitHub `SUPABASE_URL` et `SUPABASE_ANON_KEY`,
   injectés au build (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), comme `TMDB_TOKEN`.
3. Coller le script `supabase/schema.sql` (version définitive du § 4.3) dans l'éditeur SQL de Supabase.
3 bis. Google : créer un client OAuth (Google Cloud Console), redirection
   `https://<projet>.supabase.co/auth/v1/callback`, puis saisir identifiant + secret dans
   *Authentication → Sign In / Providers* (les secrets restent dans Supabase, jamais dans le dépôt).
   Publication de l'écran de consentement : page d'accueil, politique de confidentialité
   (`public/confidentialite.html`) et domaines autorisés obligatoires. Dans l'appli Android (phase 4),
   la connexion Google demandera un lien de retour vers l'appli.
4. Dans *Authentication → URL configuration*, ajouter l'URL du site (pour les liens de réinitialisation).
5. Optionnel : personnaliser les e-mails (en français).

### 4.3 Schéma de base (brouillon à affiner)

```sql
-- Profil public minimal (pseudo, code ami pour les invitations).
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  pseudo text not null,
  friend_code text unique not null default upper(substr(md5(random()::text), 1, 8)),
  share_seen boolean not null default false,      -- visibilité pour les amis (décision D2)
  share_ranking boolean not null default true,
  share_wishlist boolean not null default true,
  created_at timestamptz not null default now()
);

-- Une réponse par titre et par utilisateur. « deleted » = pierre tombale pour synchroniser les suppressions
-- (ex. ↶ Annuler, « reproposer au swipe »). « title » = copie du titre (nom, année, affiche) pour afficher les
-- titres d'un ami absents de son propre catalogue local.
create table answers (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,                                  -- « movie:550 », « tv:1399 »
  type text not null check (type in ('movie', 'tv')),
  status text check (status in ('seen', 'unseen', 'wish')),
  tier text check (tier in ('good', 'meh')),
  title jsonb,
  deleted boolean not null default false,
  client_updated_at timestamptz not null,             -- horodatage de l'appareil : arbitre les conflits
  updated_at timestamptz not null default now(),      -- horodatage serveur : curseur de synchro
  primary key (user_id, key)
);

-- Classements, activité, badges, mises en avant, préférences synchronisées… (même rôle que la table locale `meta`).
create table user_meta (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  value jsonb,
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Amitiés (phase 2). Une ligne par paire, user_a < user_b.
create table friendships (
  user_a uuid not null references auth.users on delete cascade,
  user_b uuid not null references auth.users on delete cascade,
  requested_by uuid not null,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
```

- Déclencheur `updated_at = now()` à chaque écriture (curseur de synchro fiable, indépendant des horloges).
- **RLS** : activée sur toutes les tables. `answers` / `user_meta` : lecture, écriture, suppression de ses propres
  lignes (`user_id = auth.uid()`) ; lecture des lignes d'un ami **accepté** (phase 2), filtrée par les réglages
  de partage du profil. `profiles` : lecture de son profil et de ceux de ses amis ; recherche par `friend_code`
  via une fonction `security definer` qui ne renvoie que le pseudo.
- Index sur `answers (user_id, updated_at)` et `user_meta (user_id, updated_at)`.

### 4.4 Synchronisation (côté appli)

Principe **local d'abord** : l'interface continue de lire et écrire uniquement dans Dexie (rapide, hors ligne) ;
un module `src/lib/cloud.ts` synchronise en arrière-plan.

1. **File d'envoi** : nouvelle table Dexie `outbox` (clé, table, horodatage). Chaque écriture locale
   (`setStatus`, `clearStatus`, `setMeta`…) y ajoute une entrée ; les suppressions deviennent `deleted = true`.
   Point d'entrée naturel : les fonctions de `src/lib/db.ts` (toutes les écritures y passent).
2. **Envoi** : par lots (`upsert`) dès que le réseau est là, au premier plan, et au retour en ligne.
3. **Réception** : à l'ouverture et toutes les quelques minutes, lire les lignes `updated_at > dernier_curseur`
   et les appliquer localement **si** leur `client_updated_at` est plus récent que la version locale
   (« le plus récent gagne », titre par titre ; un classement entier par clé `ranking:*`).
4. **Premier login sur un appareil** :
   - compte vide côté serveur → envoyer toutes les données locales (migration de l'existant) ;
   - compte déjà rempli et données locales présentes → fusion (le plus récent gagne) avec un écran de
     confirmation, ou choix « garder le serveur / garder cet appareil ».
5. **Déconnexion** : proposer de garder ou d'effacer les données locales.
6. Ce qui reste local : catalogue (`titles`, sauf la copie jointe aux réponses), fiches détaillées, cache des
   affiches, préférences purement locales (clé TMDB…).

### 4.5 Écrans

- Réglages → **Compte** : créer un compte (pseudo, e-mail, mot de passe), se connecter, mot de passe oublié,
  se déconnecter, **supprimer son compte** (obligatoire pour le Play Store, § 8), état de la synchro
  (« À jour · il y a 2 min », erreurs).
- Accueil : bandeau discret « Crée un compte pour synchroniser PC et téléphone » tant qu'on n'a pas de compte ;
  le rappel d'export disparaît pour un compte synchronisé.

### 4.6 Tests et critères de réussite

- Tests Vitest de la logique de fusion (pure) : conflits, pierres tombales, classement, premier login.
- Test manuel / Playwright : deux navigateurs connectés au même compte → un swipe sur l'un apparaît sur l'autre
  après synchro ; hors ligne puis retour en ligne ; suppression de compte.
- Aucune régression sans compte (mêmes captures qu'avant).

**Effort : gros** (le cœur du chantier).

### 4.7 Réalisé (29/10/2026)

- `src/lib/cloud.ts` (synchro, état du compte, actions), `src/lib/cloudMerge.ts` (fusion pure, testée),
  `src/lib/supabase.ts` (client, flux PKCE pour ne pas toucher à l'ancre du routeur), écran
  `src/pages/settings/Account.tsx`.
- Pas de file d'envoi : chaque ligne est comparée à une « ombre » (table Dexie `synced`, empreinte de la dernière
  version synchronisée). Différente = modifiée localement ; fonctionne quel que soit le chemin d'écriture
  (import, effacement, mise à jour du catalogue…). Conflit : la date la plus récente gagne (`Answer.updatedAt`,
  `Meta.updatedAt` écrit par `setMeta`) ; activité et badges fusionnés. Relecture de 60 s de recouvrement.
- Lignes meta synchronisées : `isUserMeta` (`ranking:`, `saga:`, `boosts:`, `activity`, `badges`) — les mêmes que
  la sauvegarde. `insert:*`, `lastSync`, `lastExport` restent propres à l'appareil.
- Synchro : au démarrage, 5 s après une modification, au retour sur l'onglet, au retour du réseau, toutes les 2 min.
- ⚠️ La mise à jour du catalogue supprime les titres absents (avec leurs réponses) et cette suppression se propage
  à tous les appareils : des seuils de votes différents entre appareils peuvent effacer des titres partout.
  Piste : synchroniser les seuils (`min-votes`) avec le compte.
- Facebook abandonné : la publication de l'appli Meta exige la vérification d'une entreprise.

---

## 5. Phase 2 — Amis

- **Code ami** (8 caractères, affiché dans Réglages → Compte) et **lien d'invitation**
  `…/#/invite/<code>` : l'autre l'ouvre, se connecte, accepte → ligne `friendships` `accepted`.
- Page **Amis** : liste, invitations reçues / envoyées, retirer un ami, réglages de partage (D2).
- Lecture des données d'un ami : requêtes Supabase directes (pas de copie locale permanente, ou petit cache).
- RLS : un ami ne lit que ce que l'autre partage ; jamais d'écriture chez l'autre.

**Effort : moyen.**

**Réalisé (29/10/2026)** : `src/pages/Friends.tsx`, `src/lib/friends.ts`, SQL dans `supabase/schema.sql`.
- Pas de demande en attente : utiliser le code (ou le lien `#/invite/<code>`) d'un ami crée l'amitié tout de suite
  (partager son code vaut accord) ; « Nouveau code » si un code a trop circulé ; chacun peut retirer l'autre.
- Partage (D2) simplifié en deux réglages : `share_wishlist` (wishlist + priorités) et `share_ranking` (titres
  vus, avis, classement). Les « pas vu / pas envie » ne sont jamais partagés ; `share_seen` n'est pas utilisé.
- La synchro filtre sur `user_id` (les règles RLS laissent aussi lire ce que partagent les amis).

---

## 6. Phase 3 — Comparer deux comptes

Nouvelle page **« À deux »** (depuis la page Amis, choisir un ami) :

1. **Wishlist commune** : titres présents dans les deux wishlists. Ordre = priorités combinées (somme des rangs
   dans les deux classements de wishlist ; un titre non priorisé compte comme le milieu du classement). Filtres
   films / séries, plateformes communes.
2. **« Ce soir à deux »** : le tirage existant (`src/lib/tonight.ts`) appliqué à la wishlist commune, filtré par
   les abonnements des deux.
3. **« Tu devrais voir »** : ce qui est dans ma wishlist (ou pas encore trié) et que l'ami a vu et classé haut ou
   noté 👍, et réciproquement.
4. **Compatibilité** : sur les titres vus par les deux, corrélation de rangs (tau de Kendall) → « 78 % de goûts
   communs », plus gros accords et désaccords.

Calculs côté appli (deux listes de quelques milliers de clés : instantané), ou fonction SQL si besoin.
Logique pure → tests Vitest.

**Effort : moyen.**

**Réalisé (29/10/2026)** : `src/pages/Duo.tsx` (`#/duo/<id ami>`), logique pure dans `src/lib/together.ts`
(testée). Données de l'ami lues à la demande (cache mémoire 5 min). « Ce soir à deux » filtre seulement sur
mes abonnements (ceux de l'ami restent sur son appareil). Compatibilité : tau de Kendall sur les titres classés
par les deux (5 minimum).

---

## 7. Phase 4 — Appli Android

### 7.1 Options

| | **Capacitor** (recommandé) | **TWA** (Trusted Web Activity, ex. via PWABuilder / Bubblewrap) |
|---|---|---|
| Principe | Appli native qui embarque le site compilé (fichiers dans l'APK) | Lanceur natif qui ouvre le site en plein écran dans Chrome |
| Hors ligne | Oui, tout est dans l'appli | Via le service worker de la PWA |
| Fonctions natives | Vibration, partage natif, notifications, bouton Retour, barre d'état… (plugins) | Limitées à celles du web |
| Mises à jour | Nouvelle version à publier sur le Store (ou mise à jour à chaud du contenu web, à encadrer) | Instantanées (c'est le site) |
| Contraintes | Projet Android dans le dépôt, Android Studio pour compiler | Fichier `/.well-known/assetlinks.json` **à la racine du domaine** : impossible sur `daviddza.github.io/Sort-your-stuffs/` sans dépôt `DavidDZA.github.io` ou nom de domaine perso |

**Recommandation : Capacitor** — pas de contrainte de domaine, comportement d'une vraie appli, accès aux
fonctions natives (vibration au swipe, partage du top 10 en natif).

⚠️ Les données d'une appli Android sont **séparées** de celles du navigateur : la phase 1 (compte + synchro)
doit être faite avant, sinon prévoir l'export / import JSON pour la migration.

⚠️ Téléphone professionnel de l'utilisateur : selon la politique de son entreprise, l'installation depuis le
Play Store peut être limitée (Play Store géré). La PWA reste la solution de repli.

### 7.2 Étapes (Capacitor)

1. Installer Android Studio (SDK, émulateur) et un JDK sur le PC.
2. `npm i @capacitor/core @capacitor/cli @capacitor/android`, `npx cap init` (nom, identifiant de package D6),
   `npx cap add android` → dossier `android/` versionné.
3. Build web avec base `./` (le `BASE_PATH` GitHub Pages ne s'applique pas dans l'appli), puis
   `npx cap sync android`.
4. Adapter :
   - routeur par ancre : compatible tel quel ;
   - bouton Retour Android (plugin `@capacitor/app`) : fermer la fiche / revenir à l'accueil ;
   - vibration (`@capacitor/haptics`) au seuil d'un coin, partage natif (`@capacitor/share`) pour les images ;
   - icônes adaptatives et écran de démarrage (`@capacitor/assets`), barre d'état ;
   - désactiver le service worker PWA dans l'appli (inutile, fichiers embarqués) ;
   - liens d'invitation (phase 2) en **App Links** (nécessite aussi un `assetlinks.json` sur un domaine →
     sinon schéma `sortmystuffs://invite/<code>`).
5. Clé TMDB : pour une appli publique, ne plus l'embarquer — passer par une **Edge Function Supabase** qui relaie
   les appels TMDB (la clé reste côté serveur ; limiter le débit par utilisateur).
6. Tester sur émulateur puis sur un téléphone perso (débogage USB).
7. Générer un **Android App Bundle (.aab)** signé (Android Studio → Generate Signed Bundle) ; conserver
   précieusement la clé d'envoi (keystore) et ses mots de passe, hors du dépôt.
8. Optionnel : workflow GitHub Actions qui compile l'AAB (keystore en secret).

**Effort : moyen** (gros si on ajoute beaucoup de natif).

---

## 8. Phase 5 — Publication sur le Google Play Store

### 8.1 Google Play

1. **Compte développeur** Google Play Console : **25 $ une seule fois**, vérification d'identité (pièce
   d'identité, parfois adresse et téléphone ; délai de quelques jours).
2. **Règle des comptes personnels récents** : avant de pouvoir publier en production, un **test fermé avec au
   moins 12 testeurs inscrits pendant 14 jours d'affilée** est exigé (règle en vigueur depuis fin 2024 ;
   à vérifier au moment de la publication). Prévoir de recruter ces testeurs (proches, amis).
3. **Fiche de l'appli** : nom, description courte / longue (français), icône 512 × 512, bannière 1024 × 500,
   captures d'écran téléphone (au moins 2), catégorie (Divertissement), coordonnées.
4. **Obligations** :
   - **Politique de confidentialité** publiée à une URL (une page du site suffit) : données collectées
     (e-mail, pseudo, réponses, classements), hébergeur (Supabase), suppression ;
   - formulaire **Sécurité des données** (Data safety) cohérent avec cette politique ;
   - **suppression de compte** dans l'appli **et** depuis une page web (obligatoire pour toute appli avec
     création de compte) ;
   - questionnaire de **classification du contenu** ;
   - **niveau d'API cible** imposé par Google (Android 15 / API 35 depuis août 2025, en principe Android 16 /
     API 36 pour les nouvelles applis en 2026 — à vérifier dans la Play Console) ;
   - public cible : pas les enfants (évite les règles « Familles »).
5. **Conditions des données tierces** :
   - **TMDB** : mention « This product uses the TMDB API but is not endorsed or certified by TMDB » et logo
     TMDB visibles (déjà présents dans les réglages, à ajouter à la fiche / page « À propos »). L'appli étant
     **gratuite, sans pub ni achat intégré**, c'est un usage non commercial, couvert par la clé API gratuite —
     relire quand même les conditions d'utilisation de l'API avant publication ;
   - **JustWatch** (plateformes) : attribution « Disponibilités : JustWatch » (déjà présente).
6. Dans la Play Console : « Contient des annonces : **non** », aucun achat intégré, appli **gratuite**
   (une appli publiée gratuite ne peut plus devenir payante — sans objet ici).
7. Envoi de l'AAB en **test interne** → **test fermé** (12 testeurs, 14 jours) → demande d'accès à la
   **production** → examen Google (de quelques heures à quelques jours).
8. Ensuite : chaque mise à jour = nouvel AAB avec `versionCode` incrémenté.

### 8.2 Option : F-Droid (magasin d'applis open source)

L'appli étant open source, elle peut aussi être publiée sur **F-Droid** (gratuit, pas de compte développeur
payant, pas de test fermé de 14 jours). F-Droid compile l'appli lui-même depuis le dépôt public : il faut une
licence libre (D7), une compilation reproductible sans dépendance propriétaire (Capacitor et le client Supabase
sont open source ; pas de Google Play Services), et une demande d'inclusion (merge request sur
`gitlab.com/fdroid/fdroiddata`). L'appli serait marquée « NonFreeNet » car elle dépend de services en ligne non
libres (TMDB, Supabase) — c'est autorisé. Utile aussi si le Play Store est bloqué sur un téléphone donné.

**Effort : faible en code, mais 3 à 4 semaines de délais** (vérification, test fermé, examen).

---

## 9. Calendrier indicatif

| Ordre | Phase | Prérequis | Effort |
|---|---|---|---|
| 1 | Comptes + synchro (§ 4) | Projet Supabase créé (§ 4.2) | Gros |
| 2 | Amis (§ 5) | Phase 1 | Moyen |
| 3 | Comparaisons (§ 6) | Phase 2 | Moyen |
| 4 | Appli Android Capacitor (§ 7) | Phase 1 (données) ; Android Studio | Moyen |
| 5 | Play Store (§ 8) | Phase 4 ; compte développeur ; 12 testeurs | Faible + délais |

Les phases 4–5 peuvent démarrer en parallèle des phases 2–3 une fois la phase 1 terminée.

## 10. Risques et points d'attention

- **Synchro** : partie la plus délicate (conflits, suppressions, premier login) → logique pure et testée,
  « le plus récent gagne », pierres tombales.
- **Pause du projet Supabase gratuit** après 7 jours d'inactivité.
- **Vie privée** : les données quittent l'appareil → politique de confidentialité, suppression de compte, partage
  entre amis opt-in.
- **Clé TMDB** dans une appli publique → relais serveur (§ 7.2).
- **Open source** : ne jamais committer de secret (clés, keystore, mots de passe) ; garder les coûts à zéro
  (offres gratuites Supabase / GitHub Pages) puisque l'appli ne rapporte rien.
- **Téléphone pro** de l'utilisateur : le Play Store peut y être restreint ; garder la PWA.
- **Compatibilité ascendante** : l'appli doit rester utilisable sans compte, et les sauvegardes JSON existantes
  doivent rester importables.

## 11. Pour démarrer une nouvelle session

> « Lis `docs/PLAN-comptes-serveur-android.md` et `README.md`. Fais-moi valider les décisions D1 à D4 et D7,
> puis guide-moi pour créer le projet Supabase et commence la phase 1. »
