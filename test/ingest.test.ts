import { describe, it, expect } from 'vitest';
import { parseEmailJson, splitMbox, parseMbox } from '../src/sources/ingest.js';

describe('parseEmailJson', () => {
  it('parses a bare array', () => {
    const emails = parseEmailJson(JSON.stringify([
      { from: 'billing@spotify.com', subject: 'Receipt', body: 'You paid $10.99', date: '2026-07-01' },
    ]));

    expect(emails).toHaveLength(1);
    expect(emails[0].from).toBe('billing@spotify.com');
    expect(emails[0].messageId).toMatch(/^ingest-/);
  });

  it('parses an object with an emails array', () => {
    const emails = parseEmailJson(JSON.stringify({
      emails: [{ from: 'a@b.com', subject: 's', body: 'b' }],
    }));
    expect(emails).toHaveLength(1);
  });

  it('produces stable synthetic IDs so re-ingesting dedups', () => {
    const payload = JSON.stringify([{ from: 'a@b.com', subject: 's', body: 'b', date: '2026-07-01' }]);
    expect(parseEmailJson(payload)[0].messageId).toBe(parseEmailJson(payload)[0].messageId);
  });

  it('rejects invalid JSON with a clear error', () => {
    expect(() => parseEmailJson('not json')).toThrow(/not valid JSON/);
  });
});

describe('splitMbox', () => {
  const mbox = [
    'From alice@example.com Mon Jul  1 10:00:00 2026',
    'From: alice@example.com',
    'Subject: First',
    '',
    'Body one',
    '>From quoted line stays',
    'From bob@example.com Mon Jul  2 10:00:00 2026',
    'From: bob@example.com',
    'Subject: Second',
    '',
    'Body two',
  ].join('\n');

  it('splits messages on From separator lines', () => {
    const messages = splitMbox(mbox);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('Subject: First');
    expect(messages[1]).toContain('Subject: Second');
  });

  it('unescapes >From quoting', () => {
    const messages = splitMbox(mbox);
    expect(messages[0]).toContain('From quoted line stays');
    expect(messages[0]).not.toContain('>From quoted');
  });

  it('parses split messages into emails', async () => {
    const emails = await parseMbox(mbox);
    expect(emails).toHaveLength(2);
    expect(emails[0].subject).toBe('First');
    expect(emails[1].from).toContain('bob@example.com');
  });
});
