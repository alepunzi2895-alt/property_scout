/**
 * Diagnostico: chiede solo l'invio del codice di login e mostra
 * quale canale Telegram ha scelto per consegnarlo (sms/app/call/flashcall).
 * Uso: node scripts/telegram-debug-sendcode.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
const apiHash = process.env.TELEGRAM_API_HASH;

if (!apiId || !apiHash) {
  console.error("Manca TELEGRAM_API_ID o TELEGRAM_API_HASH in .env.local");
  process.exit(1);
}

(async () => {
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.connect();
  console.log("Connesso ai server Telegram.\n");

  const phone = await input.text("Numero di telefono (es. +34...): ");

  try {
    let result = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId,
        apiHash,
        settings: new Api.CodeSettings({}),
      })
    );
    console.log("\nTelegram ha accettato la richiesta.");
    console.log("Canale di invio scelto:", result.type.className);
    console.log("Dettagli:", JSON.stringify(result, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));

    const retry = await input.text("\nNon arriva nulla? Premi invio per forzare un canale alternativo (SMS/chiamata), oppure scrivi 'no' per uscire: ");
    if (retry.trim().toLowerCase() !== "no") {
      result = await client.invoke(
        new Api.auth.ResendCode({
          phoneNumber: phone,
          phoneCodeHash: result.phoneCodeHash,
        })
      );
      console.log("\nNuovo canale di invio:", result.type.className);
      console.log("Dettagli:", JSON.stringify(result, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    }
  } catch (err) {
    console.error("\nErrore da Telegram:", err.message || err);
  }

  await client.disconnect();
  process.exit(0);
})();
