/**
 * Property Scout — Telegram login (one-time, interattivo)
 * Da lanciare A MANO nel tuo terminale: node scripts/telegram-login.js
 * Ti chiede numero di telefono, codice ricevuto su Telegram e (se attiva) la password 2FA.
 * In alternativa, login via QR (nessun codice da ricevere): node scripts/telegram-login.js --qr
 * Alla fine stampa una session string: copiala in .env.local come TELEGRAM_SESSION
 * e aggiungila anche come secret TELEGRAM_SESSION su GitHub (repo > Settings > Secrets > Actions).
 *
 * Non condividere mai la session string: equivale ad avere accesso al tuo account Telegram.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");
const qrcodeTerminal = require("qrcode-terminal");

const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
const apiHash = process.env.TELEGRAM_API_HASH;
const useQr = process.argv.includes("--qr");

if (!apiId || !apiHash) {
  console.error("Manca TELEGRAM_API_ID o TELEGRAM_API_HASH in .env.local");
  process.exit(1);
}

(async () => {
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  if (useQr) {
    await client.connect();
    console.log(
      "\nApri Telegram sul telefono > Impostazioni > Dispositivi collegati > Collega dispositivo desktop, e scansiona il QR qui sotto.\n" +
        "Si rigenera ogni 30s finché non lo scansioni.\n"
    );
    await client.signInUserWithQrCode(
      { apiId, apiHash },
      {
        qrCode: async ({ token }) => {
          const link = `tg://login?token=${token.toString("base64url")}`;
          qrcodeTerminal.generate(link, { small: true });
        },
        password: async () => await input.text("Password 2FA (lascia vuoto se non attiva): "),
        onError: (err) => console.error(err),
      }
    );
  } else {
    await client.start({
      phoneNumber: async () => await input.text("Numero di telefono (es. +34...): "),
      password: async () => await input.text("Password 2FA (lascia vuoto se non attiva): "),
      phoneCode: async (isCodeViaApp) => {
        console.log(
          isCodeViaApp
            ? "\n>> Il codice è stato mandato DENTRO l'app Telegram (messaggio dal contatto 'Telegram'), non via SMS.\n"
            : "\n>> Il codice è stato mandato via SMS/chiamata al numero inserito.\n"
        );
        return await input.text("Codice ricevuto su Telegram: ");
      },
      onError: (err) => console.error(err),
      forceSMS: process.env.TELEGRAM_FORCE_SMS === "1",
    });
  }

  console.log("\nLogin riuscito.\n");
  console.log("Session string (copiala in .env.local come TELEGRAM_SESSION):\n");
  console.log(client.session.save());
  console.log("\nAggiungila anche come secret GitHub 'TELEGRAM_SESSION' per far girare il fetch automatico.\n");

  await client.disconnect();
  process.exit(0);
})();
