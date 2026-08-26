import { describe, expect, it } from 'vitest';
import { secretPreview } from '../../src/settings/secret-preview';

describe('secret preview', () => {
  it('shows only the last four characters', () => {
    expect(secretPreview('AIzaSyExampleYoutubeKey')).toBe('••••eKey');
  });

  it('hides a short value completely', () => {
    expect(secretPreview('abcdefgh')).toBe('••••');
    expect(secretPreview('ab')).toBe('••••');
  });

  it('has nothing to show for an empty value', () => {
    expect(secretPreview('')).toBeNull();
  });
});
