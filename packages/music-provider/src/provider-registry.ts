import type { MusicProviderId } from '@moodisto/shared-types';
import { UnknownMusicProviderError } from './errors';
import type { MusicProvider } from './ports';

/**
 * Resolves a provider adapter by id.
 *
 * Adding a licensed provider means registering one more adapter here; no other layer changes.
 */
export class MusicProviderRegistry {
  private readonly providers = new Map<MusicProviderId, MusicProvider>();

  public constructor(providers: readonly MusicProvider[] = []) {
    for (const provider of providers) {
      this.register(provider);
    }
  }

  public register(provider: MusicProvider): void {
    this.providers.set(provider.id, provider);
  }

  public get(providerId: MusicProviderId): MusicProvider {
    const provider = this.providers.get(providerId);
    if (provider === undefined) {
      throw new UnknownMusicProviderError(providerId);
    }
    return provider;
  }

  public has(providerId: MusicProviderId): boolean {
    return this.providers.has(providerId);
  }

  public list(): MusicProvider[] {
    return [...this.providers.values()];
  }
}
