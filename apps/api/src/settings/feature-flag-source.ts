import type { EffectiveSettings } from './settings-resolver';

export type FeatureFlags = EffectiveSettings['features'];

/**
 * The slice of the settings service a caller sees when all it asks about is a feature flag.
 *
 * `current()` answers from the snapshot already in memory, which is what callers holding a venue
 * lock need: no database round trip while every other guest waits behind them.
 */
export interface FeatureFlagSource {
  current(): { readonly features: FeatureFlags };
}
