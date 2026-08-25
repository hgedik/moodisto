const SEPARATORS = [' - ', ' – ', ' — ', ' | '];

export interface ParsedVideoTitle {
  readonly artist: string | null;
  readonly title: string;
}

/**
 * Splits "Tarkan - Dudu" into artist and title.
 *
 * YouTube has no artist field, so the best available signal is the uploader's title convention.
 * When the convention is absent the caller falls back to the channel name.
 */
export function parseVideoTitle(rawTitle: string): ParsedVideoTitle {
  const title = rawTitle.trim();
  for (const separator of SEPARATORS) {
    const index = title.indexOf(separator);
    if (index > 0) {
      const artist = title.slice(0, index).trim();
      const remainder = title.slice(index + separator.length).trim();
      if (artist.length > 0 && remainder.length > 0) {
        return { artist, title: remainder };
      }
    }
  }
  return { artist: null, title };
}
