# Pokemon Twitter/X Giveaway Automation Bot

A production-ready Node.js + TypeScript automation service for discovering, parsing, and entering Pokemon card/product giveaways on Twitter/X. It includes Playwright browser automation, OpenAI-compatible instruction parsing, Discord webhook notifications, JSON persistence, safety filters, scheduling, retries, Docker support, and a dashboard.

> Important: automation on social platforms can violate platform rules. The bot ships in `DRY_RUN=true` mode by default. Review Twitter/X rules, local laws, and giveaway terms before enabling live actions.

## Architecture

```text
src/
  automation/       Playwright Twitter/X browser actions
  config/           dotenv + config.json validation/runtime context
  notifications/    Discord webhook notifications
  parsers/          AI + rule-based giveaway instruction parser
  services/         orchestration, queue, scheduler, safety, AI service
  storage/          JSON database for entries/failures/known tweets
  utils/            logging, retry, delays, randomization helpers
  index.ts          application bootstrap
  server.ts         Express API + dashboard host

dashboard/          React/Vite dashboard
config/             runtime configuration
```

## Features

- Monitors Twitter/X search terms, hashtags, advanced queries, and configured accounts.
- Parses natural-language giveaway instructions into structured JSON.
- Detects follow, like, repost, reply, tag friends, quote repost, Discord join, and link visit requirements.
- Uses OpenAI-compatible parsing when configured, with a local rule parser fallback.
- Executes modular Playwright actions with randomized delays and human typing simulation.
- Supports dry-run mode, headed/headless mode, persisted browser profile, stable locale/timezone, and proxy placeholder.
- Tracks duplicate tweets, entries, failures, hourly/daily rate limits, blacklist keywords/accounts, purchase-required skips, and crypto/NFT skips.
- Sends Discord notifications for entries, failed actions, captcha/login issues, and high-value giveaways.
- Provides an Express API and React dashboard for start/stop, entries, logs, stats, settings, keywords, and monitored accounts.

## Setup

```bash
npm install
cp .env.sample .env
cp config/config.json config/local.config.json # optional
npm run playwright:install
```

Edit `.env` and `config/config.json` before running.

### Environment variables

- `DRY_RUN=true` keeps the bot from performing Twitter/X actions.
- `HEADLESS=true` runs Playwright without a visible browser.
- `DISCORD_WEBHOOK_URL` enables Discord notifications.
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` enable AI parsing/reply generation.
- `TWITTER_USERNAME`, `TWITTER_PASSWORD`, and optional `TWITTER_EMAIL` are used only if a persisted session is not already logged in.

No credentials are hardcoded.

## Run locally

```bash
npm run dev
```

Open `http://localhost:3000` after building the dashboard, or run the dashboard dev server separately:

```bash
npm run dev:dashboard
```

For production-style local run:

```bash
npm run build
npm start
```


## Live-run checklist

The automated entry path is implemented, but live Twitter/X actions were not exercised in CI because they require a real account, an authenticated browser session, and platform-dependent UI state. Before expecting live entries and Discord alerts:

1. Copy `.env.sample` to `.env` and set `DISCORD_WEBHOOK_URL`.
2. Keep `DRY_RUN=true` for the first run and verify parser output, entries, logs, and Discord delivery.
3. Run once with `HEADLESS=false` and log in to Twitter/X if the account needs MFA, captcha, or manual verification. The session is persisted in `data/browser-profile`.
4. Add safe `replies.usernamesForTagging` in `config/config.json` if you want tag-friend entries.
5. Review rate limits, blacklist accounts, blocked keywords, and monitored searches/accounts.
6. To enable live actions, set `DRY_RUN=false` in `.env` and set `automation.dryRun` to `false` in `config/config.json`.
7. Start with conservative hourly/daily limits and watch the dashboard/Discord alerts for failures.

If Twitter/X shows captcha, login verification, or unusual-activity screens, the bot will stop that flow and send a Discord notification when a webhook is configured.

## Dashboard

The dashboard supports:

- Start/stop bot
- Trigger poll now
- View entries, logs, and stats
- Toggle automation and dry-run settings
- Add keywords
- Add monitored accounts

## Dry-run testing

Dry-run mode records intended actions without clicking Twitter/X controls. You can also test parser behavior directly:

```bash
curl -X POST http://localhost:3000/api/test/parse \
  -H 'Content-Type: application/json' \
  -d '{"text":"Follow + RT + tag 2 friends for a Pokemon booster box giveaway","authorHandle":"poke_shop"}'
```

Or process a synthetic tweet in dry-run mode:

```bash
curl -X POST http://localhost:3000/api/test/process \
  -H 'Content-Type: application/json' \
  -d '{"text":"Like, repost, and follow @pokemon. Reply with your favorite Pokemon!","authorHandle":"poke_shop"}'
```

## Docker

```bash
docker build -t pokemon-giveaway-bot .
docker run --rm -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/config/config.json:/app/config/config.json \
  pokemon-giveaway-bot
```

The Docker image uses the official Playwright base image so Chromium dependencies are available.

## Configuration

`config/config.json` controls:

- Search terms, hashtags, monitored accounts, and advanced queries
- Hourly/daily entry limits
- Random delay ranges and retry settings
- Reply templates and taggable usernames
- Blacklisted accounts and blocked/required keywords
- AI parser settings
- Headless/dry-run behavior

Example parser output:

```json
{
  "follow": ["@pokemon"],
  "like": true,
  "retweet": true,
  "reply": true,
  "tagCount": 2,
  "quoteRetweet": false,
  "joinDiscord": false,
  "visitLinks": []
}
```

## Browser session persistence

The bot uses `data/browser-profile` as a persistent Playwright profile. For accounts requiring MFA or manual verification, run with `HEADLESS=false`, log in once, then stop the process. Later runs can reuse the profile.

## Safety notes

- `DRY_RUN=true` is the default.
- Purchase-required, crypto, NFT, blacklisted, and low-confidence tweets are skipped.
- Duplicate entries are prevented using persisted tweet IDs.
- Configure conservative rate limits and cooldowns.
- Discord notifications make failures and login/captcha issues visible.

## Future extension points

- Add multiple Twitter/X account profiles by instantiating `TwitterAutomation` per account.
- Replace JSON storage with SQLite behind the same storage service contract.
- Add OCR for image-based instructions in a parser extension.
- Add richer scoring for giveaway value and account trust.
