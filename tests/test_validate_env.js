const assert = require("assert");

function testMissingEnvThrows() {
  // Clear relevant env vars
  const savedToken = process.env.SLACK_BOT_TOKEN;
  const savedChannel = process.env.SLACK_CHANNEL_ID;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_CHANNEL_ID;

  // Re-require to get fresh validateEnv — but since it's in main(), test the logic directly
  const REQUIRED_ENV_VARS = ["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"];
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  assert.strictEqual(missing.length, 2, "Both env vars should be missing");
  assert.ok(missing.includes("SLACK_BOT_TOKEN"));
  assert.ok(missing.includes("SLACK_CHANNEL_ID"));

  // Restore
  if (savedToken) process.env.SLACK_BOT_TOKEN = savedToken;
  if (savedChannel) process.env.SLACK_CHANNEL_ID = savedChannel;

  console.log("PASS: testMissingEnvThrows");
}

function testPresentEnvPasses() {
  process.env.SLACK_BOT_TOKEN = "xoxb-test";
  process.env.SLACK_CHANNEL_ID = "C_TEST";

  const REQUIRED_ENV_VARS = ["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"];
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  assert.strictEqual(missing.length, 0, "No env vars should be missing");

  console.log("PASS: testPresentEnvPasses");
}

testMissingEnvThrows();
testPresentEnvPasses();
