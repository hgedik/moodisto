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
  const tokens = [track.title, track.artist, track.channelName]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .flatMap((part) => foldForMatching(part).split(' '))
    .map((token) => token.replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter((token) => token.length > 0);

  return [...new Set(tokens)].join(' ');
}
