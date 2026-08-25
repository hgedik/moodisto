'use client';

import { MusicProviderId } from '@moodisto/shared-types';
import type { ProviderPlayerProps, ProviderPlayerRegistry } from './provider-player';
import { StubPlayer } from './stub-player';
import { YouTubePlayer } from './youtube-player';

/**
 * The end-to-end suite drives playback through a stand-in embed. The flag is inlined at build
 * time, so a production bundle only ever contains the real embed.
 */
const useStub = process.env.NEXT_PUBLIC_PLAYER_STUB === '1';

/** Which embed plays which provider. Adding a provider is an entry here, nothing else. */
const registry: ProviderPlayerRegistry = {
  [MusicProviderId.YOUTUBE]: useStub ? StubPlayer : YouTubePlayer,
};

export function TrackPlayer({
  provider,
  ...rest
}: ProviderPlayerProps & { readonly provider: MusicProviderId }) {
  const Player = registry[provider];
  if (!Player) {
    return (
      <p className="rounded-xl border border-danger-500/40 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
        Bu sağlayıcı için oynatıcı tanımlı değil.
      </p>
    );
  }
  return <Player {...rest} />;
}
