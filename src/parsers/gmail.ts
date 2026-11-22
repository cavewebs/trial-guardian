// Gmail API integration for scanning emails

import { google, gmail_v1, Auth } from 'googleapis';
import type { EmailAccount } from '../types.js';
import type { ParsedEmail } from './email-parser.js';

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class GmailClient {
  private oauth2Client: Auth.OAuth2Client;
  private gmail: gmail_v1.Gmail;

  constructor(config: GmailConfig, account: EmailAccount) {
    this.oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    if (account.accessToken && account.refreshToken) {
      this.oauth2Client.setCredentials({
        access_token: account.accessToken,
        refresh_token: account.refreshToken,
        expiry_date: account.tokenExpiry ? new Date(account.tokenExpiry).getTime() : undefined,
      });
    }

    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  /**
   * Generate OAuth URL for user authorization
   * Uses 'oob' redirect for Desktop apps - user copies the code manually
   */
  static getAuthUrl(config: GmailConfig): string {
    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      'http://localhost'  // Desktop app redirect - Google will show the code
    );

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      // readonly only - matches the consent screen setup in the README
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
      prompt: 'consent',
      redirect_uri: 'http://localhost',  // Desktop app - code shown in URL
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  static async getTokensFromCode(
    config: GmailConfig,
    code: string
  ): Promise<{ accessToken: string; refreshToken: string; expiry: Date }> {
    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      'http://localhost'  // Must match the redirect used in auth URL
    );

    const { tokens } = await oauth2Client.getToken(code);

    return {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiry: new Date(tokens.expiry_date!),
    };
  }

  /**
   * Search for subscription-related emails
   */
  async searchSubscriptionEmails(
    daysBack: number = 180,
    maxResults: number = 500
  ): Promise<ParsedEmail[]> {
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - daysBack);
    const afterStr = Math.floor(afterDate.getTime() / 1000);

    // Build search query for subscription-related emails
    const searchQueries = [
      'subject:(subscription OR trial OR membership OR billing OR receipt OR invoice OR renewal)',
      'from:(noreply OR no-reply OR billing OR receipt OR invoice)',
      '"your trial" OR "free trial" OR "trial ends" OR "trial ending"',
      '"subscription confirmed" OR "welcome to" OR "thank you for subscribing"',
      '"payment received" OR "payment confirmation" OR "order confirmation"',
      '"auto-renew" OR "will renew" OR "renewal notice"',
    ];

    const allEmails: ParsedEmail[] = [];
    const seenMessageIds = new Set<string>();

    for (const query of searchQueries) {
      try {
        const fullQuery = `${query} after:${afterStr}`;
        const emails = await this.searchEmails(fullQuery, Math.floor(maxResults / searchQueries.length));

        for (const email of emails) {
          if (!seenMessageIds.has(email.messageId)) {
            seenMessageIds.add(email.messageId);
            allEmails.push(email);
          }
        }
      } catch (error) {
        console.error(`Error searching with query "${query}":`, error);
      }
    }

    return allEmails;
  }

  /**
   * Search emails with a custom query
   */
  async searchEmails(query: string, maxResults: number = 100): Promise<ParsedEmail[]> {
    const emails: ParsedEmail[] = [];
    let pageToken: string | undefined;

    while (emails.length < maxResults) {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: Math.min(100, maxResults - emails.length),
        pageToken,
      });

      if (!response.data.messages) break;

      for (const message of response.data.messages) {
        if (emails.length >= maxResults) break;

        const fullMessage = await this.getMessage(message.id!);
        if (fullMessage) {
          emails.push(fullMessage);
        }
      }

      pageToken = response.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }

    return emails;
  }

  /**
   * Get a single email message by ID
   */
  async getMessage(messageId: string): Promise<ParsedEmail | null> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const message = response.data;
      if (!message.payload) return null;

      const headers = this.extractHeaders(message.payload.headers ?? []);
      const body = this.extractBody(message.payload);

      return {
        messageId: message.id!,
        from: headers['from'] ?? '',
        to: headers['to'] ?? '',
        subject: headers['subject'] ?? '',
        body: body.plain || body.html || '',
        html: body.html,
        date: new Date(parseInt(message.internalDate!, 10)),
        headers,
      };
    } catch (error) {
      console.error(`Error fetching message ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Extract headers into a key-value object
   */
  private extractHeaders(
    headers: gmail_v1.Schema$MessagePartHeader[]
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const header of headers) {
      if (header.name && header.value) {
        result[header.name.toLowerCase()] = header.value;
      }
    }

    return result;
  }

  /**
   * Extract body content (plain text and HTML)
   */
  private extractBody(
    payload: gmail_v1.Schema$MessagePart
  ): { plain: string; html: string } {
    const result = { plain: '', html: '' };

    const processPayload = (part: gmail_v1.Schema$MessagePart) => {
      if (part.body?.data) {
        const content = Buffer.from(part.body.data, 'base64').toString('utf-8');

        if (part.mimeType === 'text/plain') {
          result.plain = content;
        } else if (part.mimeType === 'text/html') {
          result.html = content;
        }
      }

      if (part.parts) {
        for (const subPart of part.parts) {
          processPayload(subPart);
        }
      }
    };

    processPayload(payload);

    return result;
  }

  /**
   * Refresh access token if needed
   */
  async refreshTokenIfNeeded(): Promise<{
    accessToken: string;
    refreshToken: string;
    expiry: Date;
  } | null> {
    const credentials = this.oauth2Client.credentials;

    if (credentials.expiry_date && credentials.expiry_date < Date.now() + 60000) {
      const { credentials: newCredentials } = await this.oauth2Client.refreshAccessToken();

      return {
        accessToken: newCredentials.access_token!,
        refreshToken: newCredentials.refresh_token ?? credentials.refresh_token!,
        expiry: new Date(newCredentials.expiry_date!),
      };
    }

    return null;
  }
}

export function createGmailClient(
  account: EmailAccount,
  clientId?: string,
  clientSecret?: string
): GmailClient {
  const config: GmailConfig = {
    clientId: clientId ?? process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: 'http://localhost:3000/oauth/callback',
  };

  return new GmailClient(config, account);
}
