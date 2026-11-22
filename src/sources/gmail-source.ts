// Gmail API backend for EmailSource (BYO OAuth client)

import type { EmailAccount } from '../types.js';
import type { ParsedEmail } from '../parsers/email-parser.js';
import { createGmailClient } from '../parsers/gmail.js';
import type { EmailSource, FetchOptions } from './source.js';

export class GmailSource implements EmailSource {
  readonly kind = 'gmail-api';
  private account: EmailAccount;

  constructor(account: EmailAccount) {
    this.account = account;
  }

  async fetchSubscriptionEmails(options: FetchOptions): Promise<ParsedEmail[]> {
    const client = createGmailClient(this.account);
    options.onProgress?.(`Searching ${this.account.email} via Gmail API...`);
    return client.searchSubscriptionEmails(options.daysBack, options.maxResults ?? 500);
  }
}
