import { SetMetadata } from '@nestjs/common';

export const SKIP_CSRF = 'moodisto:skip-csrf';

/**
 * Exempts a route from the CSRF check. Only for endpoints authenticated by a provider signature
 * instead of a cookie — payment webhooks.
 */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);
