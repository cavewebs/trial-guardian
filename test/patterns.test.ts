import { describe, it, expect } from 'vitest';
import {
  extractPrice,
  extractTrialDays,
  extractBillingCycle,
  detectEmailType,
  isLikelySubscriptionEmail,
} from '../src/parsers/patterns.js';

// Regression tests: these used to crash / misbehave because the patterns
// carried the /g flag (String.match returns no capture groups, and
// RegExp.test becomes stateful across calls).

describe('extractPrice', () => {
  it('extracts dollar amounts with capture groups', () => {
    expect(extractPrice('you will be charged $15.99/month')).toEqual({ amount: 15.99, currency: 'USD' });
  });

  it('extracts euro amounts', () => {
    expect(extractPrice('Preis: €9,99 pro Monat')).toEqual({ amount: 9.99, currency: 'EUR' });
  });

  it('returns null when no price is present', () => {
    expect(extractPrice('thanks for signing up!')).toBeNull();
  });
});

describe('extractTrialDays', () => {
  it('extracts "30-day free trial"', () => {
    expect(extractTrialDays('your 30-day free trial is active')).toBe(30);
  });

  it('extracts "free for 14 days"', () => {
    expect(extractTrialDays('enjoy premium free for 14 days')).toBe(14);
  });
});

describe('stateless matching (no /g lastIndex leakage)', () => {
  it('returns identical results on repeated calls with the same input', () => {
    const text = 'billed monthly, renews automatically, free trial ends soon';
    const first = {
      cycle: extractBillingCycle(text),
      type: detectEmailType('Your trial is ending', text),
      likely: isLikelySubscriptionEmail('Your trial is ending', text),
    };
    for (let i = 0; i < 5; i++) {
      expect(extractBillingCycle(text)).toBe(first.cycle);
      expect(detectEmailType('Your trial is ending', text)).toBe(first.type);
      expect(isLikelySubscriptionEmail('Your trial is ending', text)).toBe(first.likely);
    }
  });
});
