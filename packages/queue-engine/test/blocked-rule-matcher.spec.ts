import { describe, expect, it } from 'vitest';
import { BlockedRuleType, MusicProviderId } from '@moodisto/shared-types';
import { findBlockingRule, type MatchableTrack } from '../src/filters/blocked-rule-matcher';

const track: MatchableTrack = {
  provider: MusicProviderId.YOUTUBE,
  providerTrackId: 'abc123',
  title: 'Dudu (Şarkı Remix)',
  artist: 'Tarkan',
  channelName: 'Tarkan Official',
  channelId: 'UCxxxx',
};

describe('findBlockingRule', () => {
  it('returns null when no rule matches', () => {
    expect(findBlockingRule([{ type: BlockedRuleType.KEYWORD, value: 'metal' }], track)).toBeNull();
  });

  it('blocks a track by provider-qualified id', () => {
    const rule = { type: BlockedRuleType.TRACK, value: 'youtube:abc123' };

    expect(findBlockingRule([rule], track)).toEqual(rule);
  });

  it('blocks a track by bare provider track id', () => {
    const rule = { type: BlockedRuleType.TRACK, value: 'abc123' };

    expect(findBlockingRule([rule], track)).toEqual(rule);
  });

  it('does not block a track id that belongs to another provider', () => {
    expect(
      findBlockingRule([{ type: BlockedRuleType.TRACK, value: 'spotify:abc123' }], track),
    ).toBeNull();
  });

  it('blocks by channel id', () => {
    const rule = { type: BlockedRuleType.CHANNEL, value: 'ucxxxx' };

    expect(findBlockingRule([rule], track)).toEqual(rule);
  });

  it('blocks by channel name regardless of casing', () => {
    const rule = { type: BlockedRuleType.CHANNEL, value: 'tarkan official' };

    expect(findBlockingRule([rule], track)).toEqual(rule);
  });

  it('blocks by keyword found in the title', () => {
    const rule = { type: BlockedRuleType.KEYWORD, value: 'remix' };

    expect(findBlockingRule([rule], track)).toEqual(rule);
  });

  it('blocks by keyword ignoring Turkish diacritics', () => {
    const rule = { type: BlockedRuleType.KEYWORD, value: 'sarki' };

    expect(findBlockingRule([rule], track)).toEqual(rule);
  });

  it('blocks by keyword found in the artist name', () => {
    const rule = { type: BlockedRuleType.KEYWORD, value: 'TARKAN' };

    expect(findBlockingRule([rule], track)).toEqual(rule);
  });

  it('ignores blank rule values', () => {
    expect(findBlockingRule([{ type: BlockedRuleType.KEYWORD, value: '   ' }], track)).toBeNull();
  });

  it('returns the first matching rule so the caller can explain the block', () => {
    const rules = [
      { type: BlockedRuleType.KEYWORD, value: 'metal' },
      { type: BlockedRuleType.KEYWORD, value: 'remix' },
      { type: BlockedRuleType.TRACK, value: 'abc123' },
    ];

    expect(findBlockingRule(rules, track)).toEqual(rules[1]);
  });
});
