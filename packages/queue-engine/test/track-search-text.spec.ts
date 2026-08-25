import { describe, expect, it } from 'vitest';
import { buildTrackSearchText } from '../src/catalogue/track-search-text';

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
