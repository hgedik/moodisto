import type { TrackSearchResultDto } from '@moodisto/shared-types';
import type { TrackUpsertInput } from '../application/ports';

/** Narrows anything track-shaped down to what a guest's search result is allowed to expose. */
export const toTrackSearchResultDto = (track: TrackUpsertInput): TrackSearchResultDto => ({
  provider: track.provider,
  providerTrackId: track.providerTrackId,
  title: track.title,
  artist: track.artist,
  channelName: track.channelName,
  channelId: track.channelId,
  thumbnailUrl: track.thumbnailUrl,
  durationSeconds: track.durationSeconds,
});
