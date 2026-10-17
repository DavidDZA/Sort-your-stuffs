import { afterEach, describe, expect, it, vi } from 'vitest';
import { tierize } from '../src/lib/tiers';
import { matchesTonight, NO_FILTERS, pickWeighted, priorityWeight } from '../src/lib/tonight';
import { availableOnMine, groupProviders, providerFamily, providerLabel, type MyProviders } from '../src/lib/providers';
import { boostFactor, mergeBoosts } from '../src/lib/recommend';
import { isNoTheme, matchesTheme, missingFilterInfo, NO_THEME, themeLabel } from '../src/lib/themes';
import { bestStreak, lastDays, streak } from '../src/lib/activity';
import { matchesSearch, normalize } from '../src/lib/hooks';
import type { Details } from '../src/lib/db';
import { makeTitle } from './helpers';

describe('tier list', () => {
  it('répartit 20 titres en S / A / B / C / D (10 / 20 / 30 / 25 / 15 %)', () => {
    const tiers = tierize(Array.from({ length: 20 }, (_, i) => i));
    expect(tiers.map((t) => t.items.length)).toEqual([2, 4, 6, 5, 3]);
  });

  it('garde tous les titres, dans l’ordre, quelle que soit la taille', () => {
    for (const n of [1, 2, 3, 7, 33, 250]) {
      const list = Array.from({ length: n }, (_, i) => i);
      expect(tierize(list).flatMap((t) => t.items)).toEqual(list);
    }
  });

  it('remplit d’abord les meilleurs paliers quand il y a peu de titres', () => {
    expect(tierize(['a', 'b']).map((t) => t.items.length)).toEqual([1, 1, 0, 0, 0]);
  });
});

describe('ce soir, je regarde quoi ?', () => {
  const details = (extra: Partial<Details>): Details => ({
    fetchedAt: 0,
    directors: [],
    cast: [],
    genres: [],
    rating: null,
    runtime: null,
    providers: { flatrate: [], rent: [], buy: [], link: null },
    ...extra,
  });
  const netflix = { id: 8, name: 'Netflix', logo: null };

  it('filtre par type, abonnements, durée et genre', () => {
    const mine = (families: string[], ids: number[] = []): MyProviders => ({ families: new Set(families), legacyIds: new Set(ids) });
    const none = mine([]);
    const netflixFamily = mine(['netflix']);
    const disneyFamily = mine(['disney+']);
    const film = makeTitle(1, { details: details({ runtime: 100, genres: ['Comédie'], providers: { flatrate: [netflix], rent: [], buy: [], link: null } }) });
    const long = makeTitle(2, { details: details({ runtime: 170 }) });
    const serie = makeTitle(3, {}, 'tv');
    expect(matchesTonight(film, { ...NO_FILTERS, type: 'tv' }, none)).toBe(false);
    expect(matchesTonight(serie, { ...NO_FILTERS, type: 'tv' }, none)).toBe(true);
    expect(matchesTonight(film, { ...NO_FILTERS, mineOnly: true }, netflixFamily)).toBe(true);
    expect(matchesTonight(film, { ...NO_FILTERS, mineOnly: true }, disneyFamily)).toBe(false);
    expect(matchesTonight(long, { ...NO_FILTERS, short: true }, none)).toBe(false);
    expect(matchesTonight(serie, { ...NO_FILTERS, short: true }, none)).toBe(true); // la durée ne concerne que les films
    expect(matchesTonight(film, { ...NO_FILTERS, genre: 'Comédie' }, none)).toBe(true);
    expect(matchesTonight(long, { ...NO_FILTERS, genre: 'Comédie' }, none)).toBe(false);
  });

  it('donne 4 fois plus de chances au n°1 qu’au dernier', () => {
    expect(priorityWeight(0, 10)).toBe(4);
    expect(priorityWeight(9, 10)).toBe(1);
    expect(priorityWeight(undefined, 10)).toBe(2.5);
  });

  it('tire au sort selon les poids', () => {
    const items = [
      { item: 'a', w: 1 },
      { item: 'b', w: 3 },
    ];
    expect(pickWeighted(items, () => 0)).toBe('a');
    expect(pickWeighted(items, () => 0.3)).toBe('b');
    expect(pickWeighted([], () => 0.5)).toBeNull();
  });
});

