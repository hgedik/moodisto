import { BlockedRuleType, type MusicProviderId } from '@moodisto/shared-types';
import { foldForMatching } from '../text/normalize-text';

export interface BlockedRule {
  readonly type: BlockedRuleType;
  readonly value: string;
}

export interface MatchableTrack {
  readonly provider: MusicProviderId;
  readonly providerTrackId: string;
  readonly title: string;
  readonly artist: string | null;
  readonly channelName: string | null;
  readonly channelId: string | null;
}

const lower = (value: string): string => value.trim().toLowerCase();

function matchesTrackRule(value: string, track: MatchableTrack): boolean {
  const target = lower(value);
  const separatorIndex = target.indexOf(':');
  if (separatorIndex === -1) {
    return target === lower(track.providerTrackId);
  }
  const provider = target.slice(0, separatorIndex);
  const trackId = target.slice(separatorIndex + 1);
  return provider === lower(track.provider) && trackId === lower(track.providerTrackId);
}

function matchesChannelRule(value: string, track: MatchableTrack): boolean {
  const target = lower(value);
  if (track.channelId !== null && lower(track.channelId) === target) {
    return true;
  }
  return (
    track.channelName !== null && foldForMatching(track.channelName) === foldForMatching(value)
  );
}

function matchesKeywordRule(value: string, track: MatchableTrack): boolean {
  const haystack = foldForMatching(
    [track.title, track.artist, track.channelName].filter(Boolean).join(' '),
  );
  return haystack.includes(foldForMatching(value));
}

/**
 * Returns the first rule that blocks the track, or null when the track may be requested.
 *
 * Returning the rule rather than a boolean lets the caller tell the customer *why* a track is
 * unavailable without re-running the match.
 */
export function findBlockingRule(
  rules: readonly BlockedRule[],
  track: MatchableTrack,
): BlockedRule | null {
  for (const rule of rules) {
    if (rule.value.trim() === '') {
      continue;
    }
    const matches =
      rule.type === BlockedRuleType.TRACK
        ? matchesTrackRule(rule.value, track)
        : rule.type === BlockedRuleType.CHANNEL
          ? matchesChannelRule(rule.value, track)
          : matchesKeywordRule(rule.value, track);
    if (matches) {
      return rule;
    }
  }
  return null;
}

export function isTrackBlocked(rules: readonly BlockedRule[], track: MatchableTrack): boolean {
  return findBlockingRule(rules, track) !== null;
}
