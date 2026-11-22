import { describe, it, expect } from 'vitest';
import { formatPrice, normalizeServiceName } from '../src/utils/format.js';

describe('normalizeServiceName', () => {
  it('merges case/whitespace/punctuation variants', () => {
    expect(normalizeServiceName('Netflix ')).toBe('netflix');
    expect(normalizeServiceName('NETFLIX.')).toBe('netflix');
    expect(normalizeServiceName('Adobe  Creative Cloud')).toBe('adobe creative cloud');
  });

  it('keeps distinct services distinct', () => {
    expect(normalizeServiceName('Paramount')).not.toBe(normalizeServiceName('Paramount+'));
    expect(normalizeServiceName('Disney')).not.toBe(normalizeServiceName('Disney+'));
  });
});

describe('formatPrice', () => {
  it('uses known currency symbols', () => {
    expect(formatPrice(15.99, 'USD')).toBe('$15.99');
    expect(formatPrice(9.5, 'EUR')).toBe('€9.50');
  });

  it('falls back to the currency code', () => {
    expect(formatPrice(100, 'NGN')).toBe('NGN 100.00');
  });
});
