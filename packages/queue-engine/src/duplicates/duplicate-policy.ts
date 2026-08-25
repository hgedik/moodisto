export const DuplicateBlockReason = {
  ALREADY_IN_QUEUE: 'ALREADY_IN_QUEUE',
  COOLDOWN: 'COOLDOWN',
} as const;
export type DuplicateBlockReason = (typeof DuplicateBlockReason)[keyof typeof DuplicateBlockReason];

export interface DuplicateCheckInput {
  readonly trackId: string;
  /** Ids of the tracks currently queued or playing at the venue. */
  readonly activeTrackIds: readonly string[];
  /** When this track last finished playing at the venue, or null if it never did. */
  readonly lastCompletedAt: Date | null;
  readonly cooldownMinutes: number;
  readonly now: Date;
}

export interface DuplicateVerdict {
  readonly blocked: boolean;
  readonly reason: DuplicateBlockReason | null;
  readonly retryAfterSeconds: number | null;
}

const ALLOWED: DuplicateVerdict = Object.freeze({
  blocked: false,
  reason: null,
  retryAfterSeconds: null,
});

/**
 * Decides whether the same track may be requested again right now.
 *
 * A track that is already waiting or playing is always refused; a track that finished recently is
 * refused for as long as the venue's cooldown lasts. Setting the cooldown to zero disables only
 * the second rule.
 */
export function evaluateDuplicate(input: DuplicateCheckInput): DuplicateVerdict {
  if (input.activeTrackIds.includes(input.trackId)) {
    return {
      blocked: true,
      reason: DuplicateBlockReason.ALREADY_IN_QUEUE,
      retryAfterSeconds: null,
    };
  }

  if (input.cooldownMinutes <= 0 || input.lastCompletedAt === null) {
    return ALLOWED;
  }

  const cooldownMs = input.cooldownMinutes * 60_000;
  const elapsedMs = input.now.getTime() - input.lastCompletedAt.getTime();
  if (elapsedMs >= cooldownMs) {
    return ALLOWED;
  }

  return {
    blocked: true,
    reason: DuplicateBlockReason.COOLDOWN,
    retryAfterSeconds: Math.ceil((cooldownMs - elapsedMs) / 1000),
  };
}