describe('recommandations', () => {
  it('cumule les recommandations et garde le dernier titre source', () => {
    let b = mergeBoosts({}, ['movie:1', 'movie:2'], 'Inception');
    b = mergeBoosts(b, ['movie:2'], 'Interstellar');
    expect(b).toEqual({ 'movie:1': { s: 1, from: 'Inception' }, 'movie:2': { s: 2, from: 'Interstellar' } });
  });

  it('multiplie le poids au tirage, avec un plafond', () => {
    expect(boostFactor(undefined)).toBe(1);
    expect(boostFactor({ s: 1, from: '' })).toBe(4);
    expect(boostFactor({ s: 10, from: '' })).toBe(13);
  });
});

describe('thèmes de swipe', () => {
  const t = makeTitle(1, { year: 2005, genreIds: [14, 12], originalLanguage: 'fr' });
  it('combine période, genre et langue', () => {
    expect(matchesTheme(t, NO_THEME)).toBe(true);
    expect(matchesTheme(t, { period: '2000', genre: 14, lang: 'fr', minRating: 0 })).toBe(true);
    expect(matchesTheme(t, { period: '1990', genre: null, lang: 'all', minRating: 0 })).toBe(false);
    expect(matchesTheme(t, { period: 'all', genre: 35, lang: 'all', minRating: 0 })).toBe(false);
    expect(matchesTheme(t, { period: 'all', genre: null, lang: 'en', minRating: 0 })).toBe(false);
    expect(matchesTheme(t, { period: 'all', genre: null, lang: 'other', minRating: 0 })).toBe(false);
    const korean = makeTitle(8, { originalLanguage: 'ko' });
    expect(matchesTheme(korean, { ...NO_THEME, lang: 'ko' })).toBe(true);
    expect(matchesTheme(korean, { ...NO_THEME, lang: 'other' })).toBe(false); // le coréen a son propre choix
    expect(matchesTheme(makeTitle(9, { originalLanguage: 'ja' }), { ...NO_THEME, lang: 'other' })).toBe(true);
  });

  it('genre et langue lus dans la fiche détaillée quand le catalogue ne les a pas', () => {
    const base = { fetchedAt: 0, directors: [], cast: [], genres: ['Comédie'], rating: 7, runtime: null, providers: { flatrate: [], rent: [], buy: [], link: null } };
    const old = makeTitle(5, { details: { ...base, genreIds: [35], originalLanguage: 'fr' } }); // catalogue d'avant le 17/10
    expect(matchesTheme(old, { ...NO_THEME, genre: 35 })).toBe(true);
    expect(matchesTheme(old, { ...NO_THEME, lang: 'fr' })).toBe(true);
    expect(matchesTheme(old, { ...NO_THEME, genre: 18 })).toBe(false);
    expect(missingFilterInfo(old)).toBe(false);
    expect(missingFilterInfo(makeTitle(6))).toBe(true); // ni langue ni fiche : à récupérer
    expect(missingFilterInfo(makeTitle(7, { originalLanguage: 'en', details: base }))).toBe(true); // fiche d'avant le 17/10
  });

  it('filtre par note minimum (catalogue, sinon fiche détaillée)', () => {
    const noted = makeTitle(2, { rating: 7.4 });
    const fromDetails = makeTitle(3, { details: { fetchedAt: 0, directors: [], cast: [], genres: [], rating: 8.1, runtime: null, providers: { flatrate: [], rent: [], buy: [], link: null } } });
    const unknown = makeTitle(4);
    const min7 = { ...NO_THEME, minRating: 7 };
    expect(matchesTheme(noted, min7)).toBe(true);
    expect(matchesTheme(noted, { ...NO_THEME, minRating: 7.5 })).toBe(false);
    expect(matchesTheme(fromDetails, min7)).toBe(true);
    expect(matchesTheme(unknown, min7)).toBe(false); // note inconnue : exclu quand on filtre par note
    expect(matchesTheme(unknown, NO_THEME)).toBe(true);
    expect(themeLabel('movie', { ...NO_THEME, genre: 35, minRating: 7.5 })).toBe('Comédie · ⭐ 7,5+');
    // Films et séries mélangés : le genre ne s'applique pas.
    expect(themeLabel(null, { ...NO_THEME, genre: 35 })).toBe('Aucun filtre');
  });

  it('filtre par réalisateur et par acteur (filmographie retenue avec le filtre)', () => {
    const director = { id: 1, name: 'Christopher Nolan', keys: [makeTitle(2).key, makeTitle(3).key] };
    const actor = { id: 2, name: 'Michael Caine', keys: [makeTitle(3).key, makeTitle(4).key] };
    expect(matchesTheme(makeTitle(2), { ...NO_THEME, director })).toBe(true);
    expect(matchesTheme(makeTitle(4), { ...NO_THEME, director })).toBe(false);
    expect(matchesTheme(makeTitle(3), { ...NO_THEME, director, actor })).toBe(true); // les deux
    expect(matchesTheme(makeTitle(2), { ...NO_THEME, director, actor })).toBe(false);
    expect(isNoTheme({ ...NO_THEME, actor })).toBe(false);
    expect(themeLabel('movie', { ...NO_THEME, period: '2010', director, actor })).toBe('2010s · 🎥 Christopher Nolan · 🎭 Michael Caine');
  });
});

