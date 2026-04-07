const assert = require("assert");
require("dotenv").config();
const { createSlackClient, postStandup } = require("../src/slack");

const REQUIRED_VARS = [
  "SLACK_BOT_TOKEN",
  "SLACK_CHANNEL_ID",
  "STANDUP_MESSAGE",
  "THREAD_MESSAGE",
];

function checkEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.log(
      `SKIP: integration test requires env vars: ${missing.join(", ")}`
    );
    process.exit(0);
  }
}

async function testLivePostFromEnv() {
  checkEnv();

  const client = createSlackClient(process.env.SLACK_BOT_TOKEN);
  const channelId = process.env.SLACK_CHANNEL_ID;

  const result = await postStandup(
    client,
    channelId,
    process.env.STANDUP_MESSAGE,
    process.env.THREAD_MESSAGE
  );

  assert.ok(result.parentTs, "Parent message should have a timestamp");
  assert.ok(result.replyTs, "Thread reply should have a timestamp");

  // Verify the thread reply is actually in the parent's thread
  const replies = await client.conversations.replies({
    channel: channelId,
    ts: result.parentTs,
  });

  const threadMessages = replies.messages.filter(
    (msg) => msg.ts !== result.parentTs
  );
  assert.ok(
    threadMessages.length >= 1,
    "Should have at least one reply in the thread"
  );
  assert.strictEqual(
    threadMessages[0].ts,
    result.replyTs,
    "Thread reply timestamp should match"
  );

  console.log("PASS: testLivePostFromEnv");
}

testLivePostFromEnv().catch((error) => {
  console.error(`FAIL: testLivePostFromEnv — ${error.message}`);
  process.exit(1);
});
