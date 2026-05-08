const FIZZY_REQUIRED_ENV_VARS = [
  "FIZZY_ACCESS_TOKEN",
  "FIZZY_ACCOUNT_ID",
  "FIZZY_BOARD_ID",
];

const DONE_WINDOW_MS = 24 * 60 * 60 * 1000;

const GREETING =
  "Goooooooooood morning @horizons-organizers! It's about that time...";

const PROMPT =
  "*Stand ups!*\n" +
  "• What did you get done yesterday\n" +
  "• What you want to get done today\n\n" +
  "Bullet points will suffice.\n\n" +
  "If you didn't do anything yesterday and/or won't get anything done today that's fine! Please just say so instead of not replying.";

const COLOR_EMOJI = {
  blue: "🟦",
  yellow: "🟨",
  green: "🟩",
  red: "🟥",
  orange: "🟧",
  purple: "🟪",
  pink: "🟪",
  gray: "⬜",
  grey: "⬜",
  black: "⬛",
  white: "⬜",
};

function isFizzyConfigured(env = process.env) {
  return FIZZY_REQUIRED_ENV_VARS.every((k) => !!env[k]);
}

let cachedAccount = null;

async function getFizzyAccount(env = process.env) {
  if (cachedAccount) return cachedAccount;
  const { createFizzyClient } = await import("@37signals/fizzy");
  const opts = {
    accessToken: env.FIZZY_ACCESS_TOKEN,
    accountId: env.FIZZY_ACCOUNT_ID,
  };
  if (env.FIZZY_BASE_URL) {
    const host = env.FIZZY_BASE_URL.replace(/\/+$/, "");
    opts.baseUrl = `${host}/${env.FIZZY_ACCOUNT_ID}`;
  }
  if (env.FIZZY_DEBUG) {
    opts.hooks = {
      onRequestStart: (info) =>
        console.log(`[fizzy:req] ${info.method} ${info.url} (attempt ${info.attempt})`),
      onRequestEnd: (info, result) =>
        console.log(
          `[fizzy:res] ${info.method} ${info.url} -> ${result.statusCode}${
            result.error ? ` err=${result.error.message}` : ""
          }`
        ),
    };
  }
  cachedAccount = createFizzyClient(opts);
  return cachedAccount;
}

async function settled(promise, label) {
  try {
    return await promise;
  } catch (err) {
    console.warn(`[fizzy] ${label} failed: ${err.message}`);
    return null;
  }
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// Hack Club's Fizzy instance doesn't expose a JSON endpoint for closed
// cards (every variant we tried returns 406). The web UI fetches them as
// HTML via Turbo Frame at /{accountId}/boards/{boardId}/columns/closed.
// Bearer auth works on this URL, so we scrape the article markup.
async function fetchClosedCardsHtml(env = process.env) {
  const host = (env.FIZZY_BASE_URL || "https://fizzy.do").replace(/\/+$/, "");
  const url = `${host}/${env.FIZZY_ACCOUNT_ID}/boards/${env.FIZZY_BOARD_ID}/columns/closed`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.FIZZY_ACCESS_TOKEN}`,
      Accept: "text/html, application/xhtml+xml",
      "Turbo-Frame": "closed_column",
      "User-Agent": "fizzy-slack-relay/1.0",
    },
    redirect: "manual",
  });
  if (!res.ok) {
    throw new Error(`closed-column HTML fetch: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const cards = [];
  const articleRe =
    /<article\b[^>]*\bclass="[^"]*\bcard\b[^"]*"[^>]*\bdata-id="(\d+)"[^>]*>([\s\S]*?)<\/article>/g;
  let m;
  while ((m = articleRe.exec(html)) !== null) {
    const number = parseInt(m[1], 10);
    const block = m[2];
    const hrefMatch = block.match(
      /<a\b[^>]*\bclass="[^"]*\bcard__link\b[^"]*"[^>]*\bhref="([^"]+)"/
    );
    const titleMatch = block.match(
      /<h3\b[^>]*\bclass="[^"]*\bcard__title\b[^"]*"[^>]*>([\s\S]*?)<\/h3>/
    );
    const timeMatches = [...block.matchAll(/<time\b[^>]*\bdatetime="(\d+)"/g)];
    const href = hrefMatch ? hrefMatch[1] : "";
    const cardUrl = href.startsWith("http") ? href : `${host}${href}`;
    const title = decodeEntities(titleMatch ? titleMatch[1] : "").trim();
    const lastActiveSec =
      timeMatches.length >= 2
        ? parseInt(timeMatches[1][1], 10)
        : timeMatches.length === 1
          ? parseInt(timeMatches[0][1], 10)
          : null;
    cards.push({
      id: `html_${number}`,
      number,
      title,
      url: cardUrl,
      closed: true,
      postponed: false,
      golden: /\bgolden\b/i.test(block),
      assignees: [],
      last_active_at: lastActiveSec
        ? new Date(lastActiveSec * 1000).toISOString()
        : undefined,
      created_at: lastActiveSec
        ? new Date(lastActiveSec * 1000).toISOString()
        : new Date().toISOString(),
    });
  }
  return cards;
}

