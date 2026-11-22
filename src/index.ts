// Trial Guardian - Main Export

export * from './types.js';

// Database
export * from './db/database.js';

// Parsers
export { parseEmailForSubscription, mergeSubscriptionUpdates } from './parsers/email-parser.js';
export { GmailClient, createGmailClient } from './parsers/gmail.js';

// Email sources (Gmail API, IMAP, credential-free ingest)
export { createEmailSource, type EmailSource, type FetchOptions } from './sources/source.js';
export { ImapSource, imapPresetForEmail, testImapConnection } from './sources/imap.js';
export { GmailSource } from './sources/gmail-source.js';
export { parseEmailJson, parseMbox, splitMbox } from './sources/ingest.js';

// Scan pipeline
export { processEmails, type PipelineStats, type PipelineOptions } from './scan/pipeline.js';

// Utils
export { formatPrice, normalizeServiceName } from './utils/format.js';
export {
  SERVICE_PATTERNS,
  COMMON_PATTERNS,
  matchServiceFromEmail,
  isLikelySubscriptionEmail,
  extractPrice,
  extractBillingCycle,
} from './parsers/patterns.js';

// T&C Analyzer
export { analyzeTermsAndConditions } from './analyzer/tc-analyzer.js';

// Notifications
export {
  sendNotification,
  formatTrialAlert,
  formatManualCancelNotification,
  formatAsPlainText,
  formatAsMarkdown,
  // OpenClaw integration
  isRunningInOpenClaw,
  getOpenClawContext,
} from './notifications/notifier.js';

// Scheduler
export {
  initializeScheduler,
  stopScheduler,
  processReminders,
  computeReminderDate,
  createRemindersForSubscription,
  createSingleReminder,
  checkAndCreateReminders,
  getUpcomingReminders,
  cancelRemindersForSubscription,
} from './scheduler/scheduler.js';

// Cancellation
export {
  DEFAULT_CANCELLATION_INSTRUCTIONS,
  initializeCancellationDb,
  findInstructionsByName,
} from './cancellation/instructions-db.js';

// AI-powered extraction
export {
  extractSubscriptionFromEmail,
  analyzeTermsWithAI,
  generateCancellationInstructions,
  batchExtractSubscriptions,
  preFilterEmails,
} from './ai/extractor.js';

// AI Provider (vendor-agnostic)
export {
  // Types
  type AIProvider,
  type AIMessage,
  type AICompletionOptions,
  type AICompletionResult,
  type ProviderConfig,
  type ProviderName,
  // Providers
  AnthropicProvider,
  OpenAIProvider,
  OllamaProvider,
  GeminiProvider,
  GroqProvider,
  // Factory & helpers
  createProvider,
  setDefaultProvider,
  getDefaultProvider,
  complete,
  completeJSON,
} from './ai/provider.js';
