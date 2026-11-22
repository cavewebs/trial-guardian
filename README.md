# Trial Guardian

CLI and OpenClaw skill that scans email for free trials and subscriptions, then reminds you before a trial converts to a paid plan. It can list cancellation steps and flag risky terms.

Subscription data stays in `~/.trial-guardian` on your machine. There is no Trial Guardian server.

## Stack

- Node.js 22 or newer
- TypeScript
- IMAP (imapflow) or Gmail API, plus mbox/JSON ingest
- Optional AI: Anthropic, OpenAI, Gemini, Groq, or local Ollama
- Local JSON store (lowdb)

## Run it

```bash
git clone https://github.com/cavewebs/trial-guardian.git
cd trial-guardian
npm install
cp .env.example .env
npm run build
```

Set one AI key in `.env`, or skip AI and pass `--no-ai`.

```bash
npx trial-guardian config email add --email you@example.com
npx trial-guardian scan --days 180
npx trial-guardian trials
```

IMAP asks for an app password at the prompt. For Outlook, or if you do not want to store mail credentials, import an mbox or JSON export:

```bash
npx trial-guardian ingest export.mbox
```

Reminders only send when `trial-guardian check` runs. Add a daily cron entry if you want that.

```bash
npm test
npm run lint
```

See `SKILL.md` for the OpenClaw skill interface.

## Licence

MIT. Copyright (c) 2026 Timchosen Uzua.
