# Sort my stuffs

Web app (PWA) pour construire petit à petit la liste des films et séries qu'on a vus, sa wishlist, et son classement.

## Modes

1. **Swiper les films** : un titre à la fois, tiré au hasard (pondéré par la popularité). Droite = vu, gauche = pas vu → second swipe : droite = wishlist, gauche = non.
2. **Swiper les séries** : idem.
3. **Classer les films** : duels entre deux films vus ; chaque film est placé par insertion dichotomique (~log₂(n) duels).
4. **Classer les séries** : idem.
5. **Ajout manuel** : recherche TMDB pour marquer un titre comme vu ou l'ajouter à la wishlist.
6. **Wishlist** : filtre films / séries, priorisation par duels, plateformes de streaming (et filtre « dispo sur mes abonnements »).
7. **Mes listes** : tous les titres vus / pas vus, avec recherche, pour corriger une erreur.
8. **Stats & badges** : décennies, genres, réalisateurs, temps passé, couverture des titres populaires, activité, badges.

Autres fonctions : filtres (période, genre, langue, note TMDB minimum) sur le swipe, le classement, la tier list et la wishlist, sagas enchaînées en entier dans l’ordre de sortie,
fiche complète d'un titre (appui long : durée, note, bande-annonce, où regarder), partage de son top 10 en image,
rappels de sauvegarde et de mise à jour du catalogue, « Ce soir, je regarde quoi ? » (tirage dans la wishlist),
tier list partageable, duels de vérification (les titres « bien » classés en priorité), recommandations d'après les titres aimés, note TMDB sur les cartes.

Exclus : documentaires, courts métrages (< 40 min), émissions (télé-réalité, talk-shows, infos), animes (séries d'animation japonaises) et dessins animés jeunesse. Les films d'animation et les séries animées adultes sont inclus.

## Données

- Catalogue : [TMDB](https://www.themoviedb.org/) (`/discover`), filtré par un nombre minimum de votes (réglable). Mise à jour manuelle depuis les réglages.
- Tout est stocké dans le navigateur (IndexedDB). Penser à **exporter** régulièrement (Réglages → Sauvegarde).
- La clé TMDB n'est jamais dans le code : elle est injectée au déploiement depuis le secret GitHub `TMDB_TOKEN`
  (Settings → Secrets and variables → Actions). Une autre clé peut être saisie dans les réglages (prioritaire).
  En local, sans secret, il faut la saisir dans les réglages.

## Développement

```sh
npm install
npm run dev      # http://localhost:5173 (et accessible depuis le réseau local)
npm run build
npm test         # tests automatiques (Vitest), aussi lancés avant chaque déploiement
```

Stack : Vite, React, TypeScript, Dexie (IndexedDB), vite-plugin-pwa.

### Organisation du code

```
src/
  App.tsx            routeur (#/swipe/movie…) + fenêtres globales (fiche, messages)
  lib/               logique et données, sans affichage
    db.ts              base locale (titres, réponses, réglages internes)
    tmdb.ts            API TMDB : catalogue, fiches, sagas, plateformes
    sync.ts            téléchargement / mise à jour du catalogue
    ranking.ts         classement par insertion dichotomique, vérifications
    stats.ts badges.ts activity.ts   statistiques, badges, séries de jours
    themes.ts tonight.ts recommend.ts tiers.ts   thèmes de swipe, tirage du soir,
                                                  recommandations, tier list
    settings.ts backup.ts share.ts   préférences, sauvegarde, images à partager
    fun.ts hooks.ts    confettis / messages, hooks React partagés
  components/        briques d'interface réutilisées (carte de swipe, duels, listes, fiche…)
  pages/             un fichier par écran ; swipe/ et settings/ découpés en sous-parties
  styles/            un fichier CSS par écran, importés dans l'ordre par index.css
tests/               tests Vitest (logique pure + base en mémoire)
```

## Suite du projet

Comptes, données sur serveur, comparaison entre comptes et appli Android / Play Store :
voir [docs/PLAN-comptes-serveur-android.md](docs/PLAN-comptes-serveur-android.md).

## Déploiement

Chaque push sur `main` déploie sur GitHub Pages via `.github/workflows/deploy.yml`
(Settings → Pages → Source : **GitHub Actions**).

---

This product uses the TMDB API but is not endorsed or certified by TMDB.