describe('activité', () => {
  afterEach(() => vi.useRealTimers());

  it('compte la série en cours et le record', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12));
    const a = { '2026-10-10': 3, '2026-10-11': 1, '2026-10-12': 2, '2026-10-14': 5, '2026-10-15': 1 };
    expect(streak(a)).toBe(2); // 14 et 15
    expect(bestStreak(a)).toBe(3); // 10, 11, 12
    expect(streak({ '2026-10-14': 2 })).toBe(1); // pas encore trié aujourd'hui : la série tient
    expect(lastDays(a, 3).map((d) => d.count)).toEqual([0, 5, 1]);
  });
});

describe('recherche', () => {
  it('ignore accents et majuscules, cherche aussi le titre original', () => {
    expect(normalize('Amélie Poulain')).toBe('amelie poulain');
    const t = makeTitle(1, { title: 'Le Fabuleux Destin d’Amélie Poulain', originalTitle: 'Amélie' });
    expect(matchesSearch(t, 'amelie')).toBe(true);
    expect(matchesSearch(t, 'FABULEUX')).toBe(true);
    expect(matchesSearch(t, 'matrix')).toBe(false);
    expect(matchesSearch(t, '  ')).toBe(true);
  });
});

describe('variantes des plateformes', () => {
  it('regroupe offres avec pub, chaînes Amazon / Apple et écritures du « + »', () => {
    expect(providerLabel('HBO Max Amazon Channel')).toBe('HBO Max');
    expect(providerLabel('Netflix Standard with Ads')).toBe('Netflix');
    expect(providerLabel('Amazon Prime Video with Ads')).toBe('Amazon Prime Video');
    expect(providerLabel('Paramount Plus Apple TV channel')).toBe('Paramount Plus');
    expect(providerFamily('Paramount Plus Premium')).toBe(providerFamily('Paramount+ Amazon Channel'));
    expect(providerFamily('M6plus Amazon Channel')).toBe(providerFamily('M6+'));
    expect(providerFamily('INA  madelen Amazon Channel')).toBe(providerFamily('INA madelen'));
    expect(providerFamily('Disney Plus')).toBe('disney+');
  });

  it('ne mélange pas des services différents', () => {
    expect(providerFamily('Apple TV')).not.toBe(providerFamily('Apple TV Store'));
    expect(providerFamily('Arte')).not.toBe(providerFamily('ARTE VOD'));
    expect(providerFamily('Canal+')).not.toBe(providerFamily('Canal+ Séries'));
  });

  it('une seule entrée par plateforme, et le filtre trouve toutes les variantes', () => {
    const list = [
      { id: 1899, name: 'HBO Max', logo: '/h.png' },
      { id: 1825, name: 'HBO Max Amazon Channel', logo: '/ha.png' },
      { id: 8, name: 'Netflix Standard with Ads', logo: '/n.png' },
    ];
    const groups = groupProviders(list);
    expect(groups.map((g) => g.label)).toEqual(['HBO Max', 'Netflix']);
    expect(groups[0].ids).toEqual([1899, 1825]);
    // Abonné à « Netflix » : un titre seulement sur l'offre avec pub compte quand même.
    expect(availableOnMine(list, { families: new Set(['netflix']), legacyIds: new Set() })).toBe(true);
    // Ancien format (identifiants) toujours reconnu.
    expect(availableOnMine(list, { families: new Set(), legacyIds: new Set([1825]) })).toBe(true);
    expect(availableOnMine(list, { families: new Set(['disney+']), legacyIds: new Set() })).toBe(false);
  });
});
