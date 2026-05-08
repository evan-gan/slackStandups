require("dotenv").config();

const host = (process.env.FIZZY_BASE_URL || "https://fizzy.do").replace(/\/+$/, "");
const token = process.env.FIZZY_ACCESS_TOKEN;
const accountId = process.env.FIZZY_ACCOUNT_ID;
const boardId = process.env.FIZZY_BOARD_ID;

if (!token || !accountId) {
  console.error("FIZZY_ACCESS_TOKEN and FIZZY_ACCOUNT_ID are required");
  process.exit(1);
}

const base = `${host}/${accountId}`;

const tokenStart = token.slice(0, 4);

const authVariants = [
  { name: "Bearer", headers: { Authorization: `Bearer ${token}` } },
  { name: "Token", headers: { Authorization: `Token ${token}` } },
  { name: "Token-token=", headers: { Authorization: `Token token="${token}"` } },
  { name: "X-API-Key", headers: { "X-API-Key": token } },
  { name: "X-Access-Token", headers: { "X-Access-Token": token } },
  { name: "Cookie-session_token", headers: { Cookie: `session_token=${token}` } },
  { name: "query-access_token", query: `access_token=${encodeURIComponent(token)}` },
];

const probePath = boardId
  ? `/boards/${boardId}/columns.json`
  : "/boards.json";

(async () => {
  console.log(`Probing ${base}${probePath} with token starting "${tokenStart}..."`);
  console.log("");

  for (const variant of authVariants) {
    const sep = probePath.includes("?") ? "&" : "?";
    const url = variant.query ? `${base}${probePath}${sep}${variant.query}` : `${base}${probePath}`;
    const headers = {
      Accept: "application/json",
      "User-Agent": "fizzy-probe/1.0",
      ...(variant.headers || {}),
    };
    let res;
    try {
      res = await fetch(url, { headers, redirect: "manual" });
    } catch (e) {
      console.log(`[${variant.name}] -> fetch error: ${e.message}`);
      continue;
    }
    const ctype = res.headers.get("content-type") || "";
    const loc = res.headers.get("location") || "";
    let body = "";
    try {
      body = await res.text();
    } catch {}
    const preview = body.replace(/\s+/g, " ").slice(0, 160);
    console.log(
      `[${variant.name.padEnd(22)}] -> ${res.status} ${res.statusText.padEnd(12)} ctype=${ctype.slice(0, 25).padEnd(25)} ${
        loc ? `loc=${loc} ` : ""
      }body=${preview}`
    );
  }
})();
