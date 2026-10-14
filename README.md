# Sort my stuffs

Web app (PWA) pour construire petit à petit la liste des films et séries qu'on a vus, sa wishlist, et son classement.

## Modes

1. **Swiper les films** : un titre à la fois, tiré au hasard (pondéré par la popularité). Droite = vu, gauche = pas vu → second swipe : droite = wishlist, gauche = non.
2. **Swiper les séries** : idem.
3. **Classer les films** : duels entre deux films vus ; chaque film est placé par insertion dichotomique (~log₂(n) duels).
4. **Classer les séries** : idem.
5. **Ajout manuel** : recherche TMDB pour marquer un titre comme vu ou l'ajouter à la wishlist.
6. **Wishlist** : filtre films / séries, bascule d'un titre vers « vu » (il devient alors « non classé »).

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
```

Stack : Vite, React, TypeScript, Dexie (IndexedDB), vite-plugin-pwa.

## Déploiement

Chaque push sur `main` déploie sur GitHub Pages via `.github/workflows/deploy.yml`
(Settings → Pages → Source : **GitHub Actions**).

---

This product uses the TMDB API but is not endorsed or certified by TMDB.
