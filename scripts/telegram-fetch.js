/**
 * Property Scout — Telegram MTProto fetch worker
 * Legge i messaggi nuovi dai gruppi Telegram privati elencati in telegram-groups.json
 * (a cui il tuo account e' iscritto) e li salva su Turso.
 * Pensato per girare periodicamente via GitHub Actions (vedi .github/workflows/telegram-fetch.yml)
 * ma funziona anche lanciato a mano: node scripts/telegram-fetch.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { createClient } = require("@libsql/client");
const groupNames = require("./telegram-groups.json");

const API_ID = parseInt(process.env.TELEGRAM_API_ID, 10);
const API_HASH = process.env.TELEGRAM_API_HASH;
const SESSION = process.env.TELEGRAM_SESSION;
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!API_ID || !API_HASH || !SESSION) {
  console.error("Mancano TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION. Lancia prima scripts/telegram-login.js");
  process.exit(1);
}
if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Mancano TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const RENT_RE = /affitt|vacan|rent|camera|appartament|stanza|disponibil|bedroom|posto letto|vendo|for rent|alquil|habitaci|piso|room|studio|attico|loft/i;
const PRICE_RE = /([\d]{2,5}(?:[.,]\d{3})?)\s*€/;

function extractContacts(text) {
  const t = (text || "").replace(/\s+/g, " ");
  const emailM = t.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const waM = t.match(/wa\.me\/([+\d]{8,15})|whatsapp[\s:+]*([+\d][\d\s-]{6,14})/i);
  const phM = t.match(/(?:\+|00)[1-9][\d\s-]{8,16}/);
  return {
    email: emailM ? emailM[0] : null,
    whatsapp: waM ? (waM[1] || waM[2] || "").replace(/\D/g, "") || null : null,
    phone: !waM && phM ? phM[0].replace(/\s+/g, "") : null,
  };
}

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // accenti
    .replace(/[^a-z0-9 ]/g, " ") // emoji/punteggiatura -> spazio
    .replace(/\s+/g, " ")
    .trim();
}

async function ensureSchema(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS telegram_listings (
    id TEXT PRIMARY KEY,
    group_id TEXT,
    group_name TEXT,
    msg_id INTEGER,
    date INTEGER,
    text TEXT,
    price TEXT,
    email TEXT,
    whatsapp TEXT,
    phone TEXT,
    sender TEXT,
    link TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS telegram_cursors (
    group_id TEXT PRIMARY KEY,
    last_msg_id INTEGER
  )`);
}

async function getCursor(db, groupId) {
  const r = await db.execute({
    sql: "SELECT last_msg_id FROM telegram_cursors WHERE group_id = ?",
    args: [groupId],
  });
  return r.rows.length ? Number(r.rows[0].last_msg_id) : 0;
}

async function setCursor(db, groupId, lastMsgId) {
  await db.execute({
    sql: `INSERT INTO telegram_cursors (group_id, last_msg_id) VALUES (?, ?)
          ON CONFLICT(group_id) DO UPDATE SET last_msg_id = excluded.last_msg_id`,
    args: [groupId, lastMsgId],
  });
}

function buildLink(groupId, msgId) {
  const idStr = String(groupId);
  if (idStr.startsWith("-100")) {
    return "https://t.me/c/" + idStr.slice(4) + "/" + msgId;
  }
  return null;
}

async function processGroup(client, db, dialog) {
  const groupId = dialog.id.toString();
  const groupName = dialog.title || groupId;
  const cursor = await getCursor(db, groupId);
  const isFirstRun = cursor === 0;
  const limit = isFirstRun ? 500 : 200;

  const messages = await client.getMessages(dialog.entity, { limit });
  let maxId = cursor;
  let saved = 0;

  for (const m of messages) {
    if (m.id > maxId) maxId = m.id;
    if (m.id <= cursor) continue;
    const text = m.message;
    if (!text || text.length < 15) continue;
    const priceM = text.match(PRICE_RE);
    if (!RENT_RE.test(text) && !priceM) continue;

    const ct = extractContacts(text);
    const senderId = m.senderId ? m.senderId.toString() : null;
    const id = groupId + "_" + m.id;

    await db.execute({
      sql: `INSERT INTO telegram_listings
              (id, group_id, group_name, msg_id, date, text, price, email, whatsapp, phone, sender, link)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET text = excluded.text, price = excluded.price`,
      args: [
        id, groupId, groupName, m.id, m.date || 0, text,
        priceM ? priceM[0] : null, ct.email, ct.whatsapp, ct.phone, senderId,
        buildLink(groupId, m.id),
      ],
    });
    saved++;
  }

  if (maxId > cursor) await setCursor(db, groupId, maxId);
  console.log(`[${groupName}] messaggi nuovi analizzati: ${messages.filter(m => m.id > cursor).length}, salvati: ${saved}`);
}

(async () => {
  const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  await ensureSchema(db);

  const client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {
    connectionRetries: 5,
  });
  await client.connect();

  const authorized = await client.checkAuthorization();
  if (!authorized) {
    console.error("Sessione Telegram non valida o scaduta. Rilancia scripts/telegram-login.js e aggiorna TELEGRAM_SESSION.");
    process.exit(1);
  }

  const dialogs = await client.getDialogs({ limit: 300 });
  const targets = groupNames.map(normalize);

  const matched = dialogs.filter((d) => {
    const t = normalize(d.title || "");
    if (!t) return false;
    return targets.some((name) => t.includes(name) || name.includes(t));
  });

  if (!matched.length) {
    console.warn("Nessun gruppo trovato tra i dialoghi dell'account per i nomi configurati in telegram-groups.json.");
  }

  for (const dialog of matched) {
    try {
      await processGroup(client, db, dialog);
    } catch (e) {
      console.error(`Errore su gruppo "${dialog.title}":`, e.message);
    }
  }

  await client.disconnect();
  process.exit(0);
})();
