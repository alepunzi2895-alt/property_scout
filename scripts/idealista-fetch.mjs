import 'dotenv/config';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';
import { ACTOR, PILOT_INPUT, normalizeIdealista } from './idealista-normalize.mjs';
dotenv.config({path:new URL('../.env.local',import.meta.url),quiet:true});

const token=process.env.APIFY_TOKEN;
if (!token || !process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error('Servono APIFY_TOKEN, TURSO_DATABASE_URL e TURSO_AUTH_TOKEN in .env.local.');
  process.exit(1);
}
async function api(path,body) {
  const r=await fetch('https://api.apify.com/v2'+path,{method:body?'POST':'GET',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  if (!r.ok) throw new Error('Apify HTTP '+r.status+'; controlla account, credito e accesso actor.');
  return r.json();
}
let db;
try {
  // Resume a known run without paying for another extraction.
  const resume=process.argv.find(a=>a.startsWith('--run='))?.slice(6);
  let run=(await api(resume?'/actor-runs/'+encodeURIComponent(resume):'/acts/'+ACTOR+'/runs?timeout=300&maxTotalChargeUsd=1',resume?undefined:PILOT_INPUT)).data;
  console.log('Apify run: '+run.id+' (20 candidati, limite addebito $1, timeout 300s).');
  const deadline=Date.now()+360000;
  while (['READY','RUNNING','TIMING-OUT','ABORTING'].includes(run.status) && Date.now()<deadline) {
    await new Promise(r=>setTimeout(r,5000));
    run=(await api('/actor-runs/'+run.id)).data;
  }
  if (run.status!=='SUCCEEDED') throw new Error('Run '+run.id+': '+run.status+'. Riprendi con --run='+run.id);
  const items=await api('/datasets/'+run.defaultDatasetId+'/items?clean=true&limit=20');
  if (!Array.isArray(items)) throw new Error('Dataset inatteso');
  const rows=items.map(normalizeIdealista).filter(Boolean);
  if (!rows.length) throw new Error('Nessun annuncio valido: cache precedente conservata.');
  db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
  await db.execute('CREATE TABLE IF NOT EXISTS idealista_cache (cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  await db.execute({sql:'INSERT INTO idealista_cache VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at',
    args:['ibiza-pilot',JSON.stringify(rows),Math.floor(Date.now()/1000)]});
  console.log(JSON.stringify({received:items.length,saved:rows.length,private:rows.filter(r=>r.advertiserType==='private').length,agency:rows.filter(r=>r.advertiserType==='agency').length,unknown:rows.filter(r=>r.advertiserType==='unknown').length}));
} catch(e) {console.error(e.message);process.exitCode=1;} finally {db?.close();}
