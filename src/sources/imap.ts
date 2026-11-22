// Generic IMAP backend for EmailSource, powered by imapflow.
//
// Works with app passwords on Gmail, Yahoo, iCloud, Fastmail, Zoho, etc.
// Strategy: server-side SINCE search, envelope-only prefilter on
// subject/sender (cheap), then full body download for the matches only.

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { EmailAccount } from '../types.js';
import type { ParsedEmail } from '../parsers/email-parser.js';
import { isLikelySubscriptionEmail } from '../parsers/patterns.js';
import type { EmailSource, FetchOptions } from './source.js';

const SENDER_HINTS = /(no-?reply|billing|receipts?|invoice|payments?|subscriptions?|renewals?|accounts?|memberships?)@|@(billing|payments?|receipts?)\./i;

const SUBJECT_HINTS = /\b(subscription|subscribe[d]?|trial|membership|billing|receipt|invoice|renew(al|s|ing)?|payment|order confirmation|plan|premium|welcome to|auto-?renew|charged?|expir(es?|ing))\b/i;

export interface ImapPreset {
  host: string;
  note: string;
}

/**
 * Known IMAP hosts by email domain, with pointers to each provider's
 * app-password setup. Microsoft domains are intentionally absent -
 * outlook.com/hotmail dropped IMAP password auth in 2024.
 */
export function imapPresetForEmail(email: string): ImapPreset | 'microsoft' | null {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';

  if (['gmail.com', 'googlemail.com'].includes(domain)) {
    return {
      host: 'imap.gmail.com',
      note: 'Requires 2-Step Verification. Create an app password at https://myaccount.google.com/apppasswords',
    };
  }
  if (['yahoo.com', 'ymail.com', 'yahoo.co.uk'].includes(domain)) {
    return {
      host: 'imap.mail.yahoo.com',
      note: 'Create an app password at https://login.yahoo.com/myaccount/security',
    };
  }
  if (['icloud.com', 'me.com', 'mac.com'].includes(domain)) {
    return {
      host: 'imap.mail.me.com',
      note: 'Create an app-specific password at https://account.apple.com (Sign-In and Security)',
    };
  }
  if (['fastmail.com', 'fastmail.fm'].includes(domain)) {
    return {
      host: 'imap.fastmail.com',
      note: 'Create an app password in Fastmail Settings > Privacy & Security',
    };
  }
  if (domain === 'zoho.com') {
    return { host: 'imap.zoho.com', note: 'Enable IMAP and create an app password in Zoho Mail settings' };
  }
  if (domain === 'aol.com') {
    return { host: 'imap.aol.com', note: 'Create an app password in AOL account security settings' };
  }
  if (['gmx.com', 'gmx.net', 'gmx.de'].includes(domain)) {
    return { host: 'imap.gmx.com', note: 'Enable IMAP access in GMX settings first' };
  }
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) {
    return 'microsoft';
  }

  return null;
}

export interface ImapConnectionConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

export function imapConfigFromAccount(account: EmailAccount): ImapConnectionConfig {
  if (!account.imapHost || !account.imapPassword) {
    throw new Error(`Account ${account.email} is missing IMAP host or password`);
  }
  return {
    host: account.imapHost,
    port: account.imapPort ?? 993,
    secure: (account.imapPort ?? 993) === 993,
    user: account.imapUser ?? account.email,
    password: account.imapPassword,
  };
}

/** Quick connectivity check used by `config email add` before saving credentials. */
export async function testImapConnection(config: ImapConnectionConfig): Promise<void> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    logger: false,
  });
  await client.connect();
  await client.logout();
}

export class ImapSource implements EmailSource {
  readonly kind = 'imap';
  private config: ImapConnectionConfig;
  private accountEmail: string;

  constructor(account: EmailAccount) {
    this.config = imapConfigFromAccount(account);
    this.accountEmail = account.email;
  }

  async fetchSubscriptionEmails(options: FetchOptions): Promise<ParsedEmail[]> {
    const { daysBack, maxResults = 500, onProgress } = options;

    const client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: { user: this.config.user, pass: this.config.password },
      logger: false,
    });

    onProgress?.(`Connecting to ${this.config.host}...`);
    await client.connect();

    const emails: ParsedEmail[] = [];
    const lock = await client.getMailboxLock('INBOX');

    try {
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      onProgress?.(`Searching messages since ${since.toDateString()}...`);
      const uids = await client.search({ since }, { uid: true });

      if (!uids || uids.length === 0) {
        return [];
      }

      // Envelope-only pass: decide which messages are worth downloading.
      onProgress?.(`Prefiltering ${uids.length} messages by subject/sender...`);
      const candidates: number[] = [];

      for await (const message of client.fetch(uids, { envelope: true }, { uid: true })) {
        const subject = message.envelope?.subject ?? '';
        const fromAddress = message.envelope?.from?.[0]?.address ?? '';

        if (this.looksSubscriptionRelated(fromAddress, subject)) {
          candidates.push(message.uid);
        }
      }

      // Newest first, capped
      candidates.sort((a, b) => b - a);
      const selected = candidates.slice(0, maxResults);

      onProgress?.(`Downloading ${selected.length} candidate emails...`);
      let downloaded = 0;

      for (const uid of selected) {
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!message || !message.source) continue;

        const parsed = await simpleParser(message.source);
        downloaded++;

        if (downloaded % 25 === 0) {
          onProgress?.(`Downloaded ${downloaded}/${selected.length} emails...`);
        }

        emails.push({
          messageId: parsed.messageId ?? `imap-${this.config.host}-${uid}`,
          from: parsed.from?.text ?? '',
          to: Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(', ') : parsed.to?.text ?? this.accountEmail,
          subject: parsed.subject ?? '',
          body: parsed.text ?? (parsed.html || ''),
          html: parsed.html || undefined,
          date: parsed.date ?? new Date(),
          headers: {},
        });
      }
    } finally {
      lock.release();
      await client.logout().catch(() => { /* connection may already be gone */ });
    }

    return emails;
  }

  private looksSubscriptionRelated(fromAddress: string, subject: string): boolean {
    return (
      SENDER_HINTS.test(fromAddress) ||
      SUBJECT_HINTS.test(subject) ||
      isLikelySubscriptionEmail(subject, '')
    );
  }
}
