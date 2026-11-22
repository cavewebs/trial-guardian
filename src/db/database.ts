// Database module using lowdb for local JSON storage

import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { existsSync, mkdirSync, readdirSync, copyFileSync, chmodSync } from 'fs';
import { normalizeServiceName } from '../utils/format.js';
import type {
  Subscription,
  EmailAccount,
  Reminder,
  Config,
  CancellationInstructions,
} from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Data lives in the user's home directory (override with TRIAL_GUARDIAN_DATA_DIR),
// never inside the install directory - a global npm install/reinstall must not
// hold or wipe personal data.
const DATA_DIR = process.env.TRIAL_GUARDIAN_DATA_DIR ?? join(homedir(), '.trial-guardian');

// Pre-0.2 versions stored data inside the repo/install dir; migrate it once.
const LEGACY_DATA_DIR = join(__dirname, '..', '..', 'data');

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    migrateLegacyData();
  }
  chmodSync(DATA_DIR, 0o700);
}

function migrateLegacyData(): void {
  if (!existsSync(LEGACY_DATA_DIR) || LEGACY_DATA_DIR === DATA_DIR) return;
  try {
    for (const file of readdirSync(LEGACY_DATA_DIR)) {
      if (file.endsWith('.json')) {
        copyFileSync(join(LEGACY_DATA_DIR, file), join(DATA_DIR, file));
      }
    }
  } catch {
    // Best-effort migration; a fresh start is acceptable
  }
}

/** Config and tokens are credentials - keep them out of reach of other users. */
function restrictFilePermissions(filename: string): void {
  const filePath = join(DATA_DIR, filename);
  if (existsSync(filePath)) {
    try {
      chmodSync(filePath, 0o600);
    } catch {
      // Non-POSIX filesystem; nothing to do
    }
  }
}

// Database schemas
interface SubscriptionsDB {
  subscriptions: Subscription[];
  lastUpdated: string;
}

interface ConfigDB {
  config: Config;
  emailAccounts: EmailAccount[];
}

interface CancellationDB {
  instructions: CancellationInstructions[];
  lastUpdated: string;
}

interface RemindersDB {
  reminders: Reminder[];
}

interface ScanCacheDB {
  // Message IDs already run through extraction, so rescans don't
  // re-pay AI cost for emails we've seen before.
  processedIds: string[];
}

const SCAN_CACHE_MAX = 50000;

// Default config
const defaultConfig: Config = {
  notifications: {
    defaultChannel: null,
    reminderDays: [7, 3, 1],
  },
  emailAccounts: [],
  scanning: {
    autoScanEnabled: false,
    scanIntervalHours: 24,
    lookbackDays: 180,
  },
  autoCancel: {
    enabled: false,
    requireConfirmation: true,
  },
};

// Database instances
let subscriptionsDb: Low<SubscriptionsDB>;
let configDb: Low<ConfigDB>;
let cancellationDb: Low<CancellationDB>;
let remindersDb: Low<RemindersDB>;
let scanCacheDb: Low<ScanCacheDB>;

async function initDb<T>(filename: string, defaultData: T): Promise<Low<T>> {
  const filePath = join(DATA_DIR, filename);
  const adapter = new JSONFile<T>(filePath);
  const db = new Low(adapter, defaultData);
  await db.read();
  return db;
}

export async function initializeDatabase(): Promise<void> {
  ensureDataDir();

  subscriptionsDb = await initDb<SubscriptionsDB>('subscriptions.json', {
    subscriptions: [],
    lastUpdated: new Date().toISOString(),
  });

  configDb = await initDb<ConfigDB>('config.json', {
    config: defaultConfig,
    emailAccounts: [],
  });

  cancellationDb = await initDb<CancellationDB>('cancellation-db.json', {
    instructions: [],
    lastUpdated: new Date().toISOString(),
  });

  remindersDb = await initDb<RemindersDB>('reminders.json', {
    reminders: [],
  });

  scanCacheDb = await initDb<ScanCacheDB>('scan-cache.json', {
    processedIds: [],
  });

  // config.json holds OAuth tokens / IMAP passwords
  restrictFilePermissions('config.json');
}

// Subscription operations
export async function getAllSubscriptions(): Promise<Subscription[]> {
  await subscriptionsDb.read();
  return subscriptionsDb.data.subscriptions;
}

