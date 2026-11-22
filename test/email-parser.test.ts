import { describe, it, expect } from 'vitest';
import { parseEmailForSubscription, mergeSubscriptionUpdates } from '../src/parsers/email-parser.js';
import type { ParsedEmail } from '../src/parsers/email-parser.js';
import type { Subscription, EmailReference } from '../src/types.js';

function makeEmail(overrides: Partial<ParsedEmail>): ParsedEmail {
  return {
    messageId: 'msg-1',
    from: 'Netflix <info@account.netflix.com>',
    to: 'user@example.com',
    subject: 'Your free trial has started',
    body: 'Welcome! Your 30-day free trial is active. After the trial you will be charged $15.99/month.',
    date: new Date('2026-07-01T12:00:00Z'),
    headers: {},
    ...overrides,
  };
}

describe('parseEmailForSubscription', () => {
  it('detects a trial signup email', () => {
    const result = parseEmailForSubscription(makeEmail({}), 'user@example.com');

    expect(result.isSubscriptionRelated).toBe(true);
    expect(result.subscription?.serviceName).toBeTruthy();
    expect(result.subscription?.status).toBe('trial');
  });

  it('ignores unrelated email', () => {
    const result = parseEmailForSubscription(
      makeEmail({
        from: 'Aunt Carol <carol@example.com>',
        subject: 'Sunday dinner?',
        body: 'Are you coming over this weekend? Bring the kids!',
      }),
      'user@example.com'
    );

    expect(result.isSubscriptionRelated).toBe(false);
  });
});

describe('mergeSubscriptionUpdates', () => {
  const existing: Subscription = {
    id: 'sub-1',
    serviceName: 'Netflix',
    status: 'trial',
    detectedAt: '2026-06-01T00:00:00Z',
    price: 0,
    currency: 'USD',
    billingCycle: 'monthly',
    nextBillingDate: null,
    trialEndDate: '2026-07-15T00:00:00Z',
    serviceUrl: null,
    accountEmail: 'user@example.com',
    cancellationUrl: null,
    riskScore: 5,
    riskFactors: ['Short trial period'],
    sourceEmails: [],
    reminders: [],
    notes: 'original note',
  };

  const emailRef: EmailReference = {
    messageId: 'msg-2',
    subject: 'Payment received',
    from: 'info@account.netflix.com',
    date: '2026-07-16T00:00:00Z',
    emailAccount: 'user@example.com',
    snippet: '...',
  };

  it('preserves identity and appends the email reference', () => {
    const merged = mergeSubscriptionUpdates(existing, { price: 15.99, status: 'active' }, emailRef);

    expect(merged.id).toBe('sub-1');
    expect(merged.detectedAt).toBe(existing.detectedAt);
    expect(merged.notes).toBe('original note');
    expect(merged.sourceEmails).toHaveLength(1);
    expect(merged.price).toBe(15.99);
    expect(merged.status).toBe('active');
  });

  it('keeps the max risk score and unions risk factors', () => {
    const merged = mergeSubscriptionUpdates(
      existing,
      { riskScore: 3, riskFactors: ['Short trial period', 'High monthly cost'] },
      emailRef
    );

    expect(merged.riskScore).toBe(5);
    expect(merged.riskFactors).toEqual(['Short trial period', 'High monthly cost']);
  });
});
