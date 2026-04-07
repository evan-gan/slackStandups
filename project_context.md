# Standups Bot

A Slack bot that posts a daily standup message to a configured private channel on a cron schedule, then replies in the thread prompting team members to post updates. Both messages are configurable via environment variables using Slack mrkdwn format.

## Codebase Structure

```
standups/
├── src/
│   ├── index.js        — entry point: loads env, validates config, schedules the cron job
│   └── slack.js        — Slack API wrapper: postStandup() sends parent message + thread reply
├── tests/
│   ├── run_all.js              — test runner entry point (pnpm test)
│   ├── test_post_standup.js    — unit tests for standup posting with a mock Slack client
│   ├── test_validate_env.js    — unit tests for environment variable validation
│   └── test_integration.js     — live integration test: posts to Slack using .env config
├── manifest.yaml       — Slack app manifest for creating the bot
├── .env.example        — template for required environment variables
├── .gitignore
└── package.json
```

## Configuration

All config is via environment variables (see `.env.example`):
- `SLACK_BOT_TOKEN` — Bot token with required scopes
- `SLACK_CHANNEL_ID` — Target channel ID
- `STANDUP_MESSAGE` — Parent message in Slack mrkdwn format (`{date}` placeholder for today's date, `\n` for newlines)
- `THREAD_MESSAGE` — Thread reply message in Slack mrkdwn format
- `STANDUP_CRON` — Cron schedule (default: `0 9 * * 1-5`, weekdays at 9 AM)
- `TZ` — Timezone (default: `America/New_York`)

## Slack App Setup

The bot requires these OAuth scopes (defined in `manifest.yaml`):
- `chat:write` — post messages
- `channels:join` — join public channels
- `groups:write` — write to private channels
- `groups:history` — read thread replies in private channels (used by integration test)

The bot must be invited to private channels before it can post.