export async function getSubscription(id: string): Promise<Subscription | undefined> {
  await subscriptionsDb.read();
  return subscriptionsDb.data.subscriptions.find((s) => s.id === id);
}

/**
 * Fuzzy lookup for user-facing commands ("cancel-help netflix").
 * Prefers an exact match, falls back to substring.
 */
export async function getSubscriptionByName(name: string): Promise<Subscription | undefined> {
  await subscriptionsDb.read();
  const normalizedName = normalizeServiceName(name);
  return (
    subscriptionsDb.data.subscriptions.find(
      (s) => normalizeServiceName(s.serviceName) === normalizedName
    ) ??
    subscriptionsDb.data.subscriptions.find((s) =>
      normalizeServiceName(s.serviceName).includes(normalizedName)
    )
  );
}

/**
 * Exact-match lookup for scan dedup. Substring matching here would merge
 * distinct services (e.g. "Paramount" into "Paramount+") and corrupt data.
 */
export async function getSubscriptionByExactName(name: string): Promise<Subscription | undefined> {
  await subscriptionsDb.read();
  const normalizedName = normalizeServiceName(name);
  return subscriptionsDb.data.subscriptions.find(
    (s) => normalizeServiceName(s.serviceName) === normalizedName
  );
}

export async function addSubscription(subscription: Subscription): Promise<void> {
  await subscriptionsDb.read();
  subscriptionsDb.data.subscriptions.push(subscription);
  subscriptionsDb.data.lastUpdated = new Date().toISOString();
  await subscriptionsDb.write();
}

export async function updateSubscription(
  id: string,
  updates: Partial<Subscription>
): Promise<void> {
  await subscriptionsDb.read();
  const index = subscriptionsDb.data.subscriptions.findIndex((s) => s.id === id);
  if (index !== -1) {
    subscriptionsDb.data.subscriptions[index] = {
      ...subscriptionsDb.data.subscriptions[index],
      ...updates,
    };
    subscriptionsDb.data.lastUpdated = new Date().toISOString();
    await subscriptionsDb.write();
  }
}

export async function deleteSubscription(id: string): Promise<void> {
  await subscriptionsDb.read();
  subscriptionsDb.data.subscriptions = subscriptionsDb.data.subscriptions.filter(
    (s) => s.id !== id
  );
  subscriptionsDb.data.lastUpdated = new Date().toISOString();
  await subscriptionsDb.write();
}

export async function getActiveTrials(): Promise<Subscription[]> {
  await subscriptionsDb.read();
  return subscriptionsDb.data.subscriptions.filter((s) => s.status === 'trial');
}

export async function getUpcomingCharges(daysAhead: number = 14): Promise<Subscription[]> {
  await subscriptionsDb.read();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

  return subscriptionsDb.data.subscriptions.filter((s) => {
    if (s.status === 'cancelled' || s.status === 'expired') return false;

    const chargeDate = s.trialEndDate ?? s.nextBillingDate;
    if (!chargeDate) return false;

    const date = new Date(chargeDate);
    return date <= cutoffDate && date >= new Date();
  });
}

// Config operations
export async function getConfig(): Promise<Config> {
  await configDb.read();
  return configDb.data.config;
}

export async function updateConfig(updates: Partial<Config>): Promise<void> {
  await configDb.read();
  configDb.data.config = { ...configDb.data.config, ...updates };
  await configDb.write();
  restrictFilePermissions('config.json');
}

// Email account operations
export async function getEmailAccounts(): Promise<EmailAccount[]> {
  await configDb.read();
  return configDb.data.emailAccounts;
}

export async function addEmailAccount(account: EmailAccount): Promise<void> {
  await configDb.read();
  configDb.data.emailAccounts.push(account);
  await configDb.write();
  restrictFilePermissions('config.json');
}

export async function updateEmailAccount(
  id: string,
  updates: Partial<EmailAccount>
): Promise<void> {
  await configDb.read();
  const index = configDb.data.emailAccounts.findIndex((a) => a.id === id);
  if (index !== -1) {
    configDb.data.emailAccounts[index] = {
      ...configDb.data.emailAccounts[index],
      ...updates,
    };
    await configDb.write();
    restrictFilePermissions('config.json');
  }
}

