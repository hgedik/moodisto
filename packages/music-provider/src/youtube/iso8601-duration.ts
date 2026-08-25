const ISO_8601_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** Converts an ISO 8601 duration such as `PT3M42S` into whole seconds. */
export function parseIso8601DurationSeconds(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const match = ISO_8601_DURATION.exec(value.trim());
  if (match === null) {
    return null;
  }
  const [, days, hours, minutes, seconds] = match;
  const total =
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0);
  return Number.isFinite(total) ? Math.round(total) : null;
}
