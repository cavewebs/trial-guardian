// Email parser for extracting subscription information

import { addDays, parse, isValid } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import type { Subscription, EmailReference } from '../types.js';
import {
  matchServiceFromEmail,
  isLikelySubscriptionEmail,
  extractPrice,
  extractBillingCycle,
  extractTrialDays,
  detectEmailType,
} from './patterns.js';

export interface ParsedEmail {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
  date: Date;
  headers: Record<string, string>;
}

export interface EmailParseResult {
  isSubscriptionRelated: boolean;
  subscription: Partial<Subscription> | null;
  emailRef: EmailReference;
  confidence: 'high' | 'medium' | 'low';
  emailType: ReturnType<typeof detectEmailType>;
}

export function parseEmailForSubscription(
  email: ParsedEmail,
  accountEmail: string
): EmailParseResult {
  const { messageId, from, subject, body, date } = email;
  const plainBody = stripHtml(body);

  // Create email reference
  const emailRef: EmailReference = {
    messageId,
    subject,
    from,
    date: date.toISOString(),
    emailAccount: accountEmail,
    snippet: plainBody.slice(0, 200),
  };

  // Detect email type
  const emailType = detectEmailType(subject, plainBody);

  // Try to match a known service
  const serviceMatch = matchServiceFromEmail(from, subject, plainBody);

  // Check if it's a generic subscription email
  const isGenericSubscription = isLikelySubscriptionEmail(subject, plainBody);

  if (!serviceMatch && !isGenericSubscription) {
    return {
      isSubscriptionRelated: false,
      subscription: null,
      emailRef,
      confidence: 'low',
      emailType: 'unknown',
    };
  }

  // Extract subscription details
  const serviceName = serviceMatch?.serviceName ?? extractServiceNameFromEmail(from, subject);
  const priceInfo = extractPrice(plainBody);
  const billingCycle = extractBillingCycle(plainBody);
  const trialDays = extractTrialDays(plainBody);

  // Calculate trial end date if applicable
  let trialEndDate: string | null = null;
  if (trialDays && (emailType === 'trial_start' || plainBody.toLowerCase().includes('trial'))) {
    trialEndDate = addDays(date, trialDays).toISOString();
  }

  // Extract any explicit dates mentioned
  const extractedDate = extractDateFromText(plainBody);
  if (extractedDate && emailType === 'trial_ending') {
    trialEndDate = extractedDate.toISOString();
  }

  // Determine status
  let status: Subscription['status'] = 'active';
  if (emailType === 'trial_start' || trialDays) {
    status = 'trial';
  }

  // Calculate next billing date
  let nextBillingDate: string | null = trialEndDate;
  if (!nextBillingDate && extractedDate) {
    nextBillingDate = extractedDate.toISOString();
  }

  // Build partial subscription
  const subscription: Partial<Subscription> = {
    id: uuidv4(),
    serviceName,
    status,
    detectedAt: new Date().toISOString(),
    price: priceInfo?.amount ?? 0,
    currency: priceInfo?.currency ?? 'USD',
    billingCycle,
    nextBillingDate,
    trialEndDate,
    serviceUrl: extractUrlFromEmail(from),
    accountEmail,
    cancellationUrl: null,
    riskScore: calculateInitialRiskScore(emailType, trialDays, priceInfo?.amount),
    riskFactors: [],
    sourceEmails: [emailRef],
    reminders: [],
    notes: '',
  };

  // Add risk factors
  if (trialDays && trialDays <= 7) {
    subscription.riskFactors?.push('Short trial period');
  }
  if (priceInfo && priceInfo.amount > 50) {
    subscription.riskFactors?.push('High monthly cost');
  }
  if (billingCycle === 'yearly') {
    subscription.riskFactors?.push('Annual billing commitment');
  }

  return {
    isSubscriptionRelated: true,
    subscription,
    emailRef,
    confidence: serviceMatch ? 'high' : 'medium',
    emailType,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractServiceNameFromEmail(from: string, subject: string): string {
  // Try to extract from email domain
  const domainMatch = from.match(/@([^.]+)\./);
  if (domainMatch) {
    const domain = domainMatch[1];
    // Capitalize first letter
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  // Fallback: use first significant word from subject
  const words = subject.split(/\s+/).filter((w) => w.length > 3);
  if (words.length > 0) {
    return words[0].replace(/[^a-zA-Z]/g, '');
  }

  return 'Unknown Service';
}

function extractUrlFromEmail(from: string): string | null {
  const domainMatch = from.match(/@([^>]+)/);
  if (domainMatch) {
    // Clean up the domain
    const domain = domainMatch[1]
      .replace(/^(?:mail\.|mailer\.|noreply\.|no-reply\.|info\.|hello\.)/i, '')
      .trim();
    return `https://${domain}`;
  }
  return null;
}

function extractDateFromText(text: string): Date | null {
  // Common date patterns
  const patterns = [
    // January 15, 2026 or Jan 15, 2026
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})\b/i,
    // 01/15/2026 or 1/15/26
    /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/,
    // 2026-01-15
    /\b(\d{4})-(\d{2})-(\d{2})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let dateStr: string;

      if (pattern.source.includes('January')) {
        // Month name format
        dateStr = `${match[1]} ${match[2]}, ${match[3]}`;
        const parsed = parse(dateStr, 'MMMM d, yyyy', new Date());
        if (isValid(parsed)) return parsed;

        // Try abbreviated month
        const parsedAbbrev = parse(dateStr, 'MMM d, yyyy', new Date());
        if (isValid(parsedAbbrev)) return parsedAbbrev;
      } else if (pattern.source.includes('\\/')) {
        // MM/DD/YYYY format
        let year = match[3];
        if (year.length === 2) {
          year = `20${year}`;
        }
        dateStr = `${match[1]}/${match[2]}/${year}`;
        const parsed = parse(dateStr, 'M/d/yyyy', new Date());
        if (isValid(parsed)) return parsed;
      } else {
        // ISO format YYYY-MM-DD
        dateStr = `${match[1]}-${match[2]}-${match[3]}`;
        const parsed = parse(dateStr, 'yyyy-MM-dd', new Date());
        if (isValid(parsed)) return parsed;
      }
    }
  }

  return null;
}