export async function deleteEmailAccount(id: string): Promise<void> {
  await configDb.read();
  configDb.data.emailAccounts = configDb.data.emailAccounts.filter((a) => a.id !== id);
  await configDb.write();
}

// Alias for deleteEmailAccount
export const removeEmailAccount = deleteEmailAccount;

// Reminder operations
export async function getAllReminders(): Promise<Reminder[]> {
  await remindersDb.read();
  return remindersDb.data.reminders;
}

export async function getPendingReminders(): Promise<Reminder[]> {
  await remindersDb.read();
  return remindersDb.data.reminders.filter((r) => r.status === 'pending');
}

export async function getDueReminders(): Promise<Reminder[]> {
  await remindersDb.read();
  const now = new Date();
  return remindersDb.data.reminders.filter(
    (r) => r.status === 'pending' && new Date(r.scheduledFor) <= now
  );
}

export async function addReminder(reminder: Reminder): Promise<void> {
  await remindersDb.read();
  remindersDb.data.reminders.push(reminder);
  await remindersDb.write();
}

export async function updateReminder(
  id: string,
  updates: Partial<Reminder>
): Promise<void> {
  await remindersDb.read();
  const index = remindersDb.data.reminders.findIndex((r) => r.id === id);
  if (index !== -1) {
    remindersDb.data.reminders[index] = {
      ...remindersDb.data.reminders[index],
      ...updates,
    };
    await remindersDb.write();
  }
}

export async function deleteReminder(id: string): Promise<void> {
  await remindersDb.read();
  remindersDb.data.reminders = remindersDb.data.reminders.filter((r) => r.id !== id);
  await remindersDb.write();
}

// Cancellation instructions operations
export async function getCancellationInstructions(
  serviceName: string
): Promise<CancellationInstructions | undefined> {
  await cancellationDb.read();
  const normalizedName = serviceName.toLowerCase();

  return cancellationDb.data.instructions.find(
    (i) =>
      i.serviceName.toLowerCase() === normalizedName ||
      i.aliases.some((a) => a.toLowerCase() === normalizedName)
  );
}

export async function getAllCancellationInstructions(): Promise<CancellationInstructions[]> {
  await cancellationDb.read();
  return cancellationDb.data.instructions;
}

export async function addCancellationInstructions(
  instructions: CancellationInstructions
): Promise<void> {
  await cancellationDb.read();
  cancellationDb.data.instructions.push(instructions);
  cancellationDb.data.lastUpdated = new Date().toISOString();
  await cancellationDb.write();
}

export async function updateCancellationInstructions(
  serviceName: string,
  updates: Partial<CancellationInstructions>
): Promise<void> {
  await cancellationDb.read();
  const normalizedName = serviceName.toLowerCase();
  const index = cancellationDb.data.instructions.findIndex(
    (i) => i.serviceName.toLowerCase() === normalizedName
  );

  if (index !== -1) {
    cancellationDb.data.instructions[index] = {
      ...cancellationDb.data.instructions[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    cancellationDb.data.lastUpdated = new Date().toISOString();
    await cancellationDb.write();
  }
}

// Scan cache operations
export async function getProcessedMessageIds(): Promise<Set<string>> {
  await scanCacheDb.read();
  return new Set(scanCacheDb.data.processedIds);
}

export async function markMessagesProcessed(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  await scanCacheDb.read();
  const merged = new Set(scanCacheDb.data.processedIds);
  for (const id of messageIds) merged.add(id);

  // Keep the newest entries when trimming
  let ids = [...merged];
  if (ids.length > SCAN_CACHE_MAX) {
    ids = ids.slice(ids.length - SCAN_CACHE_MAX);
  }
  scanCacheDb.data.processedIds = ids;
  await scanCacheDb.write();
}

// Utility functions
export async function searchSubscriptions(query: string): Promise<Subscription[]> {
  await subscriptionsDb.read();
  const normalizedQuery = query.toLowerCase();

  return subscriptionsDb.data.subscriptions.filter(
    (s) =>
      s.serviceName.toLowerCase().includes(normalizedQuery) ||
      s.accountEmail?.toLowerCase().includes(normalizedQuery) ||
      s.serviceUrl?.toLowerCase().includes(normalizedQuery)
  );
}

export function getDataDir(): string {
  return DATA_DIR;
}
