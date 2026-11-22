---
name: trial-guardian
description: Monitor email for subscription trials, set cancellation reminders, analyze T&C for red flags, and help cancel before charges hit.
emoji: 🛡️
homepage: https://github.com/cavewebs/trial-guardian
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["node"]}}}
---

# Trial Guardian

A subscription monitoring skill that saves you money by tracking free trials and preventing unwanted charges.

## What This Skill Does

1. **Scans your email** for trial signups, subscription receipts, and renewal notices
2. **Extracts key details**: service name, trial end date, price, billing cycle
3. **Sends reminders** before trials convert to paid subscriptions
4. **Analyzes Terms & Conditions** to flag suspicious trial terms
5. **Provides cancellation instructions** or attempts auto-cancel when possible

## When to Use This Skill

Use Trial Guardian when the user:
- Asks to "scan for subscriptions" or "find my trials"
- Wants to "set up subscription monitoring"
- Asks about "upcoming charges" or "trial ending"
- Wants to "cancel a subscription" or needs "cancellation help"
- Asks to "check terms and conditions" for a service
- Wants a "subscription report" or "spending summary"

## How to Get Emails In (pick one)

1. **Host connector (preferred in OpenClaw/agent contexts)**: if you (the agent) already have an email tool connected, search the user's mailbox yourself for subscription-related emails (queries like `subject:(subscription OR trial OR receipt OR renewal)`, senders like `noreply@`/`billing@`), then pipe them to `trial-guardian ingest` as JSON. No email credentials are stored this way.
   ```bash
   echo '[{"from":"...","subject":"...","body":"...","date":"2026-07-01"}]' | trial-guardian ingest --account user@example.com
   ```
2. **IMAP app password**: `trial-guardian config email add --email user@gmail.com` (works for Gmail, Yahoo, iCloud, Fastmail, Zoho, ...). Then `trial-guardian scan`.
3. **Mailbox export**: `trial-guardian ingest export.mbox` for Google Takeout / Thunderbird exports.

## Commands

### Scan Connected Mailboxes
```bash
trial-guardian scan --days 180
```
Scans the last N days of email for subscription-related messages. Extracts trials, active subscriptions, and renewal notices. Already-processed emails are cached and skipped on rescans.

### Ingest Emails Without Credentials
```bash
trial-guardian ingest emails.json
trial-guardian ingest export.mbox
cat emails.json | trial-guardian ingest --account user@example.com
```
Runs the same extraction pipeline on a JSON array (`[{"from", "subject", "body", "date"}]`) or an mbox export.

### Check & Send Due Reminders
```bash
trial-guardian check
```
Creates reminders for tracked trials and sends any that are due. Must run on a schedule - reminders do not send themselves. In OpenClaw, schedule this with OpenClaw's own cron/scheduler; the command prints alerts to stdout and OpenClaw relays them to the user's channel. Standalone, use system cron.

### List All Tracked Subscriptions
```bash
trial-guardian list
```
Shows all tracked subscriptions with status, next billing date, and monthly cost.

### List Upcoming Trials Ending
```bash
trial-guardian trials
```
Shows trials ending in the next 14 days with countdown and charge amount.

### Set Reminder for a Subscription
```bash
trial-guardian remind "Service Name" --days 3
```
Set a reminder N days before trial ends. Reminders sent via configured notification channel.

### Analyze Terms & Conditions
```bash
trial-guardian analyze-tc "Service Name"
```
Fetches and analyzes the T&C for red flags: auto-renewal traps, cancellation windows, hidden fees, price increases.

### Get Cancellation Instructions
```bash
trial-guardian cancel-help "Service Name"
```
Returns step-by-step cancellation instructions for the service, including direct links, phone numbers, and tips.

### Generate Subscription Report
```bash
trial-guardian report
```
Generates a summary: total monthly spend, trials ending soon, potential savings, flagged services.

### Configure Notifications
```bash
trial-guardian config notifications --channel whatsapp --phone "+1234567890"
trial-guardian config notifications --channel telegram --chat-id "123456"
trial-guardian config notifications --channel email --address "you@email.com"
```
Set preferred notification channel for reminders.

