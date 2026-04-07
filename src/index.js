require("dotenv").config();
const cron = require("node-cron");
const { createSlackClient, postStandup } = require("./slack");

const REQUIRED_ENV_VARS = ["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. See .env.example for reference.`
    );
  }
}

function main() {
  validateEnv();

  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CHANNEL_ID;
  const cronSchedule = process.env.STANDUP_CRON || "0 9 * * 1-5";
  const timezone = process.env.TZ || "America/New_York";

  if (!cron.validate(cronSchedule)) {
    throw new Error(
      `Invalid cron schedule: "${cronSchedule}". Use standard 5-field cron syntax.`
    );
  }

  const standupMessage =
    process.env.STANDUP_MESSAGE ||
    ":sunrise: *Standup for {date}*\\nDrop your update in the thread!";
  const threadMessage =
    process.env.THREAD_MESSAGE ||
    ":thread: Reply here with your standup update!";

  const client = createSlackClient(token);

  cron.schedule(
    cronSchedule,
    async () => {
      try {
        const result = await postStandup(
          client,
          channelId,
          standupMessage,
          threadMessage
        );
        console.log(
          `[${new Date().toISOString()}] Standup posted (ts: ${result.parentTs})`
        );
      } catch (error) {
        console.error(
          `[${new Date().toISOString()}] Failed to post standup: ${error.message}`
        );
      }
    },
    { timezone }
  );

  console.log(
    `Standup bot running — schedule: "${cronSchedule}" (${timezone}), channel: ${channelId}`
  );
}

main();
