import { normalizeUrl } from '../../src/discovery/dedupe';

describe('normalizeUrl', () => {
  it('strips protocol differences, www, trailing slash and tracking params', () => {
    expect(normalizeUrl('http://www.example.com/vacancies/')).toBe('https://example.com/vacancies');
    expect(normalizeUrl('https://example.com/vacancies?utm_source=hh&utm_medium=cpc')).toBe(
      'https://example.com/vacancies',
    );
  });

  it('treats http and https as the same resource', () => {
    expect(normalizeUrl('http://example.com/jobs')).toBe(normalizeUrl('https://example.com/jobs'));
  });

  it('keeps non-tracking query params but sorts them for stable comparison', () => {
    expect(normalizeUrl('https://example.com/?b=2&a=1')).toBe(normalizeUrl('https://example.com/?a=1&b=2'));
  });

  it('normalizes an empty path to a single slash', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
  });
});
