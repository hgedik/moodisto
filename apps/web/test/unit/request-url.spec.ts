import { describe, expect, it } from 'vitest';
import { buildRequestUrl } from '../../src/lib/request-url';

describe('buildRequestUrl', () => {
  it('stays relative when the API answers on the page origin', () => {
    // A single domain with a reverse proxy in front of it: the base is empty on purpose, and the
    // call has to remain relative rather than become an address the browser cannot parse.
    expect(buildRequestUrl('', '/venues/cafe-moda')).toBe('/api/venues/cafe-moda');
  });

  it('keeps the relative form once a query is added', () => {
    expect(buildRequestUrl('', '/music/search', { q: 'tarkan', venueSlug: 'cafe-moda' })).toBe(
      '/api/music/search?q=tarkan&venueSlug=cafe-moda',
    );
  });

  it('puts an absolute base in front when the API lives on another origin', () => {
    expect(buildRequestUrl('http://localhost:3001', '/venues/cafe-moda', { table: '1' })).toBe(
      'http://localhost:3001/api/venues/cafe-moda?table=1',
    );
  });

  it('leaves out what the API should not receive, and keeps meaningful falsy values', () => {
    expect(buildRequestUrl('', '/x', { a: '', b: undefined, c: null, d: 0, e: false })).toBe(
      '/api/x?d=0&e=false',
    );
  });

  it('encodes values that would otherwise break the query', () => {
    expect(buildRequestUrl('', '/music/search', { q: 'tarkan & sezen' })).toBe(
      '/api/music/search?q=tarkan+%26+sezen',
    );
  });
});
