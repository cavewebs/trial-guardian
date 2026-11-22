// Notification module for sending alerts via multiple channels
// Supports both standalone mode and OpenClaw native messaging

import type { NotificationChannel, Subscription } from '../types.js';
import { differenceInDays, format } from 'date-fns';
import { formatPrice } from '../utils/format.js';

export interface NotificationPayload {
  title: string;
  body: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  subscription: Subscription;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  label: string;
  action: string;
  url?: string;
}

export interface NotificationResult {
  success: boolean;
  channel: string;
  messageId?: string;
  error?: string;
}

// ============================================
// OPENCLAW DETECTION
// ============================================

/**
 * Detect if running inside OpenClaw.
 *
 * OPENCLAW_SHELL is the documented runtime marker OpenClaw injects into
 * exec child processes (docs.openclaw.ai/help/environment). The older
 * session vars are kept as fallbacks for legacy hosts.
 */
export function isRunningInOpenClaw(): boolean {
  return !!(
    process.env.OPENCLAW_SHELL ||
    process.env.OPENCLAW_CLI ||
    process.env.OPENCLAW_SESSION_KEY ||
    process.env.OPENCLAW_SESSION ||    // Legacy
    process.env.MOLTBOT_SESSION ||     // Legacy name
    process.env.CLAWDBOT_SESSION       // Legacy name
  );
}

/**
 * Optional Gateway HTTP config for proactive messages.
 *
 * OpenClaw does not currently inject gateway credentials into skills, so
 * this path only activates when the user explicitly configures it
 * (OPENCLAW_GATEWAY_URL + OPENCLAW_GATEWAY_TOKEN). The default, documented
 * flow is stdout: OpenClaw runs the command and relays its output to the
 * user's connected channel.
 */
export function getOpenClawContext(): {
  gatewayUrl?: string;
  gatewayToken?: string;
  sessionKey?: string;
} | null {
  if (!isRunningInOpenClaw()) return null;

  return {
    gatewayUrl: process.env.OPENCLAW_GATEWAY_URL ?? process.env.OPENCLAW_GATEWAY,
    gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN,
    sessionKey: process.env.OPENCLAW_SESSION_KEY ?? process.env.OPENCLAW_SESSION,
  };
}

// ============================================
// MESSAGE FORMATTING
// ============================================

/**
 * Format a subscription alert notification
 */
export function formatTrialAlert(subscription: Subscription): NotificationPayload {
  const endDate = subscription.trialEndDate ?? subscription.nextBillingDate;
  const daysUntil = endDate ? differenceInDays(new Date(endDate), new Date()) : null;

  let urgency: NotificationPayload['urgency'] = 'low';
  if (daysUntil !== null) {
    if (daysUntil <= 1) urgency = 'critical';
    else if (daysUntil <= 3) urgency = 'high';
    else if (daysUntil <= 7) urgency = 'medium';
  }

  const title = `🚨 Trial Alert: ${subscription.serviceName}`;

  const lines: string[] = [];
  if (daysUntil !== null && endDate) {
    lines.push(`Ends in: ${daysUntil} day${daysUntil !== 1 ? 's' : ''} (${format(new Date(endDate), 'MMM d, yyyy')})`);
  }
  lines.push(`Will charge: ${formatPrice(subscription.price, subscription.currency)}/${subscription.billingCycle}`);

  if (subscription.riskFactors.length > 0) {
    lines.push('');
    lines.push(`⚠️ Warnings:`);
    subscription.riskFactors.forEach((factor) => {
      lines.push(`• ${factor}`);
    });
  }

  const actions: NotificationAction[] = [
    { label: 'View Details', action: 'view_details' },
    { label: 'Remind Tomorrow', action: 'remind_tomorrow' },
    { label: 'Mark Cancelled', action: 'mark_cancelled' },
  ];

  if (subscription.cancellationUrl) {
    actions.unshift({
      label: 'Cancel Now',
      action: 'open_url',
      url: subscription.cancellationUrl,
    });
  }

  return {
    title,
    body: lines.join('\n'),
    urgency,
    subscription,
    actions,
  };
}

/**
 * Format a manual cancellation notification with instructions
 */
