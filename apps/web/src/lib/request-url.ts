/**
 * Builds the address of an API call as a string.
 *
 * The base is empty whenever the API answers on the same origin as the page — the deployed bundle
 * knows no address of its own, a reverse proxy puts the two together. A relative address has no
 * origin to parse, so this deliberately concatenates instead of going through `URL`, which refuses
 * anything that is not absolute.
 */
export type QueryValue = string | number | boolean | undefined | null;

export const buildRequestUrl = (
  baseUrl: string,
  path: string,
  query: Readonly<Record<string, QueryValue>> = {},
): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    // An empty string carries no filter, and the API reads a missing parameter the same way.
    if (value === undefined || value === null || value === '') {
      continue;
    }
    search.set(key, String(value));
  }

  const queryString = search.toString();
  return `${baseUrl}/api${path}${queryString ? `?${queryString}` : ''}`;
};
