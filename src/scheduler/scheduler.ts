// Scheduler module for managing reminders and periodic scans

import { CronJob } from 'cron';
import { v4 as uuidv4 } from 'uuid';
import { addDays, isBefore, startOfDay } from 'date-fns';
import type { Subscription, Reminder, Config, NotificationChannel } from '../types.js';
import * as db from '../db/database.js';
import {
  sendNotification,
  formatTrialAlert,
  formatManualCancelNotification,
} from '../notifications/notifier.js';
import { getCancellationInstructions } from '../db/database.js';

let reminderJob: CronJob | null = null;
let scanJob: CronJob | null = null;

/**
 * Initialize the scheduler with periodic jobs
 */
export async function initializeScheduler(): Promise<void> {
  const config = await db.getConfig();

  // Check reminders every hour
  reminderJob = new CronJob('0 * * * *', async () => {
    await processReminders();
  });
  reminderJob.start();

  // Run email scan based on config
  if (config.scanning.autoScanEnabled) {
    const hours = config.scanning.scanIntervalHours;
    // Run every N hours
    scanJob = new CronJob(`0 */${hours} * * *`, async () => {
      console.log('[Scheduler] Running automated email scan...');
      // TODO: Call scan function
    });
    scanJob.start();
  }

  console.log('[Scheduler] Initialized');
}

/**
 * Stop all scheduled jobs
 */
export function stopScheduler(): void {
  if (reminderJob) {
    reminderJob.stop();
    reminderJob = null;
  }
  if (scanJob) {
    scanJob.stop();
    scanJob = null;
  }
  console.log('[Scheduler] Stopped');
}

/**
 * Process all due reminders
 */