export function formatManualCancelNotification(
  subscription: Subscription,
  instructions: {
    method: string;
    steps: string[];
    phoneNumber?: string;
    estimatedTime?: string;
    tips?: string[];
  }
): NotificationPayload {
  const endDate = subscription.trialEndDate ?? subscription.nextBillingDate;
  const daysUntil = endDate ? differenceInDays(new Date(endDate), new Date()) : null;

  const title = `🚨 Trial Alert: ${subscription.serviceName}`;

  const lines: string[] = [];
  if (daysUntil !== null && endDate) {
    lines.push(`Ends in: ${daysUntil} day${daysUntil !== 1 ? 's' : ''} (${format(new Date(endDate), 'MMM d, yyyy')})`);
  }
  lines.push(`Will charge: ${formatPrice(subscription.price, subscription.currency)}/${subscription.billingCycle}`);
  lines.push('');
  lines.push(`⚠️ Auto-cancel not available (${instructions.method})`);
  lines.push('');
  lines.push('📋 How to cancel:');

  instructions.steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${step}`);
  });

  if (instructions.phoneNumber) {
    lines.push('');
    lines.push(`📞 Phone: ${instructions.phoneNumber}`);
  }

  if (instructions.tips && instructions.tips.length > 0) {
    lines.push('');
    lines.push('💡 Tips:');
    instructions.tips.forEach((tip) => {
      lines.push(`• ${tip}`);
    });
  }

  if (instructions.estimatedTime) {
    lines.push('');
    lines.push(`⏱️ Estimated time: ${instructions.estimatedTime}`);
  }

  return {
    title,
    body: lines.join('\n'),
    urgency: daysUntil !== null && daysUntil <= 3 ? 'high' : 'medium',
    subscription,
    actions: [
      { label: 'Copy Phone Number', action: 'copy_phone' },
      { label: 'Set Call Reminder', action: 'set_call_reminder' },
      { label: 'I Cancelled It', action: 'mark_cancelled' },
    ],
  };
}

/**
 * Format payload as plain text
 */
export function formatAsPlainText(payload: NotificationPayload): string {
  return `${payload.title}\n\n${payload.body}`;
}

/**
 * Format payload as markdown
 */
export function formatAsMarkdown(payload: NotificationPayload): string {
  return `**${payload.title}**\n\n${payload.body}`;
}

// ============================================
// NOTIFICATION SENDING
// ============================================

/**
 * Send notification - auto-detects OpenClaw or uses standalone channels
 *
 * When running in OpenClaw:
 * - Messages are automatically routed to whichever platform the user is on
 * - No need to configure Twilio, Telegram bots, etc.
 *
 * When running standalone:
 * - Uses the configured notification channel
 * - Requires API keys for each service
 */
export async function sendNotification(
  channel: NotificationChannel | null,
  payload: NotificationPayload
): Promise<NotificationResult> {
  // If running in OpenClaw, use native messaging (no channel config needed)
  if (isRunningInOpenClaw()) {
    return sendViaOpenClaw(payload);
  }

  // Standalone mode - use configured channel
  if (!channel) {
    return {
      success: false,
      channel: 'none',
      error: 'No notification channel configured. Run: trial-guardian config notifications',
    };
  }

  return sendViaStandaloneChannel(channel, payload);
}

/**
 * Send via OpenClaw native messaging
 *
 * OpenClaw automatically routes messages to the user's connected platform
 * (WhatsApp, Telegram, Signal, Discord, Slack, iMessage, etc.)
 *
 * The skill just outputs text and OpenClaw's Gateway handles routing.
 */
async function sendViaOpenClaw(payload: NotificationPayload): Promise<NotificationResult> {
  const context = getOpenClawContext();

  // Optional: explicitly configured Gateway API for proactive messages.
  // Requires OPENCLAW_GATEWAY_URL and OPENCLAW_GATEWAY_TOKEN to be set by
  // the user; skills don't receive gateway credentials automatically.
  if (context?.gatewayUrl && context?.gatewayToken) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${context.gatewayToken}`,
      };
      if (context.sessionKey) {
        headers['x-openclaw-session-key'] = context.sessionKey;
      }

      const response = await fetch(`${context.gatewayUrl}/api/sessions/main/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: formatAsMarkdown(payload) }),
      });

      if (response.ok) {
        return {
          success: true,
          channel: 'openclaw-gateway',
          messageId: `openclaw-${Date.now()}`,
        };
      }
      console.error(`[OpenClaw] Gateway API returned ${response.status}, falling back to stdout`);
    } catch (error) {
      // Gateway API failed, fall through to stdout
      console.error('[OpenClaw] Gateway API error:', error);
    }
  }

  // Default, documented flow: print to stdout. OpenClaw runs skill
  // commands via its exec tool (or its own cron) and relays the output
  // to whatever channel the user is connected on.
  console.log('\n' + formatAsPlainText(payload) + '\n');

  return {
    success: true,
    channel: 'openclaw-stdout',
    messageId: `stdout-${Date.now()}`,
  };
}

/**
 * Send via standalone channel (when NOT running in OpenClaw)
 */
async function sendViaStandaloneChannel(
  channel: NotificationChannel,
  payload: NotificationPayload
): Promise<NotificationResult> {
  switch (channel.type) {
    case 'telegram':
      return sendTelegramNotification(channel.chatId, payload);
    case 'whatsapp':
      return sendWhatsAppNotification(channel.phone, payload);
    case 'email':
      return sendEmailNotification(channel.address, payload);
    case 'slack':
      return sendSlackNotification(channel.webhookUrl, payload);
    case 'discord':
      return sendDiscordNotification(channel.webhookUrl, payload);
    case 'sms':
      return sendSMSNotification(channel.phone, payload);
    case 'signal':
      return sendSignalNotification(channel.phone, payload);
    case 'imessage':
      return sendiMessageNotification(channel.phone, payload);
    default:
      return {
        success: false,
        channel: 'unknown',
        error: 'Unsupported notification channel',
      };
  }
}

// ============================================
// STANDALONE CHANNEL IMPLEMENTATIONS
// (Only used when NOT running in OpenClaw)
// ============================================

async function sendTelegramNotification(
  chatId: string,
  payload: NotificationPayload
): Promise<NotificationResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { success: false, channel: 'telegram', error: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  try {
    const message = `*${escapeMarkdown(payload.title)}*\n\n${escapeMarkdown(payload.body)}`;

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          // MarkdownV2 matches the escaping in escapeMarkdown()
          parse_mode: 'MarkdownV2',
        }),
      }
    );

    const data = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string };

    if (data.ok) {
      return {
        success: true,
        channel: 'telegram',
        messageId: String(data.result?.message_id),
      };
    } else {
      return { success: false, channel: 'telegram', error: data.description };
    }
  } catch (error) {
    return {
      success: false,
      channel: 'telegram',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function sendWhatsAppNotification(
  phone: string,
  payload: NotificationPayload
): Promise<NotificationResult> {
  const accountSid = process.env.TWILIO_SID;
  const authToken = process.env.TWILIO_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !fromNumber) {
    return {
      success: false,
      channel: 'whatsapp',
      error: 'Twilio WhatsApp credentials not configured',
    };
  }

  try {
    const message = `${payload.title}\n\n${payload.body}`;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          From: `whatsapp:${fromNumber}`,
          To: `whatsapp:${phone}`,
          Body: message,
        }),
      }
    );

    const data = await response.json() as { sid?: string; message?: string };

    if (response.ok) {
      return { success: true, channel: 'whatsapp', messageId: data.sid };
    } else {
      return { success: false, channel: 'whatsapp', error: data.message };
    }
  } catch (error) {
    return {
      success: false,
      channel: 'whatsapp',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function sendEmailNotification(
  address: string,
  payload: NotificationPayload
): Promise<NotificationResult> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return {
      success: false,
      channel: 'email',
      error: 'SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS (and optionally SMTP_PORT, SMTP_FROM) in .env',
    };
  }

  try {
    const { default: nodemailer } = await import('nodemailer');
    const port = parseInt(process.env.SMTP_PORT ?? '587', 10);

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM ?? user,
      to: address,
      subject: payload.title,
      text: payload.body,
    });

    return { success: true, channel: 'email', messageId: info.messageId };
  } catch (error) {
    return {
      success: false,
      channel: 'email',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function sendSlackNotification(
  webhookUrl: string,
  payload: NotificationPayload
): Promise<NotificationResult> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: payload.title,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: payload.title },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: payload.body },
          },
        ],
      }),
    });

    if (response.ok) {
      return { success: true, channel: 'slack' };
    } else {
      return { success: false, channel: 'slack', error: await response.text() };
    }
  } catch (error) {
    return {
      success: false,
      channel: 'slack',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function sendDiscordNotification(
  webhookUrl: string,
  payload: NotificationPayload
): Promise<NotificationResult> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `**${payload.title}**\n\n${payload.body}`,
      }),
    });

    if (response.ok) {
      return { success: true, channel: 'discord' };
    } else {
      return { success: false, channel: 'discord', error: await response.text() };
    }
  } catch (error) {
    return {
      success: false,
      channel: 'discord',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function sendSMSNotification(
  phone: string,
  payload: NotificationPayload
): Promise<NotificationResult> {
  const accountSid = process.env.TWILIO_SID;
  const authToken = process.env.TWILIO_TOKEN;
  const fromNumber = process.env.TWILIO_SMS_FROM;

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, channel: 'sms', error: 'Twilio SMS credentials not configured' };
  }

  try {
    const message = `${payload.title}\n${payload.body}`.slice(0, 1600);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: phone,
          Body: message,
        }),
      }
    );

    const data = await response.json() as { sid?: string; message?: string };

    if (response.ok) {
      return { success: true, channel: 'sms', messageId: data.sid };
    } else {
      return { success: false, channel: 'sms', error: data.message };
    }
  } catch (error) {
    return {
      success: false,
      channel: 'sms',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function sendSignalNotification(
  _phone: string,
  _payload: NotificationPayload
): Promise<NotificationResult> {
  // Not implemented. Returning success here would silently mark reminders
  // as sent while the user receives nothing.
  return {
    success: false,
    channel: 'signal',
    error: 'Signal channel is not implemented yet (requires signal-cli). Use telegram, slack, discord, email, or sms.',
  };
}

async function sendiMessageNotification(
  _phone: string,
  _payload: NotificationPayload
): Promise<NotificationResult> {
  return {
    success: false,
    channel: 'imessage',
    error: 'iMessage channel is not implemented yet. Use telegram, slack, discord, email, or sms.',
  };
}

// ============================================
// HELPERS
// ============================================

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}
