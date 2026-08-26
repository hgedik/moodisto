/**
 * Keeps one adapter in step with the settings it was built from.
 *
 * Rebuilding is the expensive part — a new HTTP client, a new credential — so it happens only when
 * the settings that shaped the adapter actually differ. Everything the adapters have in common
 * lives here; what differs is the signature each one considers meaningful.
 */
export class RuntimeAdapter<TSettings, TAdapter> {
  private adapter: TAdapter;
  private signature: string;

  constructor(
    initial: TSettings,
    private readonly build: (settings: TSettings) => TAdapter,
    private readonly signatureOf: (settings: TSettings) => string,
  ) {
    this.adapter = build(initial);
    this.signature = signatureOf(initial);
  }

  /** The adapter in hand, for the parts of a contract that cannot wait for a refresh. */
  get current(): TAdapter {
    return this.adapter;
  }

  /** The adapter these settings ask for, rebuilt only when they are not the ones in hand. */
  for(settings: TSettings): TAdapter {
    const signature = this.signatureOf(settings);
    if (signature !== this.signature) {
      this.adapter = this.build(settings);
      this.signature = signature;
    }
    return this.adapter;
  }
}