async function fetchBoardOverview(account, boardId, { now = Date.now() } = {}) {
  const [board, columns, activeCards, closedCards] = await Promise.all([
    settled(account.boards.get(boardId), "boards.get"),
    settled(account.columns.list(boardId), "columns.list"),
    settled(account.cards.list({ boardIds: [boardId] }), "cards.list"),
    settled(
      account.cards
        .listClosedCards(boardId)
        .catch(() => fetchClosedCardsHtml()),
      "closed cards"
    ),
  ]);

  const safeColumns = columns || [];
  const safeActive = activeCards || [];
  const safeClosed = closedCards || [];

  // Hack Club's Fizzy instance ignores the `closure` filter and returns the
  // same set of cards for active and closed queries. Combine + dedupe by id.
  const seen = new Set();
  const allOpen = [];
  for (const card of [...safeActive, ...safeClosed]) {
    if (card.closed) continue;
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    allOpen.push(card);
  }

  // Cards without a column reference live in a synthetic "Maybe" group,
  // rendered first. This matches Hack Club's convention where unassigned
  // cards are the implicit triage / maybe pile.
  const MAYBE_COLUMN = {
    id: "__maybe__",
    name: "Maybe",
    color: { name: "blue" },
  };
  const cardsByColumn = new Map();
  cardsByColumn.set(MAYBE_COLUMN.id, []);
  for (const col of safeColumns) cardsByColumn.set(col.id, []);

  for (const card of allOpen) {
    const colId = (card.column && card.column.id) || MAYBE_COLUMN.id;
    if (!cardsByColumn.has(colId)) cardsByColumn.set(colId, []);
    cardsByColumn.get(colId).push(card);
  }

  const orderedColumns = [MAYBE_COLUMN, ...safeColumns];
  const columnGroups = orderedColumns
    .map((column) => ({ column, cards: cardsByColumn.get(column.id) || [] }))
    .filter((group) => group.cards.length > 0);

  const totalActive = columnGroups.reduce((n, g) => n + g.cards.length, 0);

  const cutoff = now - DONE_WINDOW_MS;
  const doneYesterday = Array.from(safeClosed)
    .filter((card) => {
      if (!card.closed) return false;
      const ts = card.last_active_at || card.created_at;
      return ts && new Date(ts).getTime() >= cutoff;
    })
    .sort((a, b) => {
      const ta = new Date(a.last_active_at || a.created_at).getTime();
      const tb = new Date(b.last_active_at || b.created_at).getTime();
      return tb - ta;
    });

  // If boards.get fell over (Hack Club's instance returns HTML for the
  // non-.json endpoint), synthesize a minimal board record from any card's
  // back-reference, falling back to a placeholder.
  const resolvedBoard =
    board ||
    (safeActive.find((c) => c.board) || {}).board ||
    { id: boardId, name: "Board", url: process.env.FIZZY_BASE_URL || "" };

  return { board: resolvedBoard, columnGroups, doneYesterday, totalActive };
}

function escapeMrkdwn(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function handleFromName(name) {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0];
  if (!first) return null;
  return first.toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

function assigneeSuffix(card) {
  const handles = (card.assignees || [])
    .map((u) => handleFromName(u && u.name))
    .filter(Boolean)
    .map((h) => `@${h}`);
  if (handles.length === 0) return " _(unassigned)_";
  return ` _(${handles.join(", ")})_`;
}

function cardLine(card, { showAssignee = true } = {}) {
  const star = card.golden ? "⭐ " : "";
  const link = `<${card.url}|#${card.number} ${escapeMrkdwn(card.title)}>`;
  const suffix = showAssignee ? assigneeSuffix(card) : "";
  return `• ${star}${link}${suffix}`;
}

function columnEmoji(column) {
  const colorName = column && column.color && column.color.name;
  return COLOR_EMOJI[String(colorName || "").toLowerCase()] || "⬜";
}

function formatHeaderDate(date) {
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const rest = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${weekday} ${rest}`;
}

function resolveBoardLink(board, env = process.env) {
  if (env.FIZZY_BASE_URL) return env.FIZZY_BASE_URL.replace(/\/+$/, "");
  return board.public_url || board.url;
}

function buildOverviewBlocks(
  overview,
  { date = new Date(), env = process.env } = {}
) {
  const { board, columnGroups, doneYesterday, totalActive } = overview;
  const blocks = [];

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: GREETING },
  });

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: "Fizzy Overview", emoji: true },
  });

  for (const { column, cards } of columnGroups) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${columnEmoji(column)} ${escapeMrkdwn(column.name)}*  _(${cards.length})_`,
      },
    });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: cards.map((c) => cardLine(c)).join("\n"),
      },
    });
    blocks.push({ type: "divider" });
  }

  if (doneYesterday.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*✅ Done yesterday*  _(${doneYesterday.length})_`,
      },
    });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: doneYesterday.map((c) => cardLine(c, { showAssignee: false })).join("\n"),
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `*Board:* ${escapeMrkdwn(board.name)}  •  ${formatHeaderDate(
          date
        )}  •  ${totalActive} active card${totalActive === 1 ? "" : "s"}  •  <${resolveBoardLink(
          board,
          env
        )}|Open board>`,
      },
    ],
  });

  blocks.push({ type: "divider" });
  blocks.push({ type: "markdown", text: PROMPT });

  return blocks;
}

module.exports = {
  isFizzyConfigured,
  getFizzyAccount,
  fetchBoardOverview,
  buildOverviewBlocks,
};
