// Shared email-processing pipeline used by both `scan` (live mailboxes)
// and `ingest` (JSON/mbox handed in without credentials).

import * as db from '../db/database.js';
import { parseEmailForSubscription, mergeSubscriptionUpdates } from '../parsers/email-parser.js';
import type { ParsedEmail } from '../parsers/email-parser.js';
import { extractSubscriptionFromEmail, preFilterEmails } from '../ai/extractor.js';
import type { Subscription, EmailReference } from '../types.js';

export interface PipelineOptions {
  useAI: boolean;
  onProgress?: (message: string) => void;
}

export interface PipelineStats {
  scanned: number;
  skippedCached: number;
  matched: number;
  newSubscriptions: number;
  updatedSubscriptions: number;
  failed: number;
}

export async function processEmails(
  emails: ParsedEmail[],
  accountEmail: string,
  options: PipelineOptions
): Promise<PipelineStats> {
  const { useAI, onProgress } = options;
  const stats: PipelineStats = {
    scanned: emails.length,
    skippedCached: 0,
    matched: 0,
    newSubscriptions: 0,
    updatedSubscriptions: 0,
    failed: 0,
  };

  // Skip emails already processed in earlier scans
  const processedIds = await db.getProcessedMessageIds();
  const fresh = emails.filter((e) => {
    if (processedIds.has(e.messageId)) {
      stats.skippedCached++;
      return false;
    }
    return true;
  });

  if (fresh.length === 0) return stats;

  const doneIds: string[] = [];

  if (useAI) {
    onProgress?.(`Pre-filtering ${fresh.length} emails with AI...`);

    const summaries = fresh.map((e) => ({
      id: e.messageId,
      from: e.from,
      subject: e.subject,
      snippet: e.body.slice(0, 200),
    }));

    const likelyIds = new Set(await preFilterEmails(summaries));
    const likelyEmails = fresh.filter((e) => likelyIds.has(e.messageId));

    // Emails the pre-filter rejected are settled - don't re-pay for them
    doneIds.push(...fresh.filter((e) => !likelyIds.has(e.messageId)).map((e) => e.messageId));

    let processed = 0;
    for (const email of likelyEmails) {
      processed++;
      onProgress?.(`Analyzing email ${processed}/${likelyEmails.length}: ${email.subject.slice(0, 40)}...`);

      const result = await extractSubscriptionFromEmail({
        from: email.from,
        subject: email.subject,
        body: email.body,
        date: email.date.toISOString(),
      });

      if (result.failed) {
        // API error - leave uncached so a future scan retries this email
        stats.failed++;
        continue;
      }

      doneIds.push(email.messageId);

      if (result.isSubscription && result.subscription?.serviceName) {
        stats.matched++;
        const emailRef = makeEmailRef(email, accountEmail);
        const outcome = await upsertSubscription(
          result.subscription,
          emailRef,
          accountEmail,
          `AI confidence: ${(result.confidence * 100).toFixed(0)}%`
        );
        if (outcome === 'new') stats.newSubscriptions++;
        else stats.updatedSubscriptions++;
      }
    }
  } else {
    onProgress?.(`Pattern-matching ${fresh.length} emails...`);

    for (const email of fresh) {
      const result = parseEmailForSubscription(email, accountEmail);
      doneIds.push(email.messageId);

      if (result.isSubscriptionRelated && result.subscription?.serviceName) {
        stats.matched++;
        const outcome = await upsertSubscription(result.subscription, result.emailRef, accountEmail);
        if (outcome === 'new') stats.newSubscriptions++;
        else stats.updatedSubscriptions++;
      }
    }
  }

  await db.markMessagesProcessed(doneIds);
  return stats;
}

function makeEmailRef(email: ParsedEmail, accountEmail: string): EmailReference {
  return {
    messageId: email.messageId,
    subject: email.subject,
    from: email.from,
    date: email.date.toISOString(),
    emailAccount: accountEmail,
    snippet: email.body.slice(0, 200),
  };
}

async function upsertSubscription(
  partial: Partial<Subscription>,
  emailRef: EmailReference,
  accountEmail: string,
  note?: string
): Promise<'new' | 'updated'> {
  const existing = await db.getSubscriptionByExactName(partial.serviceName!);

  if (existing) {
    const updated = mergeSubscriptionUpdates(existing, partial, emailRef);
    await db.updateSubscription(existing.id, updated);
    return 'updated';
  }

  const subscription: Subscription = {
    id: partial.id ?? crypto.randomUUID(),
    serviceName: partial.serviceName!,
    status: partial.status ?? 'active',
    detectedAt: partial.detectedAt ?? new Date().toISOString(),
    price: partial.price ?? 0,
    currency: partial.currency ?? 'USD',
    billingCycle: partial.billingCycle ?? 'monthly',
    nextBillingDate: partial.nextBillingDate ?? null,
    trialEndDate: partial.trialEndDate ?? null,
    serviceUrl: partial.serviceUrl ?? null,
    accountEmail: partial.accountEmail ?? accountEmail,
    cancellationUrl: partial.cancellationUrl ?? null,
    riskScore: partial.riskScore ?? 5,
    riskFactors: partial.riskFactors ?? [],
    sourceEmails: partial.sourceEmails ?? [emailRef],
    reminders: [],
    notes: note ?? partial.notes ?? '',
  };

  await db.addSubscription(subscription);
  return 'new';
}
