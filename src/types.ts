// Core types for Trial Guardian

export interface Subscription {
  id: string;
  serviceName: string;
  status: 'trial' | 'active' | 'cancelled' | 'expired';
  detectedAt: string; // ISO date

  // Billing info
  price: number;
  currency: string;
  billingCycle: 'monthly' | 'yearly' | 'weekly' | 'one-time';
  nextBillingDate: string | null; // ISO date
  trialEndDate: string | null; // ISO date

  // Service details
  serviceUrl: string | null;
  accountEmail: string | null;
  cancellationUrl: string | null;

  // Risk assessment
  riskScore: number; // 1-10
  riskFactors: string[];

  // Tracking
  sourceEmails: EmailReference[];
  reminders: Reminder[];
  notes: string;
}

export interface EmailReference {
  messageId: string;
  subject: string;
  from: string;
  date: string;
  emailAccount: string;
  snippet: string;
}

export interface Reminder {
  id: string;
  subscriptionId: string;
  scheduledFor: string; // ISO date
  channel: NotificationChannel;
  status: 'pending' | 'sent' | 'dismissed';
  sentAt: string | null;
}

export type NotificationChannel =
  | { type: 'email'; address: string }
  | { type: 'whatsapp'; phone: string }
  | { type: 'telegram'; chatId: string }
  | { type: 'signal'; phone: string }
  | { type: 'imessage'; phone: string }
  | { type: 'sms'; phone: string }
  | { type: 'slack'; webhookUrl: string }
  | { type: 'discord'; webhookUrl: string };

export interface EmailAccount {
  id: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'icloud' | 'protonmail' | 'imap';
  email: string;

  // OAuth tokens (for gmail, outlook)
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;

  // IMAP config (for generic accounts)
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPassword?: string; // encrypted

  lastSyncAt: string | null;
  isActive: boolean;
}

export interface TCAnalysis {
  serviceName: string;
  analyzedAt: string;
  sourceUrl: string | null;

  riskScore: number; // 1-10

  redFlags: TCFlag[];
  positiveTerms: TCFlag[];

  autoRenewal: boolean;
  cancellationWindow: string | null; // e.g., "24 hours before"
  cancellationMethod: CancellationMethod;
  refundPolicy: string | null;
  dataRetentionPolicy: string | null;
  priceAfterTrial: number | null;

  rawExcerpts: string[];
  recommendation: string;
}

export interface TCFlag {
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  excerpt?: string;
}

export type CancellationMethod =
  | 'web'
  | 'web-chat'
  | 'phone'
  | 'email'
  | 'in-person'
  | 'mail'
  | 'unknown';

export interface CancellationInstructions {
  serviceName: string;
  aliases: string[]; // Alternative names
  updatedAt: string;

  method: CancellationMethod;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedTime: string; // e.g., "5-10 minutes"

  // Web cancellation
  cancellationUrl?: string;
  webSteps?: string[];

  // Phone cancellation
  phoneNumber?: string;
  phoneHours?: string;
  bestTimeToCall?: string;
  phoneScript?: string;
  retentionOfferTips?: string;

  // Chat cancellation
  chatUrl?: string;
  chatSteps?: string[];

  // Email cancellation
  cancellationEmail?: string;
  emailTemplate?: string;

  // Other
  specialNotes?: string;
  alternativeServices?: AlternativeService[];
}

export interface AlternativeService {
  name: string;
  description: string;
  url: string;
  priceDifference: string; // e.g., "Free", "-$10/mo"
}

export interface Config {
  notifications: {
    defaultChannel: NotificationChannel | null;
    reminderDays: number[]; // e.g., [7, 3, 1]
  };
  emailAccounts: EmailAccount[];
  scanning: {
    autoScanEnabled: boolean;
    scanIntervalHours: number;
    lookbackDays: number;
  };
  autoCancel: {
    enabled: boolean;
    requireConfirmation: boolean;
  };
}

export interface ScanResult {
  scannedAt: string;
  emailAccount: string;
  emailsScanned: number;
  subscriptionsFound: Subscription[];
  newSubscriptions: number;
  updatedSubscriptions: number;
  errors: string[];
}

export interface SubscriptionReport {
  generatedAt: string;

  summary: {
    totalMonthlySpend: number;
    totalYearlySpend: number;
    activeSubscriptions: number;
    trialSubscriptions: number;
    trialsEndingSoon: number; // next 14 days
    potentialSavings: number;
  };

  upcomingCharges: {
    subscription: Subscription;
    daysUntilCharge: number;
    amount: number;
  }[];

  flaggedServices: {
    subscription: Subscription;
    reasons: string[];
  }[];

  recommendations: string[];
}

// Email parsing patterns
export interface SubscriptionPattern {
  serviceName: string;
  senderPatterns: RegExp[];
  subjectPatterns: RegExp[];
  bodyPatterns: RegExp[];
  pricePatterns: RegExp[];
  datePatterns: RegExp[];
  type: 'trial_start' | 'subscription_confirmation' | 'renewal_notice' | 'price_change' | 'trial_ending' | 'receipt';
}
