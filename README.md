# Sort my stuffs

Web app (PWA) pour construire petit à petit la liste des films et séries qu'on a vus, sa wishlist, et son classement.

## Modes

1. **Swiper les films** : un titre à la fois, tiré au hasard (pondéré par la popularité). Droite = vu, gauche = pas vu → second swipe : droite = wishlist, gauche = non.
2. **Swiper les séries** : idem.
3. **Classer les films** : duels entre deux films vus ; chaque film est placé par insertion dichotomique (~log₂(n) duels).
4. **Classer les séries** : idem.
5. **Ajout manuel** : recherche par titre, par réalisateur ou par acteur (filmographie complète), pour marquer des titres vus ou les ajouter à la wishlist.
6. **Wishlist** : filtre films / séries, priorisation par duels, plateformes de streaming (et filtre « dispo sur mes abonnements »).
7. **Mes listes** : tous les titres vus / pas vus, avec recherche, pour corriger une erreur.
8. **Stats & badges** : décennies, genres, réalisateurs, acteurs, temps passé, couverture des titres populaires, activité, badges.

Autres fonctions : filtres (période, réalisateur, acteur, genre, langue, note TMDB minimum) sur le swipe, le classement, la tier list et la wishlist, sagas enchaînées en entier dans l’ordre de sortie,
fiche complète d'un titre (appui long : durée, note, bande-annonce, où regarder), partage de son top 10 en image,
rappels de sauvegarde et de mise à jour du catalogue, « Ce soir, je regarde quoi ? » (tirage dans la wishlist),
tier list partageable, duels de vérification (les titres « bien » classés en priorité), recommandations d'après les titres aimés, note TMDB sur les cartes.

Trois catégories : **films**, **séries** et **animes** (séries d'animation japonaises : une série TMDB du genre Animation en japonais ; les films d'animation japonais restent dans les films). Chacune a son swipe, son classement et sa wishlist ; la catégorie Animes peut être masquée (Réglages → Catalogue).

Exclus : documentaires, courts métrages (< 40 min), émissions (télé-réalité, talk-shows, infos) et dessins animés jeunesse.

## Données

- Catalogue : [TMDB](https://www.themoviedb.org/) (`/discover`), filtré par un nombre minimum de votes (réglable). Mise à jour manuelle depuis les réglages.
- Tout est stocké dans le navigateur (IndexedDB). Sans compte, penser à **exporter** régulièrement (Réglages → Sauvegarde).
- **Compte optionnel** (Réglages → Compte : e-mail ou Google) : réponses et classements synchronisés
  entre appareils via [Supabase](https://supabase.com/). Schéma et règles d'accès : [supabase/schema.sql](supabase/schema.sql).
  L'adresse du projet et sa clé publique sont injectées au build (secrets `SUPABASE_URL` et
  `SUPABASE_PUBLISHABLE_KEY`) ; en local, les mettre dans `.env.local` (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`). Sans elles, l'appli fonctionne sans compte.
- **Amis** (avec un compte) : ajout par code ou lien d'invitation, puis page « À deux » : wishlist commune,
  tirage du soir, conseils croisés, compatibilité des classements. Chacun choisit ce qu'il partage.
- La clé TMDB n'est jamais dans le code : elle est injectée au déploiement depuis le secret GitHub `TMDB_TOKEN`
  (Settings → Secrets and variables → Actions). Une autre clé peut être saisie dans les réglages (prioritaire).
  En local, sans secret, il faut la saisir dans les réglages.

## Développement

```sh
npm install
npm run dev      # http://localhost:5173 (et accessible depuis le réseau local)
npm run build
npm test         # tests automatiques (Vitest), aussi lancés avant chaque déploiement
npm run e2e      # tests de bout en bout (Playwright, dans le Chrome installé, formats téléphone et PC)
npm run e2e:live # idem sur le vrai projet Supabase (comptes de test créés puis supprimés)
```

Stack : Vite, React, TypeScript, Dexie (IndexedDB), Supabase (comptes), vite-plugin-pwa, dnd-kit, Playwright.

Fonctionnement détaillé (données, catégories, synchro, amis, conventions) : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Organisation du code

```
src/
  App.tsx            routeur (#/swipe/movie…) + fenêtres globales (fiche, messages)
  lib/               logique et données, sans affichage
    db.ts              base locale (titres, fiches détaillées à part, réponses, réglages internes)
    tmdb.ts            API TMDB : catalogue, fiches, sagas, plateformes
    sync.ts            téléchargement / mise à jour du catalogue
    category.ts        catégories films / séries / animes (un anime reste une série pour TMDB : clé « tv:… »)
    cloud.ts cloudMerge.ts supabase.ts   compte et synchro (fusion pure dans cloudMerge.ts)
    friends.ts together.ts   amis, comparaison entre deux comptes (logique pure dans together.ts)
    ranking.ts         classement par insertion dichotomique, vérifications
    stats.ts badges.ts activity.ts   statistiques, badges, séries de jours
    themes.ts tonight.ts recommend.ts tiers.ts   thèmes de swipe, tirage du soir,
                                                  recommandations, tier list
    settings.ts backup.ts share.ts   préférences, sauvegarde, images à partager
    fun.ts hooks.ts    confettis / messages, hooks React partagés
  components/        briques d'interface réutilisées (carte de swipe, duels, listes, fiche…)
  pages/             un fichier par écran ; swipe/, settings/ et duo/ découpés en sous-parties
  styles/            un fichier CSS par écran, importés dans l'ordre par index.css
tests/               tests Vitest (logique pure + base en mémoire)
e2e/                 tests Playwright (appli construite)
```

## Suite du projet

Ce qui reste à faire (appli Android, Play Store, améliorations proposées, pistes) :
voir [docs/ROADMAP.md](docs/ROADMAP.md).

## Déploiement

Chaque push sur `main` déploie sur GitHub Pages via `.github/workflows/deploy.yml`
(Settings → Pages → Source : **GitHub Actions**).

---

This product uses the TMDB API but is not endorsed or certified by TMDB.
