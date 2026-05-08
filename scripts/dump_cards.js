require("dotenv").config();

const host = (process.env.FIZZY_BASE_URL || "https://fizzy.do").replace(/\/+$/, "");
const token = process.env.FIZZY_ACCESS_TOKEN;
const accountId = process.env.FIZZY_ACCOUNT_ID;
const boardId = process.env.FIZZY_BOARD_ID;

const base = `${host}/${accountId}`;
const jsonHeaders = {
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "User-Agent": "fizzy-probe/1.0",
};
const htmlHeaders = {
  Authorization: `Bearer ${token}`,
  Accept: "text/html, application/xhtml+xml",
  "Turbo-Frame": "closed_column",
  "User-Agent": "fizzy-probe/1.0",
};

async function get(path, headers = jsonHeaders) {
  const res = await fetch(`${base}${path}`, { headers, redirect: "manual" });
  if (!res.ok) {
    return { _error: `${res.status} ${res.statusText}`, _status: res.status };
  }
  return res.json().catch(() => ({ _error: "not json" }));
}

async function getHtml(path) {
  const res = await fetch(`${base}${path}`, { headers: htmlHeaders, redirect: "manual" });
  const body = await res.text();
  return { status: res.status, statusText: res.statusText, body };
}

(async () => {
  const columns = await get(`/boards/${boardId}/columns.json`);
  console.log("=== columns ===");
  for (const c of columns) {
    console.log(`  ${c.id}  ${c.name}  color=${c.color && c.color.name}`);
  }

  // Probe the HTML closed-column URL with bearer auth.
  console.log("\n=== HTML probe: /boards/{id}/columns/closed (Turbo Frame) ===");
  const htmlRes = await getHtml(`/boards/${boardId}/columns/closed`);
  console.log(`  status=${htmlRes.status} ${htmlRes.statusText}  body length=${htmlRes.body.length}`);
  console.log("  --- body preview (first 500 chars) ---");
  console.log(htmlRes.body.slice(0, 500));
  console.log("  --- end preview ---");

  const endpoints = [
    `/cards.json?board_ids[]=${boardId}`,
    `/cards.json?board_ids[]=${boardId}&closed=true`,
    `/cards.json?board_ids[]=${boardId}&status=closed`,
    `/cards.json?board_ids[]=${boardId}&statuses[]=closed`,
    `/cards.json?board_ids[]=${boardId}&include=closed`,
    `/cards.json?board_ids[]=${boardId}&filter=closed`,
    `/cards/closed.json?board_ids[]=${boardId}`,
    `/closed_cards.json?board_ids[]=${boardId}`,
    `/boards/${boardId}/cards.json`,
    `/boards/${boardId}/cards/closed.json`,
    `/boards/${boardId}/closed_cards.json`,
    `/boards/${boardId}/cards.json?closed=true`,
    `/boards/${boardId}/cards.json?status=closed`,
    `/boards/${boardId}/columns/not_now.json`,
    `/boards/${boardId}/columns/closed.json`,
    `/boards/${boardId}/columns/stream.json`,
    `/cards.json?board_ids[]=${boardId}&assignment_status=closed`,
  ];

  for (const ep of endpoints) {
    const data = await get(ep);
    console.log(`\n=== ${ep} ===`);
    if (data._error) {
      console.log(`  ERROR ${data._error}`);
      continue;
    }
    if (!Array.isArray(data)) {
      console.log("  (not an array)", typeof data);
      continue;
    }
    console.log(`  ${data.length} cards`);
    // Only show cards where closed=true to keep the dump readable.
    const closed = data.filter((c) => c.closed);
    if (closed.length === 0) {
      console.log("  (no closed cards in this response)");
      continue;
    }
    for (const card of closed) {
      console.log(
        `  #${card.number} closed=${card.closed} postponed=${card.postponed} ` +
          `last_active_at=${card.last_active_at} title="${card.title}"`
      );
    }
  }
})();
