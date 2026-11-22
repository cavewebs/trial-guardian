// AI-powered extraction using vendor-agnostic provider

import { completeJSON } from './provider.js';
import type { Subscription, TCAnalysis, CancellationInstructions } from '../types.js';

/**
 * Extract subscription details from an email using AI
 */
export async function extractSubscriptionFromEmail(
  emailContent: {
    from: string;
    subject: string;
    body: string;
    date: string;
  }
): Promise<{
  isSubscription: boolean;
  subscription: Partial<Subscription> | null;
  confidence: number;
  reasoning: string;
  /** True when the AI call itself failed (as opposed to "not a subscription") */
  failed?: boolean;
}> {
  const prompt = `Analyze this email and determine if it's related to a subscription, trial, or recurring payment.

EMAIL:
From: ${emailContent.from}
Subject: ${emailContent.subject}
Date: ${emailContent.date}
Body:
${emailContent.body.slice(0, 4000)}

Extract the following information if this is a subscription-related email:

1. Service name (the company/product name)
2. Email type: trial_start, subscription_confirmation, renewal_notice, trial_ending, price_change, receipt, or not_subscription
3. Price (number only, e.g., 9.99)
4. Currency (USD, EUR, GBP, etc.)
5. Billing cycle (monthly, yearly, weekly, one-time)
6. Trial end date or next billing date (ISO format YYYY-MM-DD if mentioned)
7. Is this a free trial? (true/false)
8. Cancellation URL if mentioned
9. Any warnings or important terms mentioned

Respond in JSON format only:
{
  "isSubscription": boolean,
  "confidence": number (0-1),
  "reasoning": "brief explanation",
  "serviceName": string | null,
  "emailType": string,
  "price": number | null,
  "currency": string,
  "billingCycle": string | null,
  "trialEndDate": string | null,
  "nextBillingDate": string | null,
  "isTrial": boolean,
  "cancellationUrl": string | null,
  "warnings": string[]
}`;

  try {
    interface ExtractResult {
      isSubscription: boolean;
      confidence: number;
      reasoning: string;
      serviceName: string | null;
      emailType: string;
      price: number | null;
      currency: string;
      billingCycle: string | null;
      trialEndDate: string | null;
      nextBillingDate: string | null;
      isTrial: boolean;
      cancellationUrl: string | null;
      warnings: string[];
    }

    const result = await completeJSON<ExtractResult>(prompt, { maxTokens: 1024 });

    if (!result.isSubscription) {
      return {
        isSubscription: false,
        subscription: null,
        confidence: result.confidence,
        reasoning: result.reasoning,
      };
    }

    const subscription: Partial<Subscription> = {
      serviceName: result.serviceName ?? undefined,
      status: result.isTrial ? 'trial' : 'active',
      price: result.price ?? 0,
      currency: result.currency ?? 'USD',
      billingCycle: result.billingCycle as Subscription['billingCycle'] ?? 'monthly',
      trialEndDate: result.trialEndDate,
      nextBillingDate: result.nextBillingDate ?? result.trialEndDate,
      cancellationUrl: result.cancellationUrl,
      riskFactors: result.warnings ?? [],
    };

    return {
      isSubscription: true,
      subscription,
      confidence: result.confidence,
      reasoning: result.reasoning,
    };
  } catch (error) {
    console.error('AI extraction failed:', error);
    return {
      isSubscription: false,
      subscription: null,
      confidence: 0,
      reasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      failed: true,
    };
  }
}

/**
 * Analyze Terms & Conditions using AI
 */
