import { describe, expect, it } from 'vitest';
import { slugifyVenueName } from '../src/slug';
import { venueSlugSchema } from '../src/schemas';

/**
 * A venue's slug ends up printed on QR codes, so the suggestion the console offers has to be a
 * valid slug on the first try — an operator typing a Turkish café name should never have to guess
 * what the address bar will accept.
 */
describe('slugifyVenueName', () => {
  it('folds Turkish letters onto their ascii counterparts', () => {
    expect(slugifyVenueName('Çığır Şöleni Öğüt Ünlü')).toBe('cigir-soleni-ogut-unlu');
  });

  it('lowercases the dotted capital I the way Turkish readers expect', () => {
    expect(slugifyVenueName('İSTANBUL Kahve')).toBe('istanbul-kahve');
  });

  it('collapses punctuation and repeated separators into single hyphens', () => {
    expect(slugifyVenueName('  Kadıköy  Kahve & Cafe!!  ')).toBe('kadikoy-kahve-cafe');
  });

  it('truncates to the slug length limit without leaving a trailing hyphen', () => {
    const slug = slugifyVenueName(`${'a'.repeat(63)} bar`);

    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('produces slugs the api will accept', () => {
    expect(venueSlugSchema.safeParse(slugifyVenueName('Beşiktaş Meyhanesi 2')).success).toBe(true);
  });

  it('returns an empty string when nothing survives the folding', () => {
    expect(slugifyVenueName('!!! ???')).toBe('');
  });
});
