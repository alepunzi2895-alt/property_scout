import {createClient} from '@libsql/client';
export default async function handler(req,res) {
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  if(!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) return res.status(503).json({error:'Cache Idealista non configurata'});
  const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
  try {
    const exists=await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='idealista_cache'");
    if(!exists.rows.length) return res.status(503).json({error:'Idealista: eseguire la prima importazione Apify'});
    const r=await db.execute({sql:'SELECT payload, updated_at FROM idealista_cache WHERE cache_key=?',args:['ibiza-pilot']});
    if(!r.rows.length) return res.status(503).json({error:'Idealista: importazione non disponibile'});
    const row=r.rows[0];
    if(Date.now()/1000-Number(row.updated_at)>86400) return res.status(503).json({error:'Idealista: dati oltre 24 ore, aggiornare importazione'});
    return res.json({results:JSON.parse(row.payload),updatedAt:Number(row.updated_at),sample:true});
  } catch {return res.status(503).json({error:'Cache Idealista non disponibile'});} finally {db.close();}
}
