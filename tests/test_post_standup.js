const assert = require("assert");
const { postStandup } = require("../src/slack");

const TEST_STANDUP_MSG = ":sunrise: *Standup for {date}*\\nDrop your update!";
const TEST_THREAD_MSG = ":thread: Reply here!";

// Tracks all calls to chat.postMessage for assertions
const postMessageCalls = [];

const mockClient = {
  chat: {
    postMessage: async (params) => {
      const fakeTs = `${Date.now()}.${postMessageCalls.length}`;
      postMessageCalls.push(params);
      return { ok: true, ts: fakeTs };
    },
  },
};

async function testPostStandupSendsParentAndThreadReply() {
  postMessageCalls.length = 0;
  const result = await postStandup(
    mockClient,
    "C_TEST_CHANNEL",
    TEST_STANDUP_MSG,
    TEST_THREAD_MSG
  );

  assert.strictEqual(
    postMessageCalls.length,
    2,
    "Should make exactly 2 calls to chat.postMessage"
  );

  // First call is the parent standup message
  const parentCall = postMessageCalls[0];
  assert.strictEqual(parentCall.channel, "C_TEST_CHANNEL");
  assert.ok(
    parentCall.text.includes("Standup for"),
    "Parent message should contain 'Standup for'"
  );
  assert.strictEqual(
    parentCall.thread_ts,
    undefined,
    "Parent message should not be threaded"
  );

  // Second call is the thread reply
  const replyCall = postMessageCalls[1];
  assert.strictEqual(replyCall.channel, "C_TEST_CHANNEL");
  assert.strictEqual(
    replyCall.thread_ts,
    result.parentTs,
    "Reply should be threaded to the parent message"
  );
  assert.ok(
    replyCall.text.toLowerCase().includes("reply here"),
    "Thread reply should prompt users to reply"
  );

  console.log("PASS: testPostStandupSendsParentAndThreadReply");
}

async function testPostStandupReturnsTimestamps() {
  postMessageCalls.length = 0;
  const result = await postStandup(
    mockClient,
    "C_TEST_CHANNEL",
    TEST_STANDUP_MSG,
    TEST_THREAD_MSG
  );

  assert.ok(result.parentTs, "Should return parentTs");
  assert.ok(result.replyTs, "Should return replyTs");
  assert.notStrictEqual(
    result.parentTs,
    result.replyTs,
    "Parent and reply timestamps should differ"
  );

  console.log("PASS: testPostStandupReturnsTimestamps");
}

(async () => {
  await testPostStandupSendsParentAndThreadReply();
  await testPostStandupReturnsTimestamps();
})();
