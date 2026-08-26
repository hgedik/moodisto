import { foldForMatching } from '@moodisto/queue-engine';
import { MusicProviderId } from '@moodisto/shared-types';
import type {
  MusicProvider,
  MusicProviderCapabilities,
  MusicProviderQuota,
  MusicSearchOptions,
  PlaybackSource,
  ProviderTrack,
  TrackSearchResult,
} from '@moodisto/music-provider';

const CATALOGUE: readonly TrackSearchResult[] = [
  {
    // The one real provider id in this catalogue: a local trial needs a track the embed can
    // actually play. Nothing here reaches the provider, so the rest stay obviously fake.
    provider: MusicProviderId.YOUTUBE,
    providerTrackId: 'SCZgGVqVsbY',
    title: 'Dudu',
    artist: 'Tarkan',
    channelName: 'Tarkan',
    channelId: 'UCfake-tarkan',
    thumbnailUrl: null,
    durationSeconds: 231,
  },
  {
    provider: MusicProviderId.YOUTUBE,
    providerTrackId: 'fake-bir-derdim-var',
    title: 'Bir Derdim Var',
    artist: 'maNga',
    channelName: 'maNga',
    channelId: 'UCfake-manga',
    thumbnailUrl: null,
    durationSeconds: 254,
  },
  {
    provider: MusicProviderId.YOUTUBE,
    providerTrackId: 'fake-papara',
    title: 'Papara',
    artist: 'Teoman',
    channelName: 'Teoman',
    channelId: 'UCfake-teoman',
    thumbnailUrl: null,
    durationSeconds: 275,
  },
  {
    provider: MusicProviderId.YOUTUBE,
    providerTrackId: 'fake-cambaz',
    title: 'Cambaz',
    artist: 'Mor ve Ötesi',
    channelName: 'Mor ve Ötesi',
    channelId: 'UCfake-morveotesi',
    thumbnailUrl: null,
    durationSeconds: 224,
  },
  {
    provider: MusicProviderId.YOUTUBE,
    providerTrackId: 'fake-yaslanmadan',
    title: 'Yaşlanmadan',
    artist: 'Duman',
    channelName: 'Duman',
    channelId: 'UCfake-duman',
    thumbnailUrl: null,
    durationSeconds: 261,
  },
  {
    provider: MusicProviderId.YOUTUBE,
    providerTrackId: 'fake-ben-boyleyim',
    title: 'Ben Böyleyim',
    artist: 'Athena',
    channelName: 'Athena',
    channelId: 'UCfake-athena',
    thumbnailUrl: null,
    durationSeconds: 198,
  },
];

const FAKE_CAPABILITIES: MusicProviderCapabilities = {
  supportsPaidRequests: true,
  requiresVisiblePlayer: true,
  allowsAudioOnlyPlayback: false,
  allowsBackgroundPlayback: false,
  complianceNotes: [
    'Bu sağlayıcı yalnızca geliştirme ve test içindir; gerçek müzik yayını yapmaz.',
  ],
};

/**
 * The fake stands in for YouTube, so it charges what YouTube charges. Development and tests then
 * exercise the same quota arithmetic production does, instead of an unlimited fantasy provider.
 */
export const FAKE_QUOTA: MusicProviderQuota = {
  dailyUnits: 10_000,
  searchUnits: 101,
  trackLookupUnits: 1,
  resetTimeZone: 'America/Los_Angeles',
};

/**
 * Offline stand-in for a real provider. It keeps local development and end-to-end tests free of
 * network calls and API quota, and proves the provider port has no YouTube-shaped assumptions.
 */
export class FakeMusicProvider implements MusicProvider {
  readonly id = MusicProviderId.YOUTUBE;
  readonly capabilities = FAKE_CAPABILITIES;
  readonly quota = FAKE_QUOTA;

  async search(query: string, options: MusicSearchOptions): Promise<TrackSearchResult[]> {
    const needle = foldForMatching(query);
    const matches = CATALOGUE.filter((track) =>
      foldForMatching(`${track.title} ${track.artist ?? ''}`).includes(needle),
    );
    return (matches.length > 0 ? matches : CATALOGUE).slice(0, options.limit).map((track) => ({
      ...track,
    }));
  }

  async getTrack(providerTrackId: string): Promise<ProviderTrack | null> {
    const track = CATALOGUE.find((entry) => entry.providerTrackId === providerTrackId);
    return track ? { ...track, metadata: { source: 'fake' } } : null;
  }

  async getPlaybackSource(providerTrackId: string): Promise<PlaybackSource> {
    return {
      kind: 'EMBEDDED_IFRAME',
      provider: this.id,
      providerTrackId,
      origin: null,
    };
  }
}
