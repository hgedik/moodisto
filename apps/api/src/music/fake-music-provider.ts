import { foldForMatching } from '@moodisto/queue-engine';
import { MusicProviderId } from '@moodisto/shared-types';
import type {
  MusicProvider,
  MusicProviderCapabilities,
  MusicSearchOptions,
  PlaybackSource,
  ProviderTrack,
  TrackSearchResult,
} from '@moodisto/music-provider';

const CATALOGUE: readonly TrackSearchResult[] = [
  {
    provider: MusicProviderId.YOUTUBE,
    providerTrackId: 'fake-dudu',
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
 * Offline stand-in for a real provider. It keeps local development and end-to-end tests free of
 * network calls and API quota, and proves the provider port has no YouTube-shaped assumptions.
 */
export class FakeMusicProvider implements MusicProvider {
  readonly id = MusicProviderId.YOUTUBE;
  readonly capabilities = FAKE_CAPABILITIES;

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
