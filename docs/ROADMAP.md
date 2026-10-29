# Feuille de route — ce qui reste à faire

> État au 30/10/2026. Comment l'appli marche aujourd'hui : [ARCHITECTURE.md](ARCHITECTURE.md).
> Fait : comptes et synchro, amis et « À deux », catégorie Animes, seuils français / vieux films, classement à
> la main, refonte (fiches à part, chargement découpé, types Supabase, tests de bout en bout).

## 1. Décisions en attente

| # | Question | Recommandation |
|---|---|---|
| D5 | Appli Android : **Capacitor** (appli native qui embarque le site) ou **TWA** (le site en plein écran) ? | Capacitor (§ 2) |
| D6 | Nom de l'appli sur le Play Store, nom de package (ex. `fr.<nom>.sortmystuffs`) | À choisir |
| D7 | **Licence open source** du dépôt (fichier `LICENSE`) | MIT (simple, permissive) ; GPL-3.0 si les dérivés doivent rester open source |
| — | Contact sur la page de confidentialité : une adresse e-mail plutôt que les tickets GitHub (publics) ? | À choisir |

## 2. Appli Android

### 2.1 Options

| | **Capacitor** (recommandé) | **TWA** (Trusted Web Activity, ex. via PWABuilder / Bubblewrap) |
|---|---|---|
| Principe | Appli native qui embarque le site compilé (fichiers dans l'APK) | Lanceur natif qui ouvre le site en plein écran dans Chrome |
| Hors ligne | Oui, tout est dans l'appli | Via le service worker de la PWA |
| Fonctions natives | Vibration, partage natif, notifications, bouton Retour, barre d'état… (plugins) | Limitées à celles du web |
| Mises à jour | Nouvelle version à publier sur le Store (ou mise à jour à chaud du contenu web, à encadrer) | Instantanées (c'est le site) |
| Contraintes | Projet Android dans le dépôt, Android Studio pour compiler | Fichier `/.well-known/assetlinks.json` **à la racine du domaine** : impossible sur `daviddza.github.io/Sort-your-stuffs/` sans dépôt `DavidDZA.github.io` ou nom de domaine perso |

**Recommandation : Capacitor** — pas de contrainte de domaine, comportement d'une vraie appli, accès aux
fonctions natives (vibration au swipe, partage du top 10 en natif).

⚠️ Les données d'une appli Android sont **séparées** de celles du navigateur : c'est réglé par le compte et la synchro ;
sans compte, prévoir l'export / import JSON pour la migration.

⚠️ Téléphone professionnel de l'utilisateur : selon la politique de son entreprise, l'installation depuis le
Play Store peut être limitée (Play Store géré). La PWA reste la solution de repli.

### 2.2 Étapes (Capacitor)

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
   - liens d'invitation en **App Links** (nécessite aussi un `assetlinks.json` sur un domaine →
     sinon schéma `sortmystuffs://invite/<code>`).
5. Clé TMDB : pour une appli publique, ne plus l'embarquer — passer par une **Edge Function Supabase** qui relaie
   les appels TMDB (la clé reste côté serveur ; limiter le débit par utilisateur).
6. Tester sur émulateur puis sur un téléphone perso (débogage USB).
7. Générer un **Android App Bundle (.aab)** signé (Android Studio → Generate Signed Bundle) ; conserver
   précieusement la clé d'envoi (keystore) et ses mots de passe, hors du dépôt.
8. Optionnel : workflow GitHub Actions qui compile l'AAB (keystore en secret).

**Effort : moyen** (gros si on ajoute beaucoup de natif).

---

## 3. Publication sur le Google Play Store

### 3.1 Google Play

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

### 3.2 Option : F-Droid (magasin d'applis open source)

L'appli étant open source, elle peut aussi être publiée sur **F-Droid** (gratuit, pas de compte développeur
payant, pas de test fermé de 14 jours). F-Droid compile l'appli lui-même depuis le dépôt public : il faut une
licence libre (§ 1), une compilation reproductible sans dépendance propriétaire (Capacitor et le client Supabase
sont open source ; pas de Google Play Services), et une demande d'inclusion (merge request sur
`gitlab.com/fdroid/fdroiddata`). L'appli serait marquée « NonFreeNet » car elle dépend de services en ligne non
libres (TMDB, Supabase) — c'est autorisé. Utile aussi si le Play Store est bloqué sur un téléphone donné.

**Effort : faible en code, mais 3 à 4 semaines de délais** (vérification, test fermé, examen).

---

## 4. Petites améliorations proposées (non lancées)

- **Code ami** : nouvel essai automatique si le code tiré existe déjà (risque infime aujourd'hui : l'inscription
  échouerait) — quelques lignes dans `schema.sql`.
- **Pseudo** : le demander à la première connexion Google (aujourd'hui : le nom du compte Google, modifiable).
- **Rappel d'export** mensuel même avec un compte (l'offre gratuite Supabase n'a pas de sauvegarde automatique).
- **Statistiques d'usage** : table « sessions » dans Supabase (temps passé par compte), ou mesure d'audience sans
  cookie (GoatCounter, Umami) ; dans les deux cas, mettre à jour la page de confidentialité. En attendant, des
  requêtes SQL sur `auth.users`, `answers` et l'activité synchronisée donnent l'essentiel.
- **Relais TMDB** (fonction Supabase) pour ne plus exposer la clé dans le site — indispensable avant une appli
  publique.
- **Viralité** : lien / QR code sur l'image du top 10, carte de compatibilité à partager, demande de note sur le
  store.

## 5. Pistes plus lointaines

- **Même appli pour la musique** : catalogue Last.fm (top artistes par pays et par style, artistes similaires),
  photos et extraits de 30 s Deezer ; Spotify à éviter (restrictions depuis 2024).
- **Même appli pour les jeux vidéo** : base IGDB (Twitch) — jaquettes, plateformes, séries, jeux similaires,
  « time to beat » ; clé secrète → catalogue préparé par GitHub Actions et fiches via un relais Supabase.
- Dans les deux cas, décider d'abord : appli séparée, ou un « Sort your stuffs » avec plusieurs espaces et un
  cœur commun (comptes, synchro, duels, amis).

## 6. Risques et points d'attention

- **Pause du projet Supabase gratuit** après 7 jours sans activité (données gardées, réactivation manuelle) ;
  pas de sauvegarde automatique téléchargeable dans l'offre gratuite.
- **Mise à jour du catalogue = suppressions propagées** à tous les appareils (choix assumé) : garder les seuils
  synchronisés.
- **Clé TMDB** lisible dans le site (§ 4) ; **téléphone pro** : le Play Store peut y être restreint, garder la PWA.
