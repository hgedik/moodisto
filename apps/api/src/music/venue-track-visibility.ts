import { findBlockingRule } from '@moodisto/queue-engine';
import type { Database, TrackUpsertInput } from '../application/ports';

/**
 * Hides the tracks a venue has blocked.
 *
 * Applied at search time, wherever the results came from: a guest who never sees a blocked track
 * never sends a request that can only be rejected. The catalogue is shared between venues, so this
 * filter is what keeps one venue's rules from being bypassed by another venue's search history.
 */
export async function filterTracksBlockedByVenue<T extends TrackUpsertInput>(
  uow: ReturnType<Database['read']>,
  venueId: string,
  results: readonly T[],
): Promise<readonly T[]> {
  const rules = await uow.blockedRules.listByVenue(venueId);
  if (rules.length === 0) {
    return results;
  }
  return results.filter((result) => findBlockingRule(rules, result) === null);
}