function calculateInitialRiskScore(
  emailType: ReturnType<typeof detectEmailType>,
  trialDays: number | null,
  price: number | undefined
): number {
  let score = 5; // Base score

  // Trials are inherently riskier (easy to forget)
  if (emailType === 'trial_start') {
    score += 2;
  }

  // Short trials are more likely to convert before user notices
  if (trialDays) {
    if (trialDays <= 3) score += 3;
    else if (trialDays <= 7) score += 2;
    else if (trialDays <= 14) score += 1;
  }

  // Higher prices mean more potential loss
  if (price) {
    if (price >= 100) score += 2;
    else if (price >= 50) score += 1;
  }

  // Cap at 10
  return Math.min(score, 10);
}

export function mergeSubscriptionUpdates(
  existing: Subscription,
  newData: Partial<Subscription>,
  emailRef: EmailReference
): Subscription {
  // Add new email reference
  const sourceEmails = [...existing.sourceEmails, emailRef];

  // Update with new information (prefer newer data for some fields)
  return {
    ...existing,
    ...newData,
    id: existing.id, // Keep original ID
    detectedAt: existing.detectedAt, // Keep original detection date
    sourceEmails,
    reminders: existing.reminders, // Keep existing reminders
    notes: existing.notes, // Keep existing notes

    // Update these fields if new data has them
    price: newData.price ?? existing.price,
    nextBillingDate: newData.nextBillingDate ?? existing.nextBillingDate,
    trialEndDate: newData.trialEndDate ?? existing.trialEndDate,
    status: newData.status ?? existing.status,

    // Recalculate risk score
    riskScore: Math.max(existing.riskScore, newData.riskScore ?? 0),
    riskFactors: [...new Set([...existing.riskFactors, ...(newData.riskFactors ?? [])])],
  };
}
