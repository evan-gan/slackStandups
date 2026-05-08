require("dotenv").config();
const cron = require("node-cron");
const { createSlackClient, postStandup } = require("./slack");
const {
  isFizzyConfigured,
  getFizzyAccount,
  fetchBoardOverview,
  buildOverviewBlocks,
} = require("./fizzy");

const REQUIRED_ENV_VARS = ["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. See .env.example for reference.`
    );
  }
}

async function buildFizzyBlocks() {
  const account = await getFizzyAccount();
  const overview = await fetchBoardOverview(account, process.env.FIZZY_BOARD_ID);
  return buildOverviewBlocks(overview);
}

function makeRunner() {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CHANNEL_ID;
  const standupMessage =
    process.env.STANDUP_MESSAGE ||
    ":sunrise: *Standup for {date}*\\nDrop your update in the thread!";
  const threadMessage =
    process.env.THREAD_MESSAGE ||
    ":thread: Reply here with your standup update!";

  const client = createSlackClient(token);
  const fizzyEnabled = isFizzyConfigured();

  async function runStandupOnce() {
    const stamp = new Date().toISOString();
    let parentBlocks = null;
    if (fizzyEnabled) {
      try {
        parentBlocks = await buildFizzyBlocks();
      } catch (error) {
        console.error(
          `[${stamp}] Failed to build Fizzy overview, falling back to text: ${error.message}`
        );
      }
    }
    const result = await postStandup(
      client,
      channelId,
      standupMessage,
      threadMessage,
      { parentBlocks, skipThreadReply: !!parentBlocks }
    );
    console.log(
      `[${stamp}] Standup posted (ts: ${result.parentTs}${
        parentBlocks ? ", with Fizzy overview" : ""
      })`
    );
    return result;
  }

  return { runStandupOnce, fizzyEnabled };
}

async function dryRun() {
  if (!isFizzyConfigured()) {
    console.error(
      "Fizzy is not configured (set FIZZY_ACCESS_TOKEN and FIZZY_BOARD_ID). Nothing to preview."
    );
    process.exit(1);
  }
  const blocks = await buildFizzyBlocks();
  console.log(JSON.stringify({ blocks }, null, 2));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--once")) {
    await dryRun();
    return;
  }

  validateEnv();
  const { runStandupOnce, fizzyEnabled } = makeRunner();

  const cronSchedule = process.env.STANDUP_CRON || "0 9 * * 1-5";
  const timezone = process.env.TZ || "America/New_York";

  if (!cron.validate(cronSchedule)) {
    throw new Error(
      `Invalid cron schedule: "${cronSchedule}". Use standard 5-field cron syntax.`
    );
  }

  cron.schedule(
    cronSchedule,
    async () => {
      try {
        await runStandupOnce();
      } catch (error) {
        console.error(
          `[${new Date().toISOString()}] Failed to post standup: ${error.message}`
        );
      }
    },
    { timezone }
  );

  console.log(
    `Standup bot running — schedule: "${cronSchedule}" (${timezone}), channel: ${process.env.SLACK_CHANNEL_ID}, fizzy: ${
      fizzyEnabled ? "enabled" : "disabled"
    }`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