export async function processReminders(): Promise<{ sent: number; failed: number }> {
  const dueReminders = await db.getDueReminders();
  const config = await db.getConfig();

  let sent = 0;
  let failed = 0;

  for (const reminder of dueReminders) {
    try {
      const outcome = await sendReminderNotification(reminder, config);

      if (outcome === 'sent') {
        await db.updateReminder(reminder.id, {
          status: 'sent',
          sentAt: new Date().toISOString(),
        });
        sent++;
      } else if (outcome === 'failed') {
        // Leave pending so the next check retries instead of silently dropping it
        failed++;
      }
      // 'skipped' reminders were already dismissed inside sendReminderNotification
    } catch (error) {
      console.error(`[Scheduler] Failed to send reminder ${reminder.id}:`, error);
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Send a reminder notification
 */
async function sendReminderNotification(
  reminder: Reminder,
  _config: Config
): Promise<'sent' | 'skipped' | 'failed'> {
  const subscription = await db.getSubscription(reminder.subscriptionId);
  if (!subscription) {
    console.warn(`[Scheduler] Subscription not found for reminder: ${reminder.subscriptionId}`);
    await db.updateReminder(reminder.id, { status: 'dismissed' });
    return 'skipped';
  }

  // Skip if subscription is already cancelled
  if (subscription.status === 'cancelled') {
    await db.updateReminder(reminder.id, { status: 'dismissed' });
    return 'skipped';
  }

  // Get cancellation instructions to determine notification type
  const instructions = await getCancellationInstructions(subscription.serviceName);

  let payload;
  if (instructions && instructions.method !== 'web') {
    // Manual cancellation required
    payload = formatManualCancelNotification(subscription, {
      method: instructions.method,
      steps: instructions.webSteps ?? instructions.phoneScript?.split('\n') ?? ['Visit the service website', 'Navigate to account settings', 'Find cancellation option'],
      phoneNumber: instructions.phoneNumber,
      estimatedTime: instructions.estimatedTime,
      tips: instructions.retentionOfferTips?.split('\n'),
    });
  } else {
    // Standard alert
    payload = formatTrialAlert(subscription);
  }

  // Send via configured channel
  const channel = reminder.channel;
  const result = await sendNotification(channel, payload);

  if (!result.success) {
    console.error(`[Scheduler] Notification failed: ${result.error}`);
    return 'failed';
  }

  return 'sent';
}

/**
 * Create reminders for a subscription based on config
 */
export async function createRemindersForSubscription(
  subscription: Subscription,
  channel?: NotificationChannel
): Promise<Reminder[]> {
  const config = await db.getConfig();
  const notificationChannel = channel ?? config.notifications.defaultChannel;

  if (!notificationChannel) {
    throw new Error('No notification channel configured');
  }

  const endDate = subscription.trialEndDate ?? subscription.nextBillingDate;
  if (!endDate) {
    throw new Error('Subscription has no end date');
  }

  const reminders: Reminder[] = [];
  const today = startOfDay(new Date());

  for (const daysBeforeEnd of config.notifications.reminderDays) {
    const reminderDate = computeReminderDate(endDate, daysBeforeEnd);

    // Skip if reminder date is in the past
    if (isBefore(reminderDate, today)) {
      continue;
    }

    const reminder: Reminder = {
      id: uuidv4(),
      subscriptionId: subscription.id,
      scheduledFor: reminderDate.toISOString(),
      channel: notificationChannel,
      status: 'pending',
      sentAt: null,
    };

    reminders.push(reminder);
    await db.addReminder(reminder);
  }

  // Update subscription with reminders
  await db.updateSubscription(subscription.id, {
    reminders: [...subscription.reminders, ...reminders],
  });

  return reminders;
}

/**
 * Pure date math: when should a reminder fire for a subscription ending
 * on `endDate` if the user wants `daysBefore` days of warning?
 */
export function computeReminderDate(endDate: string, daysBefore: number): Date {
  return addDays(new Date(endDate), -daysBefore);
}

/**
 * Create a single reminder scheduled N days BEFORE the trial/billing end date.
 */
export async function createSingleReminder(
  subscription: Subscription,
  daysBeforeEnd: number,
  channel?: NotificationChannel
): Promise<Reminder> {
  const config = await db.getConfig();
  const notificationChannel = channel ?? config.notifications.defaultChannel;

  if (!notificationChannel) {
    throw new Error('No notification channel configured');
  }

  const endDate = subscription.trialEndDate ?? subscription.nextBillingDate;
  if (!endDate) {
    throw new Error(
      `${subscription.serviceName} has no trial end or billing date to remind before`
    );
  }

  const reminderDate = computeReminderDate(endDate, daysBeforeEnd);
  if (isBefore(reminderDate, new Date())) {
    throw new Error(
      `That reminder would be in the past (${subscription.serviceName} ends ${endDate.slice(0, 10)})`
    );
  }

  const reminder: Reminder = {
    id: uuidv4(),
    subscriptionId: subscription.id,
    scheduledFor: reminderDate.toISOString(),
    channel: notificationChannel,
    status: 'pending',
    sentAt: null,
  };

  await db.addReminder(reminder);

  // Update subscription with reminder
  await db.updateSubscription(subscription.id, {
    reminders: [...subscription.reminders, reminder],
  });

  return reminder;
}

/**
 * Check and create reminders for all active trials
 */
export async function checkAndCreateReminders(): Promise<{
  created: number;
  skipped: number;
}> {
  const config = await db.getConfig();
  const subscriptions = await db.getActiveTrials();

  if (!config.notifications.defaultChannel) {
    return { created: 0, skipped: subscriptions.length };
  }

  let created = 0;
  let skipped = 0;

  for (const subscription of subscriptions) {
    // Skip if already has pending reminders
    const hasPendingReminders = subscription.reminders.some(
      (r) => r.status === 'pending'
    );

    if (hasPendingReminders) {
      skipped++;
      continue;
    }

    try {
      const reminders = await createRemindersForSubscription(subscription);
      created += reminders.length;
    } catch (error) {
      console.error(
        `[Scheduler] Failed to create reminders for ${subscription.serviceName}:`,
        error
      );
      skipped++;
    }
  }

  return { created, skipped };
}

/**
 * Get upcoming reminders
 */
export async function getUpcomingReminders(
  daysAhead: number = 14
): Promise<{ reminder: Reminder; subscription: Subscription }[]> {
  const reminders = await db.getPendingReminders();
  const cutoffDate = addDays(new Date(), daysAhead);

  const upcoming: { reminder: Reminder; subscription: Subscription }[] = [];

  for (const reminder of reminders) {
    const reminderDate = new Date(reminder.scheduledFor);
    if (isBefore(reminderDate, cutoffDate)) {
      const subscription = await db.getSubscription(reminder.subscriptionId);
      if (subscription) {
        upcoming.push({ reminder, subscription });
      }
    }
  }

  // Sort by scheduled date
  upcoming.sort((a, b) =>
    new Date(a.reminder.scheduledFor).getTime() -
    new Date(b.reminder.scheduledFor).getTime()
  );

  return upcoming;
}

/**
 * Cancel all reminders for a subscription
 */
export async function cancelRemindersForSubscription(
  subscriptionId: string
): Promise<number> {
  const reminders = await db.getAllReminders();
  let cancelled = 0;

  for (const reminder of reminders) {
    if (reminder.subscriptionId === subscriptionId && reminder.status === 'pending') {
      await db.updateReminder(reminder.id, { status: 'dismissed' });
      cancelled++;
    }
  }

  return cancelled;
}
