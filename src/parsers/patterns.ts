// Email patterns for detecting subscriptions and trials

import type { SubscriptionPattern } from '../types.js';

// Common patterns that appear across many subscription emails.
// NOTE: deliberately no `g` flag - these are used with .match()[1] and
// .test(), and a global regex breaks both (no capture groups from
// String.match, stateful lastIndex on .test).
export const COMMON_PATTERNS = {
  // Price extraction patterns
  price: [
    /\$(\d+(?:\.\d{2})?)/, // $9.99
    /(\d+(?:\.\d{2})?)\s*(?:USD|dollars)/i, // 9.99 USD
    /€(\d+(?:,\d{2})?)/, // €9,99
    /£(\d+(?:\.\d{2})?)/, // £9.99
  ],

  // Trial period patterns
  trialPeriod: [
    /(\d+)[\s-]*day\s*(?:free\s*)?trial/i,
    /free\s*(?:for\s*)?(\d+)\s*days/i,
    /trial\s*(?:period|ends?)\s*(?:in\s*)?(\d+)\s*days/i,
    /try\s*(?:it\s*)?free\s*for\s*(\d+)\s*days/i,
  ],

  // Date patterns
  date: [
    /(?:on|by|before|until|expires?)\s*(\w+\s+\d{1,2},?\s*\d{4})/i, // January 15, 2026
    /(?:on|by|before|until|expires?)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i, // 01/15/2026
    /(?:on|by|before|until|expires?)\s*(\d{4}-\d{2}-\d{2})/i, // 2026-01-15
  ],

  // Billing cycle patterns
  billingCycle: {
    monthly: /(?:per\s*month|\/month|monthly|\/mo|each\s*month|billed\s*monthly)/i,
    yearly: /(?:per\s*year|\/year|yearly|annually|annual|\/yr|billed\s*yearly)/i,
    weekly: /(?:per\s*week|\/week|weekly|each\s*week|billed\s*weekly)/i,
  },

  // Subscription action keywords
  actions: {
    trialStart: /(?:welcome|started|begun|activated|enjoy\s*your)\s*(?:free\s*)?trial/i,
    subscribed: /(?:subscription|membership)\s*(?:confirmed|active|started|begun)/i,
    renewal: /(?:renewal|renewing|will\s*renew|auto[\s-]*renew)/i,
    trialEnding: /(?:trial|free\s*period)\s*(?:ending|ends|expir)/i,
    priceChange: /(?:price|rate|cost)\s*(?:change|increas|update)/i,
  },
};

