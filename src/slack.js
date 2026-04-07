const { WebClient } = require("@slack/web-api");

function createSlackClient(token) {
  return new WebClient(token);
}

/**
 * Post a standup message to a channel, then reply in the thread.
 *
 * Args:
 *   client: Slack WebClient instance
 *   channelId: Slack channel ID to post in
 *   standupMessage: Slack mrkdwn message for the parent post ({date} is replaced with today's date)
 *   threadMessage: Slack mrkdwn message for the thread reply
 *
 * Returns:
 *   Object with parentTs and replyTs timestamps
 */
async function postStandup(client, channelId, standupMessage, threadMessage) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Replace {date} placeholder and unescape literal \n from env vars
  const formattedStandup = standupMessage
    .replace(/\{date\}/g, today)
    .replace(/\\n/g, "\n");
  const formattedThread = threadMessage.replace(/\\n/g, "\n");

  const parentMessage = await client.chat.postMessage({
    channel: channelId,
    text: formattedStandup,
  });

  const threadReply = await client.chat.postMessage({
    channel: channelId,
    thread_ts: parentMessage.ts,
    text: formattedThread,
  });

  return { parentTs: parentMessage.ts, replyTs: threadReply.ts };
}

module.exports = { createSlackClient, postStandup };
