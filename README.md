# Property Scout

Sistema di discovery fornitori turistici con 8 canali reali, NLP, scoring AI e generazione messaggi.

## 8 Canali

| Canale | Metodo | API key |
|---|---|---|
| Google Maps | Serper.dev | Serper key (2.500/mese gratis) |
| Instagram | Apify | Apify token |
| Facebook Pages | Apify | Apify token |
| Telegram pubblici | Fetch t.me/s/ | Nessuna |
| MediaVacanze | Scraping HTML | Nessuna |
| Subito.it | Scraping HTML | Nessuna |
| Idealista | Scraping HTML | Nessuna |
| Immobiliare.it | Apify | Apify token |

## Variabili Vercel

Settings > Environment Variables:
- ANTHROPIC_API_KEY — NLP + message generator
- SERPER_API_KEY — Google Maps (opzionale, va anche nell'app)
- TURSO_DATABASE_URL, TURSO_AUTH_TOKEN — lette da `api/telegram-db.js` per restituire gli annunci dei gruppi Telegram

## Modulo gruppi Telegram (MTProto)

Legge i messaggi dai gruppi privati Telegram a cui il tuo account personale è iscritto
(vedi `scripts/telegram-groups.json`) e li salva su Turso; `api/telegram-db.js` li espone
alla ricerca quando la destinazione contiene "Ibiza".

Setup (una volta):
1. `npm install`
2. Copia `.env.example` in `.env.local` e compila `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`
   (da https://my.telegram.org) e `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`.
3. `npm run telegram:login` — login interattivo (numero, codice, eventuale 2FA). Copia la
   session string stampata in `.env.local` come `TELEGRAM_SESSION`.
4. `npm run telegram:fetch` — primo fetch manuale, popola Turso.
5. Su GitHub: Settings > Secrets and variables > Actions, aggiungi `TELEGRAM_API_ID`,
   `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
   Il workflow `.github/workflows/telegram-fetch.yml` gira ogni 15 minuti e aggiorna Turso.
6. Su Vercel: aggiungi `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` alle Environment Variables
   così `api/telegram-db.js` può leggere i dati.

`TELEGRAM_SESSION` equivale a un accesso completo al tuo account Telegram: non va mai
committata né condivisa, solo salvata come secret.

## Deploy

### Idealista: prova Apify su Ibiza

`npm run idealista:fetch` avvia `studio-amba/idealista-scraper` su 20 candidati
in affitto a Eivissa, appartamenti fino a 6.000 €/mese. Richiede `APIFY_TOKEN`,
`TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` in `.env.local`. Non condividere i valori.
La richiesta imposta `maxTotalChargeUsd=1` e un timeout di 300 secondi.
Per riprendere un run esistente senza avviarne un altro:
`npm run idealista:fetch -- --run=RUN_ID`.

I risultati normalizzati vengono salvati su Turso. L'app legge `/api/idealista-db`
senza avviare scraper a ogni ricerca. Non è previsto un aggiornamento automatico:
oltre 24 ore l'endpoint segnala che serve una nuova importazione. È un campione
di 20 candidati, non una ricerca completa dell'isola. Le agenzie rimangono
identificate come tali; un inserzionista non identificato resta sconosciuto.
Durata e deposito non vengono inventati quando mancano nella descrizione.

Verifiche: `node --test scripts/idealista-normalize.test.mjs scripts/rental-filter.test.mjs`.
Schema del fornitore: https://apify.com/studio-amba/idealista-scraper

```bash
git add .
git commit -m "Property Scout v1"
git push origin main --force
```

Costo mensile: ~0 EUR per uso normale.
