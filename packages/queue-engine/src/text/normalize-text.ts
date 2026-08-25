const TURKISH_UPPERCASE_EXCEPTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/İ/g, 'i'],
  [/I/g, 'ı'],
];

const DIACRITIC_FOLDING: ReadonlyArray<readonly [RegExp, string]> = [
  [/[çÇ]/g, 'c'],
  [/[ğĞ]/g, 'g'],
  [/[ıİ]/g, 'i'],
  [/[öÖ]/g, 'o'],
  [/[şŞ]/g, 's'],
  [/[üÜ]/g, 'u'],
];

const collapseWhitespace = (value: string): string => value.trim().replace(/\s+/g, ' ');

/**
 * Lowercases using Turkish casing rules while preserving diacritics.
 *
 * Used for search cache keys: "kız" and "kiz" are different searches and must not collide.
 */
export function normalizeSearchQuery(value: string): string {
  let result = value;
  for (const [pattern, replacement] of TURKISH_UPPERCASE_EXCEPTIONS) {
    result = result.replace(pattern, replacement);
  }
  return collapseWhitespace(result.toLowerCase());
}

/**
 * Lowercases and strips diacritics.
 *
 * Used for keyword blocking, where a venue typing "sarki" should also catch "şarkı".
 */
export function foldForMatching(value: string): string {
  let result = value;
  for (const [pattern, replacement] of DIACRITIC_FOLDING) {
    result = result.replace(pattern, replacement);
  }
  result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return collapseWhitespace(result.toLowerCase());
}