### Add Email Account
```bash
trial-guardian config email add --email you@gmail.com                       # IMAP, host auto-detected
trial-guardian config email add --email you@example.com --host imap.example.com
trial-guardian config email add --provider gmail                            # Gmail API OAuth (advanced)
```
Connect email accounts to monitor. IMAP prompts for an app password with hidden input - do not pass it as a flag in an agent transcript.

## Example Interactions

**User**: "Scan my email for any subscriptions I might have forgotten about"
**Action**: Run `trial-guardian scan --days 365` then present findings in a table with service name, status, cost, and next billing date.

**User**: "What trials do I have ending soon?"
**Action**: Run `trial-guardian trials` and present urgent items first, with warnings for any requiring advance cancellation notice.

**User**: "Help me cancel Adobe Creative Cloud"
**Action**: Run `trial-guardian cancel-help "Adobe Creative Cloud"` and provide the step-by-step instructions. Offer to set a reminder if they want to cancel later.

**User**: "Are there any red flags in the Audible terms?"
**Action**: Run `trial-guardian analyze-tc "Audible"` and summarize the findings, highlighting any concerning clauses.

**User**: "Set up monitoring so I don't get charged for forgotten trials"
**Action**: Configure the skill to run daily scans and send reminders 7, 3, and 1 days before trial end dates via their preferred channel.

## Output Formats

### Subscription List Output
```
┌──────────────────┬──────────┬─────────────┬────────────────┬───────────┐
│ Service          │ Status   │ Cost        │ Next Billing   │ Risk      │
├──────────────────┼──────────┼─────────────┼────────────────┼───────────┤
│ Netflix          │ Active   │ $15.99/mo   │ Feb 15, 2026   │ Low       │
│ Adobe CC         │ Trial    │ $54.99/mo   │ Feb 8, 2026    │ ⚠️ High   │
│ Audible          │ Trial    │ $14.95/mo   │ Feb 5, 2026    │ Medium    │
└──────────────────┴──────────┴─────────────┴────────────────┴───────────┘
```

### Trial Alert Notification
```
🚨 Trial Alert: Adobe Creative Cloud

Ends in: 3 days (Feb 8, 2026)
Will charge: $54.99/month

⚠️ Warning: T&C requires cancellation via chat support

📋 How to cancel:
1. Go to: account.adobe.com/plans
2. Click "Cancel Plan"
3. Complete chat with support agent
⏱️ Estimated time: 10-15 minutes

[View Instructions] [Remind Tomorrow] [Mark Cancelled]
```

### T&C Analysis Output
```
📋 Terms Analysis: Audible

Risk Score: 6/10 (Medium)

🚩 Red Flags Found:
• Auto-renews monthly after trial
• Must cancel 24hrs before renewal
• Unused credits expire after 6 months

✅ Positive Terms:
• Easy web-based cancellation
• Prorated refund available
• Keep purchased books after cancel

💡 Recommendation: Cancel 2 days early to ensure processing time
```

## File Locations

Data lives in `~/.trial-guardian/` (override with `TRIAL_GUARDIAN_DATA_DIR`):

- Subscription database: `subscriptions.json`
- Configuration + credentials: `config.json` (chmod 600)
- Reminders: `reminders.json`
- Processed-email cache: `scan-cache.json`
- Cancellation instructions: `cancellation-db.json`

## Environment Variables

- `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` / `GROQ_API_KEY` / `GOOGLE_AI_API_KEY` / `OLLAMA_MODEL`) - AI provider for extraction; omit and use `--no-ai` for pattern matching only
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - (Optional) only for the Gmail API OAuth path
- `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` - (Optional) email notification channel
- `TWILIO_SID` / `TWILIO_TOKEN` - (Optional) WhatsApp/SMS notifications
- `TELEGRAM_BOT_TOKEN` - (Optional) Telegram notifications

## Notes

- Subscription data is stored locally; in AI mode, candidate email content is sent to the configured AI provider (use Ollama or `--no-ai` to keep it fully local)
- Email access is read-only - the skill cannot modify or delete emails
- Credentials are stored in the local config file protected by file permissions (0600), not encrypted
- Reminders require `trial-guardian check` to run on a schedule
- AI-generated cancellation guides are best-effort; verify URLs/phone numbers before acting on them
