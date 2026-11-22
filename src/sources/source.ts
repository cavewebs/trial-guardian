// EmailSource abstraction - a unified way to fetch candidate subscription
// emails from any mailbox backend (Gmail API, generic IMAP, ...).

import type { EmailAccount } from '../types.js';
import type { ParsedEmail } from '../parsers/email-parser.js';
import { GmailSource } from './gmail-source.js';
import { ImapSource } from './imap.js';

export interface FetchOptions {
  daysBack: number;
  maxResults?: number;
  onProgress?: (message: string) => void;
}

export interface EmailSource {
  /** Short backend identifier, e.g. 'gmail-api' or 'imap' */
  readonly kind: string;
  /** Fetch emails that look subscription/billing related. */
  fetchSubscriptionEmails(options: FetchOptions): Promise<ParsedEmail[]>;
}

/**
 * Pick the right backend for an account:
 * - IMAP credentials always win (works for Gmail, Yahoo, iCloud, Fastmail, ...)
 * - Gmail OAuth tokens fall back to the Gmail API client
 */
export function createEmailSource(account: EmailAccount): EmailSource {
  if (account.imapHost && account.imapPassword) {
    return new ImapSource(account);
  }

  if (account.provider === 'gmail' && account.accessToken && account.refreshToken) {
    return new GmailSource(account);
  }

  throw new Error(
    `Account ${account.email} has no usable credentials. ` +
    `Re-add it with: trial-guardian config email add --provider imap --email ${account.email}`
  );
}
