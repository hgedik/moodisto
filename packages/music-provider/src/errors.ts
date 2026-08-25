export class MusicProviderError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** The provider refused the call because the daily search allowance is exhausted. */
export class MusicProviderQuotaExceededError extends MusicProviderError {
  public constructor(providerId: string) {
    super('MUSIC_PROVIDER_QUOTA_EXCEEDED', `${providerId} search quota is exhausted`);
  }
}

export class MusicProviderUnavailableError extends MusicProviderError {
  public constructor(providerId: string, detail: string) {
    super('MUSIC_PROVIDER_UNAVAILABLE', `${providerId} is unavailable: ${detail}`);
  }
}

export class MusicProviderNotConfiguredError extends MusicProviderError {
  public constructor(providerId: string) {
    super('MUSIC_PROVIDER_NOT_CONFIGURED', `${providerId} has no credentials configured`);
  }
}

export class UnknownMusicProviderError extends MusicProviderError {
  public constructor(providerId: string) {
    super('UNKNOWN_MUSIC_PROVIDER', `No adapter is registered for provider ${providerId}`);
  }
}
