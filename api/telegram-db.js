/**
 * Property Scout — Telegram groups DB endpoint
 * Legge gli annunci salvati su Turso dai gruppi Telegram privati (scripts/telegram-fetch.js)
 * e li restituisce nello stesso formato lead delle altre piattaforme.
 */
import { createClient } from "@libsql/client";

let dbClient = null;
function getDb() {
  if (!dbClient) {
    dbClient = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return dbClient;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(200).json({ results: [] });
  }

  try {
    const db = getDb();
    await db.execute(`CREATE TABLE IF NOT EXISTS telegram_listings (
      id TEXT PRIMARY KEY, group_id TEXT, group_name TEXT, msg_id INTEGER,
      date INTEGER, text TEXT, price TEXT, email TEXT, whatsapp TEXT,
      phone TEXT, sender TEXT, link TEXT, created_at INTEGER DEFAULT (unixepoch())
    )`);

    const limit = Math.min(parseInt(req.query.limit, 10) || 60, 200);
    const r = await db.execute({
      sql: "SELECT * FROM telegram_listings ORDER BY date DESC LIMIT ?",
      args: [limit],
    });

    const results = r.rows.map((row) => ({
      platform: "telegram",
      name: "@" + (row.group_name || "gruppo privato"),
      type: "Annuncio Telegram (gruppo privato)",
      bio: (row.text || "").slice(0, 300),
      price: row.price || "",
      email: row.email || null,
      whatsapp: row.whatsapp || null,
      phone: row.phone || null,
      telegram_channel: row.group_name || null,
      channel_url: null,
      msg_id: row.msg_id,
      is_private: true,
      owner_managed: true,
      no_agency: true,
      src: row.link || null,
    }));

    res.status(200).json({ results });
  } catch (err) {
    res.status(200).json({ error: err.message, results: [] });
  }
}
