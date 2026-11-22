// Credential-free email input: JSON payloads (e.g. handed over by an
// OpenClaw/agent host that already has an email connector) and mbox
// exports (Google Takeout, Thunderbird, etc.).

import { simpleParser } from 'mailparser';
import { createHash } from 'crypto';
import type { ParsedEmail } from '../parsers/email-parser.js';

export interface IngestEmailInput {
  messageId?: string;
  from: string;
  to?: string;
  subject: string;
  body: string;
  date?: string;
}

/**
 * Parse a JSON payload of emails. Accepts either a bare array or
 * an object with an `emails` array.
 */
export function parseEmailJson(jsonText: string): ParsedEmail[] {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error('Input is not valid JSON. Expected an array of {from, subject, body, date} objects.');
  }

  const items = Array.isArray(data)
    ? data
    : (data as { emails?: unknown[] })?.emails;

  if (!Array.isArray(items)) {
    throw new Error('Expected a JSON array of emails, or an object with an "emails" array.');
  }

  return items.map((item, index) => {
    const email = item as IngestEmailInput;
    if (!email || typeof email !== 'object' || !email.subject && !email.body) {
      throw new Error(`Email at index ${index} is missing required fields (from, subject, body).`);
    }

    const date = email.date ? new Date(email.date) : new Date();

    return {
      messageId: email.messageId ?? syntheticMessageId(email),
      from: email.from ?? '',
      to: email.to ?? '',
      subject: email.subject ?? '',
      body: email.body ?? '',
      date: isNaN(date.getTime()) ? new Date() : date,
      headers: {},
    };
  });
}

/**
 * Split an mbox file into raw RFC822 messages.
 * mbox format separates messages with lines starting "From " (with a space).
 */
export function splitMbox(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const messages: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith('From ') && current.length > 0) {
      messages.push(current.join('\n'));
      current = [];
      continue;
    }
    if (line.startsWith('From ') && current.length === 0) {
      // First separator line - skip it
      continue;
    }
    // Unescape mbox ">From " quoting
    current.push(line.startsWith('>From ') ? line.slice(1) : line);
  }

  if (current.length > 0 && current.join('').trim().length > 0) {
    messages.push(current.join('\n'));
  }

  return messages;
}

export async function parseMbox(content: string): Promise<ParsedEmail[]> {
  const rawMessages = splitMbox(content);
  const emails: ParsedEmail[] = [];

  for (const raw of rawMessages) {
    try {
      const parsed = await simpleParser(raw);
      emails.push({
        messageId: parsed.messageId ?? syntheticMessageId({
          from: parsed.from?.text ?? '',
          subject: parsed.subject ?? '',
          body: parsed.text ?? '',
          date: parsed.date?.toISOString(),
        }),
        from: parsed.from?.text ?? '',
        to: Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(', ') : parsed.to?.text ?? '',
        subject: parsed.subject ?? '',
        body: parsed.text ?? (parsed.html || ''),
        html: parsed.html || undefined,
        date: parsed.date ?? new Date(),
        headers: {},
      });
    } catch {
      // Skip unparseable messages rather than failing the whole import
    }
  }

  return emails;
}

/** Stable ID for emails without a Message-ID so rescans still dedup. */
function syntheticMessageId(email: IngestEmailInput): string {
  const hash = createHash('sha256')
    .update(`${email.from}|${email.subject}|${email.date ?? ''}|${(email.body ?? '').slice(0, 500)}`)
    .digest('hex')
    .slice(0, 24);
  return `ingest-${hash}`;
}
