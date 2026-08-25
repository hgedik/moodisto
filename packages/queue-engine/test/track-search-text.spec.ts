import { describe, expect, it } from 'vitest';
import {
  buildTrackSearchText,
  tokenizeCatalogueQuery,
} from '../src/catalogue/track-search-text';

describe('buildTrackSearchText', () => {
  it('joins the fields a guest is likely to type', () => {
    expect(
      buildTrackSearchText({ title: 'Dudu', artist: 'Tarkan', channelName: 'Tarkan Official' }),
    ).toBe('dudu tarkan official');
  });

  it('folds Turkish diacritics so "sarki" finds "Şarkı"', () => {
    expect(buildTrackSearchText({ title: 'Şarkı Söylemek Lazım', artist: null })).toBe(
      'sarki soylemek lazim',
    );
  });

  it('keeps each token once so a repeated artist name does not skew similarity', () => {
    expect(
      buildTrackSearchText({ title: 'Tarkan - Dudu', artist: 'Tarkan', channelName: 'Tarkan' }),
    ).toBe('tarkan dudu');
  });

  it('drops punctuation that nobody types', () => {
    expect(buildTrackSearchText({ title: 'Kuzu Kuzu (Official Video)', artist: null })).toBe(
      'kuzu official video',
    );
  });

  it('survives a track with nothing but a title', () => {
    expect(buildTrackSearchText({ title: 'Dudu' })).toBe('dudu');
  });
});

describe('tokenizeCatalogueQuery', () => {
  it('splits the query with the same rule the search text is built with', () => {
    expect(tokenizeCatalogueQuery('Tarkan Dudu')).toEqual(['tarkan', 'dudu']);
  });

  it('folds diacritics so the query and the stored text meet in the middle', () => {
    expect(tokenizeCatalogueQuery('Şarkı Söylemek')).toEqual(['sarki', 'soylemek']);
  });

  it('strips punctuation a guest copied from a video title', () => {
    expect(tokenizeCatalogueQuery('Tarkan - Dudu (Official)')).toEqual([
      'tarkan',
      'dudu',
      'official',
    ]);
  });

  it('drops single letters, which would match every track in the catalogue', () => {
    expect(tokenizeCatalogueQuery('a ha')).toEqual(['ha']);
  });

  it('keeps the query usable when every token would be dropped', () => {
    expect(tokenizeCatalogueQuery('a')).toEqual(['a']);
  });

  it('asks for each distinct word once', () => {
    expect(tokenizeCatalogueQuery('dudu DUDU')).toEqual(['dudu']);
  });

  it('returns nothing to match on when the query carries no letters or digits', () => {
    expect(tokenizeCatalogueQuery('!!! ---')).toEqual([]);
  });
});
