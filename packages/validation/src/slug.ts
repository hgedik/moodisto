import { MAX_VENUE_SLUG_LENGTH } from './constants';

/**
 * Letters that lose their meaning under a plain accent strip. `ı` and `İ` in particular fold onto
 * the wrong side of the alphabet in a locale-unaware lowercase, so they are named here rather than
 * left to Unicode normalisation.
 */
const TURKISH_FOLDING: Readonly<Record<string, string>> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  I: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
};

/**
 * Turns a venue's name into the address its guests will scan.
 *
 * Only a suggestion — the operator may overwrite it — but it always comes back as something
 * `venueSlugSchema` accepts, so the console never offers an address the API would refuse.
 */
export const slugifyVenueName = (name: string): string =>
  name
    .replace(/[çÇğĞıIİöÖşŞüÜ]/g, (letter) => TURKISH_FOLDING[letter] ?? letter)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_VENUE_SLUG_LENGTH)
    .replace(/^-+|-+$/g, '');
