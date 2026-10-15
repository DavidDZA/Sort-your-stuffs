import { afterEach, describe, expect, it, vi } from 'vitest';
import { tierize } from '../src/tiers';
import { matchesTonight, NO_FILTERS, pickWeighted, priorityWeight } from '../src/tonight';
import { boostFactor, mergeBoosts } from '../src/recommend';
import { matchesTheme, NO_THEME } from '../src/themes';
import { bestStreak, lastDays, streak } from '../src/activity';
import { matchesSearch, normalize } from '../src/hooks';
import type { Details } from '../src/db';
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
    const film = makeTitle(1, { details: details({ runtime: 100, genres: ['Comédie'], providers: { flatrate: [netflix], rent: [], buy: [], link: null } }) });
    const long = makeTitle(2, { details: details({ runtime: 170 }) });
    const serie = makeTitle(3, {}, 'tv');
    expect(matchesTonight(film, { ...NO_FILTERS, type: 'tv' }, [])).toBe(false);
    expect(matchesTonight(serie, { ...NO_FILTERS, type: 'tv' }, [])).toBe(true);
    expect(matchesTonight(film, { ...NO_FILTERS, mineOnly: true }, [8])).toBe(true);
    expect(matchesTonight(film, { ...NO_FILTERS, mineOnly: true }, [337])).toBe(false);
    expect(matchesTonight(long, { ...NO_FILTERS, short: true }, [])).toBe(false);
    expect(matchesTonight(serie, { ...NO_FILTERS, short: true }, [])).toBe(true); // la durée ne concerne que les films
    expect(matchesTonight(film, { ...NO_FILTERS, genre: 'Comédie' }, [])).toBe(true);
    expect(matchesTonight(long, { ...NO_FILTERS, genre: 'Comédie' }, [])).toBe(false);
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
    expect(matchesTheme(t, { period: '2000', genre: 14, lang: 'fr' })).toBe(true);
    expect(matchesTheme(t, { period: '1990', genre: null, lang: 'all' })).toBe(false);
    expect(matchesTheme(t, { period: 'all', genre: 35, lang: 'all' })).toBe(false);
    expect(matchesTheme(t, { period: 'all', genre: null, lang: 'en' })).toBe(false);
    expect(matchesTheme(t, { period: 'all', genre: null, lang: 'other' })).toBe(false);
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
