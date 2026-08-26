const VISIBLE_CHARACTERS = 4;
const MASK = '••••';

/**
 * What the panel is allowed to see of a stored secret: enough to tell two keys apart, never
 * enough to use one. Anything short enough for the tail to matter is hidden entirely.
 */
export const secretPreview = (value: string): string | null => {
  if (value.length === 0) {
    return null;
  }
  if (value.length <= VISIBLE_CHARACTERS * 2) {
    return MASK;
  }
  return `${MASK}${value.slice(-VISIBLE_CHARACTERS)}`;
};