export async function analyzeTermsWithAI(
  serviceName: string,
  termsText: string
): Promise<TCAnalysis> {
  const prompt = `Analyze these Terms & Conditions / Terms of Service for "${serviceName}" and identify consumer-relevant issues.

${termsText ? `TERMS TEXT (truncated to 8000 chars):
${termsText.slice(0, 8000)}` : `No terms text provided. Use your knowledge of ${serviceName}'s typical terms and policies.`}

Analyze for:
1. Auto-renewal terms - Does it auto-renew? How much notice is needed?
2. Cancellation process - How do you cancel? Web, phone, email, in-person?
3. Cancellation window - Must you cancel X days before renewal?
4. Fees - Any termination fees, hidden fees, or price increases after trial?
5. Refund policy - Can you get refunds? Under what conditions?
6. Data retention - What happens to your data after cancellation?
7. Trial conversion - Does free trial auto-convert to paid?
8. Any other consumer-unfriendly terms

Respond in JSON format only:
{
  "riskScore": number (1-10, where 10 is most risky for consumers),
  "redFlags": [
    {
      "category": string,
      "description": string,
      "severity": "low" | "medium" | "high",
      "excerpt": "relevant quote from terms or null"
    }
  ],
  "positiveTerms": [
    {
      "category": string,
      "description": string
    }
  ],
  "autoRenewal": boolean,
  "cancellationWindow": string | null (e.g., "24 hours before renewal"),
  "cancellationMethod": "web" | "web-chat" | "phone" | "email" | "in-person" | "mail" | "unknown",
  "refundPolicy": string | null,
  "priceAfterTrial": number | null,
  "recommendation": string (1-2 sentences of practical advice)
}`;

  try {
    interface TCResult {
      riskScore: number;
      redFlags: Array<{
        category: string;
        description: string;
        severity: 'low' | 'medium' | 'high';
        excerpt?: string;
      }>;
      positiveTerms: Array<{
        category: string;
        description: string;
      }>;
      autoRenewal: boolean;
      cancellationWindow: string | null;
      cancellationMethod: string;
      refundPolicy: string | null;
      priceAfterTrial: number | null;
      recommendation: string;
    }

    const result = await completeJSON<TCResult>(prompt, { maxTokens: 2048 });

    return {
      serviceName,
      analyzedAt: new Date().toISOString(),
      sourceUrl: null,
      riskScore: result.riskScore,
      redFlags: result.redFlags.map((f) => ({
        category: f.category,
        description: f.description,
        severity: f.severity,
        excerpt: f.excerpt,
      })),
      positiveTerms: result.positiveTerms.map((t) => ({
        category: t.category,
        description: t.description,
        severity: 'low' as const,
      })),
      autoRenewal: result.autoRenewal,
      cancellationWindow: result.cancellationWindow,
      cancellationMethod: result.cancellationMethod as TCAnalysis['cancellationMethod'],
      refundPolicy: result.refundPolicy,
      dataRetentionPolicy: null,
      priceAfterTrial: result.priceAfterTrial,
      rawExcerpts: result.redFlags.map((f) => f.excerpt).filter((e): e is string => !!e),
      recommendation: result.recommendation,
    };
  } catch (error) {
    console.error('AI T&C analysis failed:', error);
    return {
      serviceName,
      analyzedAt: new Date().toISOString(),
      sourceUrl: null,
      riskScore: 5,
      redFlags: [],
      positiveTerms: [],
      autoRenewal: false,
      cancellationWindow: null,
      cancellationMethod: 'unknown',
      refundPolicy: null,
      dataRetentionPolicy: null,
      priceAfterTrial: null,
      rawExcerpts: [],
      recommendation: `Could not analyze terms: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Generate cancellation instructions for a service using AI
 */
export async function generateCancellationInstructions(
  serviceName: string,
  serviceUrl?: string
): Promise<CancellationInstructions> {
  const prompt = `Generate step-by-step cancellation instructions for "${serviceName}"${serviceUrl ? ` (${serviceUrl})` : ''}.

Based on your knowledge, provide:
1. The cancellation method (web, phone, chat, email, in-person, mail)
2. Difficulty rating (easy, medium, hard)
3. Estimated time to cancel
4. Step-by-step instructions
5. Phone number if phone cancellation is required
6. Tips for dealing with retention offers
7. Any special notes (e.g., fees, timing requirements)

Respond in JSON format only:
{
  "method": "web" | "web-chat" | "phone" | "email" | "in-person" | "mail",
  "difficulty": "easy" | "medium" | "hard",
  "estimatedTime": string (e.g., "5-10 minutes"),
  "cancellationUrl": string | null,
  "webSteps": string[] | null,
  "phoneNumber": string | null,
  "phoneHours": string | null,
  "bestTimeToCall": string | null,
  "phoneScript": string | null,
  "retentionOfferTips": string | null,
  "chatUrl": string | null,
  "chatSteps": string[] | null,
  "specialNotes": string | null
}`;

  try {
    interface CancelResult {
      method: string;
      difficulty: string;
      estimatedTime: string;
      cancellationUrl?: string;
      webSteps?: string[];
      phoneNumber?: string;
      phoneHours?: string;
      bestTimeToCall?: string;
      phoneScript?: string;
      retentionOfferTips?: string;
      chatUrl?: string;
      chatSteps?: string[];
      specialNotes?: string;
    }

    const result = await completeJSON<CancelResult>(prompt, { maxTokens: 1536 });

    return {
      serviceName,
      aliases: [],
      updatedAt: new Date().toISOString(),
      method: result.method as CancellationInstructions['method'],
      difficulty: result.difficulty as CancellationInstructions['difficulty'],
      estimatedTime: result.estimatedTime,
      cancellationUrl: result.cancellationUrl,
      webSteps: result.webSteps,
      phoneNumber: result.phoneNumber,
      phoneHours: result.phoneHours,
      bestTimeToCall: result.bestTimeToCall,
      phoneScript: result.phoneScript,
      retentionOfferTips: result.retentionOfferTips,
      chatUrl: result.chatUrl,
      chatSteps: result.chatSteps,
      specialNotes: result.specialNotes,
    };
  } catch (error) {
    console.error('AI cancellation instructions generation failed:', error);
    return {
      serviceName,
      aliases: [],
      updatedAt: new Date().toISOString(),
      method: 'unknown',
      difficulty: 'medium',
      estimatedTime: 'Unknown',
      specialNotes: `Could not generate instructions: ${error instanceof Error ? error.message : 'Unknown error'}. Try searching: https://www.google.com/search?q=how+to+cancel+${encodeURIComponent(serviceName)}`,
    };
  }
}

/**
 * Batch process multiple emails efficiently
 */
export async function batchExtractSubscriptions(
  emails: Array<{
    id: string;
    from: string;
    subject: string;
    body: string;
    date: string;
  }>
): Promise<Map<string, Awaited<ReturnType<typeof extractSubscriptionFromEmail>>>> {
  const results = new Map<string, Awaited<ReturnType<typeof extractSubscriptionFromEmail>>>();

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (email) => {
        const result = await extractSubscriptionFromEmail(email);
        return { id: email.id, result };
      })
    );

    for (const { id, result } of batchResults) {
      results.set(id, result);
    }

    // Small delay between batches
    if (i + batchSize < emails.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Smart email filtering - quickly identify likely subscription emails before full AI analysis
 */
export async function preFilterEmails(
  emails: Array<{
    id: string;
    from: string;
    subject: string;
    snippet: string;
  }>
): Promise<string[]> {
  if (emails.length === 0) return [];

  // Chunk so a large scan doesn't produce one enormous prompt with a
  // fragile 1-indexed mapping across hundreds of entries.
  const CHUNK_SIZE = 50;
  const likelyIds: string[] = [];

  for (let start = 0; start < emails.length; start += CHUNK_SIZE) {
    const chunk = emails.slice(start, start + CHUNK_SIZE);

    const prompt = `Given these email subjects and senders, identify which ones are likely subscription/trial/billing related.

EMAILS:
${chunk.map((e, i) => `${i + 1}. From: ${e.from} | Subject: ${e.subject}`).join('\n')}

Return a JSON array of the email numbers (1-indexed) that are likely subscription-related:
{"likely_subscription_emails": [1, 3, 5]}`;

    try {
      interface FilterResult {
        likely_subscription_emails: number[];
      }

      const result = await completeJSON<FilterResult>(prompt, { maxTokens: 512 });
      const indices = result.likely_subscription_emails ?? [];

      likelyIds.push(
        ...indices.map((i) => chunk[i - 1]?.id).filter((id): id is string => !!id)
      );
    } catch {
      // On error, keep the whole chunk for full processing
      likelyIds.push(...chunk.map((e) => e.id));
    }
  }

  return likelyIds;
}
