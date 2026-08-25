import { describe, expect, it } from 'vitest';
import { foldForMatching, normalizeSearchQuery } from '../src/text/normalize-text';

describe('normalizeSearchQuery', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normalizeSearchQuery('  Tarkan   Dudu ')).toBe('tarkan dudu');
  });

  it('applies Turkish casing rules so that İ maps to i and I maps to ı', () => {
    expect(normalizeSearchQuery('İSTANBUL')).toBe('istanbul');
    expect(normalizeSearchQuery('ISLAK')).toBe('ıslak');
  });

  it('preserves diacritics so that distinct queries keep distinct cache keys', () => {
    expect(normalizeSearchQuery('kız')).toBe('kız');
    expect(normalizeSearchQuery('kiz')).toBe('kiz');
    expect(normalizeSearchQuery('kız')).not.toBe(normalizeSearchQuery('kiz'));
  });
});

describe('foldForMatching', () => {
  it('strips Turkish diacritics for forgiving keyword matching', () => {
    expect(foldForMatching('Şarkı Çöl Ğüzel')).toBe('sarki col guzel');
  });

  it('strips combining accents', () => {
    expect(foldForMatching('Café')).toBe('cafe');
  });

  it('collapses whitespace', () => {
    expect(foldForMatching(' A   B ')).toBe('a b');
  });
});
