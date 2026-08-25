import { foldForMatching } from '../text/normalize-text';

/** The parts of a track a guest might actually type into the search box. */
export interface TrackSearchTextInput {
  readonly title: string;
  readonly artist?: string | null;
  readonly channelName?: string | null;
}

/**
 * Builds the text the local catalogue is searched against.
 *
 * Folding diacritics is what lets someone typing "sarki" find "Şarkı" without spending provider
 * quota. Tokens are kept once each: a video titled "Tarkan - Dudu" uploaded by the "Tarkan"
 * channel would otherwise repeat the artist three times and score higher for the query "tarkan"
 * than the song the guest is actually looking for.
 */
export function buildTrackSearchText(track: TrackSearchTextInput): string {
  const parts = [track.title, track.artist, track.channelName].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  return [...new Set(parts.flatMap(toTokens))].join(' ');
}

/**
 * The shortest token worth matching on.
 *
 * A single letter is a substring of nearly every track ever stored, so requiring it would return
 * the whole catalogue while looking like a real search.
 */
const MIN_TOKEN_LENGTH = 2;

const toTokens = (value: string): string[] =>
  foldForMatching(value)
    .split(' ')
    .map((token) => token.replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter((token) => token.length > 0);

/**
 * Splits a guest's query into the words a catalogue row must contain.
 *
 * Deliberately the same folding rule as {@link buildTrackSearchText}: what is written into the
 * catalogue and what is looked up in it have to meet in the middle, otherwise "Şarkı" is stored
 * one way and searched another. Word order does not matter, which is the whole point — "tarkan
 * dudu" and "dudu tarkan" are one query here, where a query-keyed provider cache sees two.
 *
 * Returns an empty list for a query with nothing to match on; the caller answers with no results
 * rather than with the whole catalogue.
 */
export function tokenizeCatalogueQuery(query: string): string[] {
  const tokens = [...new Set(toTokens(query))];
  const meaningful = tokens.filter((token) => token.length >= MIN_TOKEN_LENGTH);
  // A guest who typed one short word still deserves an answer, so the shorter tokens are only
  // dropped while something longer remains to search on.
  return meaningful.length > 0 ? meaningful : tokens;
}