// Service-specific patterns
export const SERVICE_PATTERNS: SubscriptionPattern[] = [
  // Streaming Services
  {
    serviceName: 'Netflix',
    senderPatterns: [/netflix/i, /info@mailer\.netflix\.com/i],
    subjectPatterns: [/netflix/i, /your\s*(?:netflix|membership)/i],
    bodyPatterns: [/netflix\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Spotify',
    senderPatterns: [/spotify/i, /no-reply@spotify\.com/i],
    subjectPatterns: [/spotify/i, /premium/i],
    bodyPatterns: [/spotify\.com/i, /premium\s*subscription/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Disney+',
    senderPatterns: [/disney/i, /disneyplus/i],
    subjectPatterns: [/disney\+?/i, /disneyplus/i],
    bodyPatterns: [/disneyplus\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'HBO Max',
    senderPatterns: [/hbo/i, /max\.com/i],
    subjectPatterns: [/hbo\s*max/i, /max\s*subscription/i],
    bodyPatterns: [/hbomax\.com/i, /max\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Amazon Prime',
    senderPatterns: [/amazon/i, /prime/i],
    subjectPatterns: [/prime\s*(?:membership|video)/i, /amazon\s*prime/i],
    bodyPatterns: [/amazon\.com\/prime/i, /prime\s*membership/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Apple TV+',
    senderPatterns: [/apple/i, /no_reply@email\.apple\.com/i],
    subjectPatterns: [/apple\s*tv\+?/i, /apple\s*one/i],
    bodyPatterns: [/tv\.apple\.com/i, /apple\s*tv\+/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'YouTube Premium',
    senderPatterns: [/youtube/i, /google/i],
    subjectPatterns: [/youtube\s*premium/i, /youtube\s*music/i],
    bodyPatterns: [/youtube\.com\/premium/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },

  // Software/SaaS
  {
    serviceName: 'Adobe Creative Cloud',
    senderPatterns: [/adobe/i, /mail\.adobe\.com/i],
    subjectPatterns: [/adobe/i, /creative\s*cloud/i],
    bodyPatterns: [/adobe\.com/i, /creative\s*cloud/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Microsoft 365',
    senderPatterns: [/microsoft/i, /office/i],
    subjectPatterns: [/microsoft\s*365/i, /office\s*365/i],
    bodyPatterns: [/microsoft\.com/i, /office\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Notion',
    senderPatterns: [/notion/i, /team@makenotion\.com/i],
    subjectPatterns: [/notion/i],
    bodyPatterns: [/notion\.so/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Slack',
    senderPatterns: [/slack/i, /feedback@slack\.com/i],
    subjectPatterns: [/slack/i],
    bodyPatterns: [/slack\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Figma',
    senderPatterns: [/figma/i, /noreply@figma\.com/i],
    subjectPatterns: [/figma/i],
    bodyPatterns: [/figma\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Canva',
    senderPatterns: [/canva/i, /hello@canva\.com/i],
    subjectPatterns: [/canva/i, /canva\s*pro/i],
    bodyPatterns: [/canva\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Dropbox',
    senderPatterns: [/dropbox/i, /no-reply@dropbox\.com/i],
    subjectPatterns: [/dropbox/i],
    bodyPatterns: [/dropbox\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'GitHub',
    senderPatterns: [/github/i, /noreply@github\.com/i],
    subjectPatterns: [/github/i, /copilot/i],
    bodyPatterns: [/github\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'ChatGPT Plus',
    senderPatterns: [/openai/i, /noreply@email\.openai\.com/i],
    subjectPatterns: [/openai/i, /chatgpt/i, /plus/i],
    bodyPatterns: [/openai\.com/i, /chatgpt/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Claude Pro',
    senderPatterns: [/anthropic/i, /claude/i],
    subjectPatterns: [/anthropic/i, /claude/i],
    bodyPatterns: [/anthropic\.com/i, /claude\.ai/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },

  // News/Media
  {
    serviceName: 'New York Times',
    senderPatterns: [/nytimes/i, /nyt/i],
    subjectPatterns: [/new\s*york\s*times/i, /nytimes/i],
    bodyPatterns: [/nytimes\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Wall Street Journal',
    senderPatterns: [/wsj/i, /wall\s*street/i],
    subjectPatterns: [/wall\s*street\s*journal/i, /wsj/i],
    bodyPatterns: [/wsj\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Medium',
    senderPatterns: [/medium/i, /noreply@medium\.com/i],
    subjectPatterns: [/medium/i, /membership/i],
    bodyPatterns: [/medium\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },

  // Fitness/Health
  {
    serviceName: 'Peloton',
    senderPatterns: [/peloton/i],
    subjectPatterns: [/peloton/i],
    bodyPatterns: [/onepeloton\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Headspace',
    senderPatterns: [/headspace/i],
    subjectPatterns: [/headspace/i],
    bodyPatterns: [/headspace\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Calm',
    senderPatterns: [/calm/i, /hello@calm\.com/i],
    subjectPatterns: [/calm/i],
    bodyPatterns: [/calm\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },

  // Audio
  {
    serviceName: 'Audible',
    senderPatterns: [/audible/i, /amazon/i],
    subjectPatterns: [/audible/i],
    bodyPatterns: [/audible\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },

  // Gaming
  {
    serviceName: 'Xbox Game Pass',
    senderPatterns: [/xbox/i, /microsoft/i],
    subjectPatterns: [/xbox/i, /game\s*pass/i],
    bodyPatterns: [/xbox\.com/i, /game\s*pass/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'PlayStation Plus',
    senderPatterns: [/playstation/i, /sony/i],
    subjectPatterns: [/playstation/i, /ps\s*plus/i],
    bodyPatterns: [/playstation\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Nintendo Switch Online',
    senderPatterns: [/nintendo/i],
    subjectPatterns: [/nintendo/i, /switch\s*online/i],
    bodyPatterns: [/nintendo\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },

  // Developer Tools
  {
    serviceName: 'Vercel',
    senderPatterns: [/vercel/i, /ship@vercel\.com/i],
    subjectPatterns: [/vercel/i],
    bodyPatterns: [/vercel\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Netlify',
    senderPatterns: [/netlify/i],
    subjectPatterns: [/netlify/i],
    bodyPatterns: [/netlify\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'DigitalOcean',
    senderPatterns: [/digitalocean/i],
    subjectPatterns: [/digitalocean/i],
    bodyPatterns: [/digitalocean\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },

  // VPN/Security
  {
    serviceName: 'NordVPN',
    senderPatterns: [/nordvpn/i],
    subjectPatterns: [/nordvpn/i],
    bodyPatterns: [/nordvpn\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: '1Password',
    senderPatterns: [/1password/i],
    subjectPatterns: [/1password/i],
    bodyPatterns: [/1password\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'LastPass',
    senderPatterns: [/lastpass/i],
    subjectPatterns: [/lastpass/i],
    bodyPatterns: [/lastpass\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },

  // E-commerce
  {
    serviceName: 'Costco',
    senderPatterns: [/costco/i],
    subjectPatterns: [/costco/i, /membership/i],
    bodyPatterns: [/costco\.com/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
  {
    serviceName: 'Amazon Subscribe & Save',
    senderPatterns: [/amazon/i],
    subjectPatterns: [/subscribe\s*&?\s*save/i],
    bodyPatterns: [/amazon\.com/i, /subscribe.*save/i],
    pricePatterns: COMMON_PATTERNS.price,
    datePatterns: COMMON_PATTERNS.date,
    type: 'subscription_confirmation',
  },
];

// Generic patterns for unknown services
export const GENERIC_SUBSCRIPTION_PATTERNS = {
  subjectKeywords: [
    /subscription/i,
    /trial/i,
    /membership/i,
    /billing/i,
    /payment/i,
    /receipt/i,
    /invoice/i,
    /renewal/i,
    /welcome.*(?:trial|premium|pro)/i,
    /your.*plan/i,
    /order\s*confirm/i,
  ],
  bodyKeywords: [
    /free\s*trial/i,
    /subscription\s*(?:started|confirmed|active)/i,
    /billed?\s*(?:monthly|annually|yearly)/i,
    /auto[\s-]*renew/i,
    /cancel\s*(?:anytime|before)/i,
    /next\s*(?:billing|payment|charge)/i,
    /your\s*(?:plan|membership|subscription)/i,
  ],
};

export function matchServiceFromEmail(
  from: string,
  subject: string,
  body: string
): { serviceName: string; pattern: SubscriptionPattern } | null {
  // Try to match against known service patterns
  for (const pattern of SERVICE_PATTERNS) {
    const senderMatch = pattern.senderPatterns.some((p) => p.test(from));
    const subjectMatch = pattern.subjectPatterns.some((p) => p.test(subject));
    const bodyMatch = pattern.bodyPatterns.some((p) => p.test(body));

    // Require sender match + (subject OR body match)
    if (senderMatch && (subjectMatch || bodyMatch)) {
      return { serviceName: pattern.serviceName, pattern };
    }
  }

  return null;
}

export function isLikelySubscriptionEmail(subject: string, body: string): boolean {
  const subjectMatch = GENERIC_SUBSCRIPTION_PATTERNS.subjectKeywords.some((p) =>
    p.test(subject)
  );
  const bodyMatch = GENERIC_SUBSCRIPTION_PATTERNS.bodyKeywords.some((p) =>
    p.test(body)
  );

  return subjectMatch || bodyMatch;
}

export function extractPrice(text: string): { amount: number; currency: string } | null {
  // Try each price pattern
  for (const pattern of COMMON_PATTERNS.price) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseFloat(match[1].replace(',', '.'));
      let currency = 'USD';

      if (pattern.source.includes('€')) currency = 'EUR';
      else if (pattern.source.includes('£')) currency = 'GBP';

      return { amount, currency };
    }
  }

  return null;
}

export function extractBillingCycle(
  text: string
): 'monthly' | 'yearly' | 'weekly' | 'one-time' {
  if (COMMON_PATTERNS.billingCycle.yearly.test(text)) return 'yearly';
  if (COMMON_PATTERNS.billingCycle.weekly.test(text)) return 'weekly';
  if (COMMON_PATTERNS.billingCycle.monthly.test(text)) return 'monthly';

  return 'monthly'; // Default assumption
}

export function extractTrialDays(text: string): number | null {
  for (const pattern of COMMON_PATTERNS.trialPeriod) {
    const match = text.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

export function detectEmailType(
  subject: string,
  body: string
): 'trial_start' | 'subscription_confirmation' | 'renewal_notice' | 'price_change' | 'trial_ending' | 'receipt' | 'unknown' {
  const combinedText = `${subject} ${body}`;

  if (COMMON_PATTERNS.actions.trialEnding.test(combinedText)) {
    return 'trial_ending';
  }
  if (COMMON_PATTERNS.actions.trialStart.test(combinedText)) {
    return 'trial_start';
  }
  if (COMMON_PATTERNS.actions.priceChange.test(combinedText)) {
    return 'price_change';
  }
  if (COMMON_PATTERNS.actions.renewal.test(combinedText)) {
    return 'renewal_notice';
  }
  if (COMMON_PATTERNS.actions.subscribed.test(combinedText)) {
    return 'subscription_confirmation';
  }
  if (/receipt|invoice|payment.*confirm/i.test(combinedText)) {
    return 'receipt';
  }

  return 'unknown';
}
