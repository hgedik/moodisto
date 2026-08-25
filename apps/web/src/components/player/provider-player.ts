import type { MusicProviderId } from '@moodisto/shared-types';
import type { ComponentType } from 'react';

/**
 * What the venue player needs from any music provider.
 *
 * The queue is addressed by `provider` + `providerTrackId` everywhere else in the system; this is
 * the single seam where a concrete provider's embed is allowed to exist. Swapping to a licensed
 * provider means adding one component and one entry to the registry.
 */
export interface ProviderPlayerProps {
  readonly providerTrackId: string;
  readonly paused: boolean;
  /** The track reached its natural end; the server decides what plays next. */
  readonly onEnded: () => void;
  readonly onError: (code: string, message: string) => void;
  /** The browser refused to start playback without a fresh user gesture. */
  readonly onBlocked: () => void;
}

export type ProviderPlayerComponent = ComponentType<ProviderPlayerProps>;

export type ProviderPlayerRegistry = Readonly<Record<MusicProviderId, ProviderPlayerComponent>>;
