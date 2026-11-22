#!/usr/bin/env node

// Trial Guardian CLI - Main entry point

import 'dotenv/config';  // Load .env file
import { readFileSync } from 'fs';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { format, differenceInDays } from 'date-fns';
import * as db from './db/database.js';
import { createEmailSource } from './sources/source.js';
import { imapPresetForEmail, testImapConnection } from './sources/imap.js';
import { parseEmailJson, parseMbox } from './sources/ingest.js';
import { processEmails } from './scan/pipeline.js';
import { analyzeTermsAndConditions } from './analyzer/tc-analyzer.js';
import { initializeCancellationDb, findInstructionsByName } from './cancellation/instructions-db.js';
import { createSingleReminder, checkAndCreateReminders, processReminders } from './scheduler/scheduler.js';
import {
  analyzeTermsWithAI,
  generateCancellationInstructions,
} from './ai/extractor.js';
import { formatPrice } from './utils/format.js';
import { promptText, promptHidden } from './utils/prompt.js';
import type { EmailAccount, NotificationChannel } from './types.js';
import type { PipelineStats } from './scan/pipeline.js';

const program = new Command();

program
  .name('trial-guardian')
  .description('Monitor subscriptions, track trials, and prevent unwanted charges')
  .version('0.1.0');

// ============================================
// SCAN COMMAND
// ============================================
program
  .command('scan')
  .description('Scan email for subscriptions and trials')
  .option('-d, --days <number>', 'Number of days to look back', '180')
  .option('-a, --account <email>', 'Specific email account to scan')
  .option('--no-ai', 'Use pattern matching instead of AI (faster but less accurate)')
  .action(async (options) => {
    await initializeApp();

    const useAI = options.ai !== false;
    const spinner = ora(`Scanning emails for subscriptions${useAI ? ' (AI-powered)' : ''}...`).start();

    try {
      const accounts = await db.getEmailAccounts();

      if (accounts.length === 0) {
        spinner.fail('No email accounts configured. Run: trial-guardian config email add --provider gmail');
        return;
      }

      const targetAccounts = options.account
        ? accounts.filter((a) => a.email === options.account)
        : accounts;

      if (targetAccounts.length === 0) {
        spinner.fail(`Account ${options.account} not found`);
        return;
      }

      const totals: PipelineStats = {
        scanned: 0,
        skippedCached: 0,
        matched: 0,
        newSubscriptions: 0,
        updatedSubscriptions: 0,
        failed: 0,
      };

      for (const account of targetAccounts) {
        spinner.text = `Scanning ${account.email}...`;
        const onProgress = (message: string) => {
          spinner.text = `[${account.email}] ${message}`;
        };

        let emails;
        try {
          const source = createEmailSource(account);
          emails = await source.fetchSubscriptionEmails({
            daysBack: parseInt(options.days, 10),
            onProgress,
          });
        } catch (error) {
          spinner.warn(
            `Skipping ${account.email}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          spinner.start();
          continue;
        }

        const stats = await processEmails(emails, account.email, { useAI, onProgress });

        totals.scanned += stats.scanned;
        totals.skippedCached += stats.skippedCached;
        totals.matched += stats.matched;
        totals.newSubscriptions += stats.newSubscriptions;
        totals.updatedSubscriptions += stats.updatedSubscriptions;
        totals.failed += stats.failed;

        await db.updateEmailAccount(account.id, { lastSyncAt: new Date().toISOString() });
      }

      printScanSummary(spinner, totals);
      await printSubscriptionCounts();
    } catch (error) {
      spinner.fail(`Scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

// ============================================
// INGEST COMMAND
// ============================================
program
  .command('ingest [file]')
  .description('Import emails from a JSON payload or mbox export - no email credentials needed')
  .option('-f, --format <format>', 'Input format: json or mbox (auto-detected if omitted)')
  .option('-a, --account <email>', 'Email address to attribute these emails to', 'imported')
  .option('--no-ai', 'Use pattern matching instead of AI (faster but less accurate)')
  .action(async (file, options) => {
    await initializeApp();

    let raw: string;
    if (file) {
      raw = readFileSync(file, 'utf8');
    } else if (!process.stdin.isTTY) {
      raw = await readStdin();
    } else {
      console.log(chalk.red('No input. Pass a file path or pipe emails via stdin.'));
      console.log(chalk.dim('  trial-guardian ingest emails.json'));
      console.log(chalk.dim('  trial-guardian ingest takeout.mbox'));
      console.log(chalk.dim('  cat emails.json | trial-guardian ingest'));
      console.log(chalk.dim('\nJSON format: [{"from": "...", "subject": "...", "body": "...", "date": "2026-07-01"}]'));
      return;
    }

    const useAI = options.ai !== false;
    const inputFormat = options.format ?? detectIngestFormat(file, raw);
    const spinner = ora(`Parsing ${inputFormat} input...`).start();

    try {
      const emails = inputFormat === 'mbox' ? await parseMbox(raw) : parseEmailJson(raw);

      if (emails.length === 0) {
        spinner.fail('No emails found in input');
        return;
      }

      spinner.text = `Processing ${emails.length} emails${useAI ? ' (AI-powered)' : ''}...`;
      const stats = await processEmails(emails, options.account, {
        useAI,
        onProgress: (message) => { spinner.text = message; },
      });

      printScanSummary(spinner, stats);
      await printSubscriptionCounts();
    } catch (error) {
      spinner.fail(`Ingest failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

// ============================================
// CHECK COMMAND (for cron / scheduled runs)
// ============================================
program
  .command('check')
  .description('Create reminders for tracked trials and send any that are due (run this from cron)')
  .action(async () => {
    await initializeApp();

    const config = await db.getConfig();
    if (!config.notifications.defaultChannel) {
      const trials = (await db.getAllSubscriptions()).filter((s) => s.status === 'trial');
      if (trials.length > 0) {
        console.log(chalk.yellow(
          `⚠ ${trials.length} active trial${trials.length !== 1 ? 's' : ''} but no notification channel configured - reminders cannot be sent.`
        ));
        console.log(chalk.dim('  Set one up: trial-guardian config notifications --channel telegram --chat-id <id>'));
      }
    }

    const { created } = await checkAndCreateReminders();
    const { sent, failed } = await processReminders();

    if (created + sent + failed === 0) {
      console.log(chalk.dim('Nothing to do: no new reminders needed, none due.'));
    } else {
      if (created > 0) console.log(chalk.green(`✓ Created ${created} reminder${created !== 1 ? 's' : ''} for active trials`));
      if (sent > 0) console.log(chalk.green(`✓ Sent ${sent} due reminder${sent !== 1 ? 's' : ''}`));
      if (failed > 0) {
        console.log(chalk.red(`✗ ${failed} reminder${failed !== 1 ? 's' : ''} failed to send (left pending for retry)`));
        process.exitCode = 1;
      }
    }

    console.log(chalk.dim('\nTip: schedule this with cron, e.g.  0 9 * * *  trial-guardian check'));
  });

// ============================================
// LIST COMMAND
// ============================================
program
  .command('list')
  .description('List all tracked subscriptions')
  .option('-s, --status <status>', 'Filter by status (trial, active, cancelled)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await initializeApp();

    let subscriptions = await db.getAllSubscriptions();

    if (options.status) {
      subscriptions = subscriptions.filter((s) => s.status === options.status);
    }

    if (options.json) {
      console.log(JSON.stringify(subscriptions, null, 2));
      return;
    }

    if (subscriptions.length === 0) {
      console.log(chalk.yellow('No subscriptions found. Run "trial-guardian scan" to find subscriptions.'));
      return;
    }

    console.log('\n' + chalk.bold('Tracked Subscriptions:'));
    console.log('─'.repeat(80));

    // Sort by next billing date
    subscriptions.sort((a, b) => {
      const dateA = a.trialEndDate ?? a.nextBillingDate ?? '9999-12-31';
      const dateB = b.trialEndDate ?? b.nextBillingDate ?? '9999-12-31';
      return dateA.localeCompare(dateB);
    });

    for (const sub of subscriptions) {
      const statusColor = sub.status === 'trial' ? chalk.yellow : sub.status === 'active' ? chalk.green : chalk.gray;
      const endDate = sub.trialEndDate ?? sub.nextBillingDate;
      const daysUntil = endDate ? differenceInDays(new Date(endDate), new Date()) : null;

      console.log(`\n${chalk.bold(sub.serviceName)} ${statusColor(`[${sub.status}]`)}`);
      console.log(`  💰 ${formatPrice(sub.price, sub.currency)}/${sub.billingCycle}`);

      if (endDate) {
        const dateStr = format(new Date(endDate), 'MMM d, yyyy');
        const urgency = daysUntil !== null && daysUntil <= 3 ? chalk.red : daysUntil !== null && daysUntil <= 7 ? chalk.yellow : chalk.white;
        console.log(`  📅 Next charge: ${urgency(`${dateStr} (${daysUntil} days)`)}`);
      }

      if (sub.riskScore >= 7) {
        console.log(`  ⚠️  Risk: ${chalk.red('High')} (${sub.riskScore}/10)`);
      } else if (sub.riskScore >= 5) {
        console.log(`  ⚠️  Risk: ${chalk.yellow('Medium')} (${sub.riskScore}/10)`);
      }

      if (sub.accountEmail) {
        console.log(`  📧 Account: ${sub.accountEmail}`);
      }
    }

    console.log('\n' + '─'.repeat(80));
    console.log(`Total: ${subscriptions.length} subscriptions`);
  });

// ============================================
// TRIALS COMMAND
// ============================================
program
  .command('trials')
  .description('Show trials ending soon')
  .option('-d, --days <number>', 'Days to look ahead', '14')
  .action(async (options) => {
    await initializeApp();

    const daysAhead = parseInt(options.days, 10);
    const upcomingCharges = await db.getUpcomingCharges(daysAhead);
    const trials = upcomingCharges.filter((s) => s.status === 'trial');

    if (trials.length === 0) {
      console.log(chalk.green(`✓ No trials ending in the next ${daysAhead} days`));
      return;
    }

    console.log('\n' + chalk.bold.red(`⚠️  ${trials.length} Trial${trials.length > 1 ? 's' : ''} Ending Soon:`));
    console.log('─'.repeat(60));

    for (const trial of trials) {
      const endDate = trial.trialEndDate ?? trial.nextBillingDate;
      const daysUntil = endDate ? differenceInDays(new Date(endDate), new Date()) : null;

      console.log(`\n${chalk.bold(trial.serviceName)}`);
      console.log(`  ⏰ Ends in: ${chalk.red(`${daysUntil} day${daysUntil !== 1 ? 's' : ''}`)} (${format(new Date(endDate!), 'MMM d, yyyy')})`);
      console.log(`  💰 Will charge: ${formatPrice(trial.price, trial.currency)}/${trial.billingCycle}`);

      if (trial.riskFactors.length > 0) {
        console.log(`  ⚠️  Warnings: ${trial.riskFactors.join(', ')}`);
      }
    }

    console.log('\n' + chalk.dim('Run "trial-guardian cancel-help <service>" for cancellation instructions'));
  });

// ============================================
// REMIND COMMAND
// ============================================
program
  .command('remind <service>')
  .description('Set a reminder for a subscription')
  .option('-d, --days <number>', 'Days before end to remind', '3')
  .action(async (service, options) => {
    await initializeApp();

    const subscription = await db.getSubscriptionByName(service);

    if (!subscription) {
      console.log(chalk.red(`Subscription "${service}" not found`));
      return;
    }

    const config = await db.getConfig();

    if (!config.notifications.defaultChannel) {
      console.log(chalk.yellow('No notification channel configured. Run: trial-guardian config notifications --channel telegram --chat-id <id>'));
      return;
    }

    try {
      const reminder = await createSingleReminder(subscription, parseInt(options.days, 10));
      console.log(chalk.green(`✓ Reminder set for ${format(new Date(reminder.scheduledFor), 'MMM d, yyyy')}`));
    } catch (error) {
      console.log(chalk.red(`Failed to create reminder: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  });

// ============================================
// ANALYZE-TC COMMAND
// ============================================
program
  .command('analyze-tc <service>')
  .description('Analyze Terms & Conditions for red flags')
  .option('-u, --url <url>', 'URL of T&C page')
  .option('--no-ai', 'Use pattern matching instead of AI')
  .action(async (service, options) => {
    await initializeApp();

    const useAI = options.ai !== false;
    const spinner = ora(`Analyzing Terms & Conditions for ${service}${useAI ? ' (AI-powered)' : ''}...`).start();

    try {
      let analysis;

      if (useAI) {
        // Fetch the T&C page first
        let termsText = '';
        if (options.url) {
          spinner.text = `Fetching terms from ${options.url}...`;
          try {
            const response = await fetch(options.url);
            const html = await response.text();
            // Strip HTML tags for plain text
            termsText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          } catch {
            spinner.text = `Could not fetch URL, using AI knowledge...`;
          }
        }

        spinner.text = `AI analyzing terms for ${service}...`;
        analysis = await analyzeTermsWithAI(service, termsText);
      } else {
        analysis = await analyzeTermsAndConditions(service, { url: options.url });
      }

      spinner.stop();

      console.log('\n' + chalk.bold(`📋 Terms Analysis: ${service}`));
      console.log('─'.repeat(50));

      // Risk score with color
      const riskColor = analysis.riskScore >= 7 ? chalk.red : analysis.riskScore >= 5 ? chalk.yellow : chalk.green;
      console.log(`\nRisk Score: ${riskColor(`${analysis.riskScore}/10`)}`);

      // Red flags
      if (analysis.redFlags.length > 0) {
        console.log('\n' + chalk.red('🚩 Red Flags Found:'));
        for (const flag of analysis.redFlags) {
          const severityColor = flag.severity === 'high' ? chalk.red : flag.severity === 'medium' ? chalk.yellow : chalk.white;
          console.log(`  • ${severityColor(flag.description)}`);
        }
      }

      // Positive terms
      if (analysis.positiveTerms.length > 0) {
        console.log('\n' + chalk.green('✅ Positive Terms:'));
        for (const term of analysis.positiveTerms) {
          console.log(`  • ${term.description}`);
        }
      }

      // Key details
      console.log('\n' + chalk.bold('Key Details:'));
      console.log(`  Auto-renewal: ${analysis.autoRenewal ? chalk.yellow('Yes') : chalk.green('No')}`);
      console.log(`  Cancellation method: ${analysis.cancellationMethod}`);
      if (analysis.cancellationWindow) {
        console.log(`  Cancellation window: ${chalk.yellow(analysis.cancellationWindow)}`);
      }
      if (analysis.refundPolicy) {
        console.log(`  Refund policy: ${analysis.refundPolicy}`);
      }
      if (analysis.priceAfterTrial) {
        console.log(`  Price after trial: ${formatPrice(analysis.priceAfterTrial, 'USD')}`);
      }

      // Recommendation
      console.log('\n' + chalk.bold('💡 Recommendation:'));
      console.log(`  ${analysis.recommendation}`);
    } catch (error) {
      spinner.fail(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

// ============================================
// CANCEL-HELP COMMAND
// ============================================
program
  .command('cancel-help <service>')
  .description('Get cancellation instructions for a service')
  .option('--generate', 'Generate instructions with AI if not found')
  .action(async (service, options) => {
    await initializeApp();
    await initializeCancellationDb();

    const spinner = ora(`Looking up cancellation instructions for ${service}...`).start();

    let instructions = await db.getCancellationInstructions(service);
    let fallback = findInstructionsByName(service);
    let data = instructions ?? fallback;

    // If not found and --generate flag, use AI to generate
    if (!data && options.generate) {
      spinner.text = `No instructions found. Generating with AI for ${service}...`;
      try {
        data = await generateCancellationInstructions(service);
        // Save generated instructions for future use
        await db.addCancellationInstructions(data);
        spinner.succeed(`Generated and saved instructions for ${service}`);
      } catch (error) {
        spinner.fail(`Failed to generate instructions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
      }
    } else if (!data) {
      spinner.fail(`No cancellation instructions found for "${service}"`);
      console.log(chalk.dim('Run with --generate to create instructions using AI'));
      console.log(chalk.dim('Or search: https://www.google.com/search?q=how+to+cancel+' + encodeURIComponent(service)));
      return;
    } else {
      spinner.stop();
    }

    console.log('\n' + chalk.bold(`📋 How to Cancel: ${data.serviceName}`));
    console.log('─'.repeat(50));

    const difficultyColor = data.difficulty === 'easy' ? chalk.green : data.difficulty === 'medium' ? chalk.yellow : chalk.red;
    console.log(`\nMethod: ${data.method}`);
    console.log(`Difficulty: ${difficultyColor(data.difficulty)}`);
    console.log(`Estimated time: ${data.estimatedTime}`);

    if (data.cancellationUrl) {
      console.log(`\n🔗 URL: ${chalk.blue(data.cancellationUrl)}`);
    }

    if (data.webSteps && data.webSteps.length > 0) {
      console.log('\n' + chalk.bold('Steps:'));
      data.webSteps.forEach((step, i) => {
        console.log(`  ${i + 1}. ${step}`);
      });
    }

    if (data.phoneNumber) {
      console.log('\n' + chalk.bold('📞 Phone:'));
      console.log(`  Number: ${data.phoneNumber}`);
      if (data.phoneHours) console.log(`  Hours: ${data.phoneHours}`);
      if (data.bestTimeToCall) console.log(`  Best time: ${chalk.green(data.bestTimeToCall)}`);
    }

    if (data.retentionOfferTips) {
      console.log('\n' + chalk.bold('💡 Retention Offer Tips:'));
      console.log(`  ${data.retentionOfferTips}`);
    }

    if (data.specialNotes) {
      console.log('\n' + chalk.bold('📝 Notes:'));
      console.log(`  ${data.specialNotes}`);
    }

    if (data.alternativeServices && data.alternativeServices.length > 0) {
      console.log('\n' + chalk.bold('🔄 Alternatives:'));
      for (const alt of data.alternativeServices) {
        console.log(`  • ${alt.name} (${alt.priceDifference}) - ${alt.description}`);
      }
    }
  });

// ============================================
// REPORT COMMAND
// ============================================
program
  .command('report')
  .description('Generate a subscription report')
  .action(async () => {
    await initializeApp();

    const subscriptions = await db.getAllSubscriptions();

    if (subscriptions.length === 0) {
      console.log(chalk.yellow('No subscriptions found. Run "trial-guardian scan" first.'));
      return;
    }

    const active = subscriptions.filter((s) => s.status === 'active' || s.status === 'trial');
    const trials = subscriptions.filter((s) => s.status === 'trial');
    const upcomingCharges = await db.getUpcomingCharges(14);

    // Calculate totals
    const monthlySpend = active.reduce((sum, s) => {
      if (s.billingCycle === 'monthly') return sum + s.price;
      if (s.billingCycle === 'yearly') return sum + s.price / 12;
      if (s.billingCycle === 'weekly') return sum + s.price * 4.33;
      return sum;
    }, 0);

    const yearlySpend = monthlySpend * 12;

    console.log('\n' + chalk.bold('📊 Subscription Report'));
    console.log('═'.repeat(50));

    console.log('\n' + chalk.bold('Summary:'));
    console.log(`  Active subscriptions: ${active.length}`);
    console.log(`  Active trials: ${trials.length}`);
    console.log(`  Trials ending soon: ${upcomingCharges.filter((s) => s.status === 'trial').length}`);

    console.log('\n' + chalk.bold('Spending:'));
    console.log(`  Monthly: ${chalk.green(formatPrice(monthlySpend, 'USD'))}`);
    console.log(`  Yearly: ${chalk.green(formatPrice(yearlySpend, 'USD'))}`);

    if (upcomingCharges.length > 0) {
      console.log('\n' + chalk.bold('⚠️  Upcoming Charges (next 14 days):'));
      for (const sub of upcomingCharges.slice(0, 5)) {
        const endDate = sub.trialEndDate ?? sub.nextBillingDate;
        const daysUntil = endDate ? differenceInDays(new Date(endDate), new Date()) : null;
        console.log(`  • ${sub.serviceName}: ${formatPrice(sub.price, sub.currency)} in ${daysUntil} days`);
      }
    }

    // Flagged services
    const flagged = subscriptions.filter((s) => s.riskScore >= 7);
    if (flagged.length > 0) {
      console.log('\n' + chalk.bold('🚩 High Risk Services:'));
      for (const sub of flagged) {
        console.log(`  • ${sub.serviceName} (risk: ${sub.riskScore}/10)`);
        if (sub.riskFactors.length > 0) {
          console.log(`    ${chalk.dim(sub.riskFactors.join(', '))}`);
        }
      }
    }

    console.log('\n' + '═'.repeat(50));
  });

// ============================================
// CONFIG COMMANDS
// ============================================
const configCmd = program.command('config').description('Configure Trial Guardian');

// Config: Email management subcommand
const emailCmd = configCmd.command('email').description('Manage email accounts');

// Email: list accounts
emailCmd
  .command('list')
  .description('List configured email accounts')
  .action(async () => {
    await initializeApp();
    const accounts = await db.getEmailAccounts();
    if (accounts.length === 0) {
      console.log(chalk.yellow('No email accounts configured'));
      console.log(chalk.dim('Run: trial-guardian config email add --provider gmail'));
      return;
    }
    console.log('\nConfigured Email Accounts:');
    for (const account of accounts) {
      const hasCredentials = !!(account.imapHost && account.imapPassword) || !!account.accessToken;
      const status = hasCredentials ? chalk.green('✓ Connected') : chalk.yellow('⚠ Not authorized');
      const via = account.imapHost ? `imap: ${account.imapHost}` : account.provider;
      console.log(`  • ${account.email} (${via}) - ${status}`);
      console.log(`    Last sync: ${account.lastSyncAt ?? 'Never'}`);
    }
  });

// Email: add account
emailCmd
  .command('add')
  .description('Add an email account (imap recommended - works with Gmail, Yahoo, iCloud, Fastmail, ...)')
  .option('-p, --provider <provider>', 'How to connect: imap (recommended) or gmail (OAuth API)', 'imap')
  .option('-e, --email <email>', 'Email address (imap)')
  .option('--host <host>', 'IMAP host (auto-detected for common providers)')
  .option('--port <port>', 'IMAP port', '993')
  .option('--user <user>', 'IMAP username, if different from the email address')
  .option('--password <password>', 'App password (omit to be prompted securely - recommended)')
  .action(async (options) => {
    await initializeApp();

    if (options.provider === 'imap') {
      const email: string = options.email ?? (await promptText('Email address: '));
      if (!email.includes('@')) {
        console.log(chalk.red('That does not look like an email address'));
        return;
      }

      const preset = imapPresetForEmail(email);
      if (preset === 'microsoft') {
        console.log(chalk.red('\n❌ Outlook/Hotmail no longer supports IMAP password login (Microsoft removed it in 2024).'));
        console.log('Support for Microsoft accounts via OAuth is planned. In the meantime you can:');
        console.log('  • Forward subscription emails to a supported account, or');
        console.log('  • Export your mailbox and run: trial-guardian ingest export.mbox');
        return;
      }

      let host: string = options.host ?? preset?.host ?? '';
      if (preset && !options.host) {
        console.log(chalk.dim(`Detected provider, using ${preset.host}`));
        console.log(chalk.yellow(`Note: ${preset.note}`));
      }
      if (!host) {
        host = await promptText('IMAP host (e.g. imap.example.com): ');
      }
      if (!host) {
        console.log(chalk.red('IMAP host is required'));
        return;
      }

      const port = parseInt(options.port, 10);
      const user: string = options.user ?? email;
      const password: string =
        options.password ?? (await promptHidden(`App password for ${email} (input hidden): `));

      if (!password) {
        console.log(chalk.red('Password is required'));
        return;
      }
      if (options.password) {
        console.log(chalk.yellow('⚠ Passing --password on the command line leaves it in your shell history. Prefer the interactive prompt.'));
      }

      const spinner = ora(`Testing connection to ${host}...`).start();
      try {
        await testImapConnection({ host, port, secure: port === 993, user, password });
      } catch (error) {
        spinner.fail(`Could not connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log('\nTroubleshooting:');
        console.log('  • Make sure you are using an app password, not your normal password');
        console.log('  • Check that IMAP access is enabled in your provider settings');
        return;
      }

      const existingAccounts = await db.getEmailAccounts();
      const existing = existingAccounts.find((a) => a.email === email);

      if (existing) {
        await db.updateEmailAccount(existing.id, {
          provider: 'imap',
          imapHost: host,
          imapPort: port,
          imapUser: user,
          imapPassword: password,
        });
        spinner.succeed(`Updated IMAP credentials for ${chalk.green(email)}`);
      } else {
        const newAccount: EmailAccount = {
          id: crypto.randomUUID(),
          email,
          provider: 'imap',
          imapHost: host,
          imapPort: port,
          imapUser: user,
          imapPassword: password,
          lastSyncAt: null,
          isActive: true,
        };
        await db.addEmailAccount(newAccount);
        spinner.succeed(`Connected ${chalk.green(email)} via IMAP`);
      }

      console.log('\nYou can now scan for subscriptions:');
      console.log(chalk.cyan('  trial-guardian scan'));
      return;
    }

    if (options.provider === 'gmail') {
      // Check for required env vars
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.log(chalk.red('❌ Missing Google OAuth credentials'));
        console.log('\nPlease set these environment variables in your .env file:');
        console.log('  GOOGLE_CLIENT_ID=your_client_id');
        console.log('  GOOGLE_CLIENT_SECRET=your_client_secret');
        console.log('\nSee README.md for setup instructions.');
        return;
      }

      const { GmailClient } = await import('./parsers/gmail.js');
      const config = {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: 'http://localhost',
      };
      const authUrl = GmailClient.getAuthUrl(config);

      console.log('\n' + chalk.bold('📧 Connect Gmail Account'));
      console.log('─'.repeat(50));
      console.log('\n1. Open this URL in your browser:\n');
      console.log(chalk.blue(authUrl));
      console.log('\n2. Sign in with your Google account and click "Allow"');
      console.log('\n3. After authorizing, you\'ll be redirected to a page that won\'t load.');
      console.log('   That\'s expected! Look at the URL bar and copy the ' + chalk.yellow('code') + ' parameter.');
      console.log('\n   Example: http://localhost/?code=' + chalk.yellow('4/0AbCD...xyz') + '&scope=...');
      console.log('\n4. Run this command with the code:\n');
      console.log(chalk.cyan('   trial-guardian config email auth --code "YOUR_CODE_HERE"'));
      console.log();
    } else {
      console.log(chalk.yellow(`Provider "${options.provider}" is not supported`));
      console.log('Supported: imap (Gmail, Yahoo, iCloud, Fastmail, Zoho, ...), gmail (OAuth API)');
    }
  });

// Email: authorize with code
emailCmd
  .command('auth')
  .description('Complete Gmail authorization with code')
  .requiredOption('-c, --code <code>', 'Authorization code from Google')
  .action(async (options) => {
    await initializeApp();

    const spinner = ora('Exchanging authorization code for tokens...').start();

    try {
      // Check for required env vars
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        spinner.fail('Missing Google OAuth credentials in environment');
        return;
      }

      const { GmailClient } = await import('./parsers/gmail.js');
      const { google } = await import('googleapis');

      const config = {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: 'http://localhost',
      };

      // Exchange code for tokens
      const tokens = await GmailClient.getTokensFromCode(config, options.code);

      spinner.text = 'Fetching account information...';

      // Create OAuth2 client to get user's email
      const oauth2Client = new google.auth.OAuth2(
        config.clientId,
        config.clientSecret,
        config.redirectUri
      );
      oauth2Client.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expiry_date: tokens.expiry.getTime(),
      });

      // Get the user's email address from Gmail API
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      const userEmail = profile.data.emailAddress!;

      // Check if account already exists
      const existingAccounts = await db.getEmailAccounts();
      const existing = existingAccounts.find((a) => a.email === userEmail);

      if (existing) {
        // Update existing account
        await db.updateEmailAccount(existing.id, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiry: tokens.expiry.toISOString(),
        });
        spinner.succeed(`Updated tokens for ${chalk.green(userEmail)}`);
      } else {
        // Add new account
        const newAccount: EmailAccount = {
          id: crypto.randomUUID(),
          email: userEmail,
          provider: 'gmail',
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiry: tokens.expiry.toISOString(),
          lastSyncAt: null,
          isActive: true,
        };
        await db.addEmailAccount(newAccount);
        spinner.succeed(`Connected Gmail account: ${chalk.green(userEmail)}`);
      }

      console.log('\n' + chalk.green('✓ Gmail account connected successfully!'));
      console.log('\nYou can now scan for subscriptions:');
      console.log(chalk.cyan('  trial-guardian scan'));

    } catch (error) {
      spinner.fail('Failed to authorize');
      console.error(chalk.red('\nError:'), error instanceof Error ? error.message : 'Unknown error');
      console.log('\nTroubleshooting tips:');
      console.log('  • Make sure you copied the entire code from the URL');
      console.log('  • The code can only be used once - if it fails, start over with "config email add"');
      console.log('  • Check that GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set correctly');
    }
  });

// Email: remove account
emailCmd
  .command('remove')
  .description('Remove an email account')
  .argument('<email>', 'Email address to remove')
  .action(async (email) => {
    await initializeApp();

    const accounts = await db.getEmailAccounts();
    const account = accounts.find((a) => a.email === email);

    if (!account) {
      console.log(chalk.red(`Account "${email}" not found`));
      return;
    }

    await db.removeEmailAccount(account.id);
    console.log(chalk.green(`✓ Removed account: ${email}`));
  });

// Config: Set notifications
configCmd
  .command('notifications')
  .description('Configure notification channel')
  .option('-c, --channel <channel>', 'Channel: telegram, whatsapp, email, slack, discord')
  .option('--chat-id <id>', 'Telegram chat ID')
  .option('--phone <phone>', 'Phone number for WhatsApp/SMS')
  .option('--email <email>', 'Email address')
  .option('--webhook <url>', 'Webhook URL for Slack/Discord')
  .action(async (options) => {
    await initializeApp();

    if (!options.channel) {
      const config = await db.getConfig();
      if (config.notifications.defaultChannel) {
        console.log(`Current notification channel: ${config.notifications.defaultChannel.type}`);
      } else {
        console.log(chalk.yellow('No notification channel configured'));
      }
      return;
    }

    let channel: NotificationChannel;

    switch (options.channel) {
      case 'telegram':
        if (!options.chatId) {
          console.log(chalk.red('Telegram requires --chat-id'));
          return;
        }
        channel = { type: 'telegram', chatId: options.chatId };
        break;
      case 'whatsapp':
        if (!options.phone) {
          console.log(chalk.red('WhatsApp requires --phone'));
          return;
        }
        channel = { type: 'whatsapp', phone: options.phone };
        break;
      case 'email':
        if (!options.email) {
          console.log(chalk.red('Email requires --email'));
          return;
        }
        channel = { type: 'email', address: options.email };
        break;
      case 'slack':
      case 'discord':
        if (!options.webhook) {
          console.log(chalk.red(`${options.channel} requires --webhook`));
          return;
        }
        channel = { type: options.channel, webhookUrl: options.webhook };
        break;
      default:
        console.log(chalk.red(`Unknown channel: ${options.channel}`));
        return;
    }

    await db.updateConfig({
      notifications: {
        ...(await db.getConfig()).notifications,
        defaultChannel: channel,
      },
    });

    console.log(chalk.green(`✓ Notification channel set to ${options.channel}`));
  });

// ============================================
// HELPER FUNCTIONS
// ============================================

async function initializeApp(): Promise<void> {
  await db.initializeDatabase();
}

function printScanSummary(spinner: ReturnType<typeof ora>, stats: PipelineStats): void {
  const parts = [
    `${stats.matched} subscription emails`,
    `${stats.newSubscriptions} new`,
    `${stats.updatedSubscriptions} updated`,
  ];
  if (stats.skippedCached > 0) parts.push(`${stats.skippedCached} already seen`);
  if (stats.failed > 0) parts.push(chalk.red(`${stats.failed} failed (will retry next scan)`));

  spinner.succeed(`Done! Scanned ${stats.scanned} emails: ${parts.join(', ')}.`);
}

async function printSubscriptionCounts(): Promise<void> {
  const subscriptions = await db.getAllSubscriptions();
  console.log('\n' + chalk.bold('Subscription Summary:'));
  console.log(`  Total tracked: ${subscriptions.length}`);
  console.log(`  Active trials: ${subscriptions.filter((s) => s.status === 'trial').length}`);
  console.log(`  Active subscriptions: ${subscriptions.filter((s) => s.status === 'active').length}`);
}

function detectIngestFormat(file: string | undefined, content: string): 'json' | 'mbox' {
  if (file?.endsWith('.mbox')) return 'mbox';
  if (file?.endsWith('.json')) return 'json';
  const head = content.trimStart();
  if (head.startsWith('[') || head.startsWith('{')) return 'json';
  return 'mbox';
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// Run CLI
program.parse();
