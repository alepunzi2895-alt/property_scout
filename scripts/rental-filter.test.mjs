import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { directApartment } from '../src/rental-filter.mjs';
const source = fs.readFileSync(new URL('../api/scrape.js', import.meta.url), 'utf8');
const { parseIdealista } = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('private apartments require evidence, not inferred flags', () => {
  for (const [bio, expected] of [
    ['Alquilo piso anual, sin agencia, propietario directo', true],
    ['Piso anual, inmobiliaria Ibiza', false],
    ['Hotel con apartamento, sin agencia', false],
    ['Alquilo habitación en piso, sin agencia', false],
    ['Busco un piso anual, sin agencias', false],
    ['Piso en venta, particular', false],
    ['Piso anual 1200 euros', false],
  ]) assert.equal(directApartment({platform:'telegram',bio,is_private:true,no_agency:true}), expected, bio);
  assert.equal(directApartment({type:'Appartamento',advertiserType:'private'}), true);
});

test('Idealista structured price, bedrooms and advertiser classification', () => {
  const items = [
    {title:'Piso centro',price:{amount:2400},rooms:2,url:'/inmueble/123/',contactInfo:{userType:'private'}},
    {title:'Piso agencia',price:3000,url:'/inmueble/124/',agency:'Agency'},
    {title:'Piso desconocido',price:2000,url:'/inmueble/125/'},
  ];
  const html='<script id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{items}}})+'</script>';
  const rows=parseIdealista(html,'https://www.idealista.com/alquiler-viviendas/eivissa-balears-illes/');
  assert.equal(rows.length,3);
  assert.equal(rows[0].price,'2400€/mese');
  assert.equal(rows[0].bedrooms,2);
  assert.deepEqual(rows.map(r=>r.advertiserType),['private','agency','unknown']);
  assert.equal(rows[2].no_agency,null);
});

test('Idealista article keeps nested price and actual listing link', () => {
  const html='<article><a class="item-link" href="/inmueble/123/">Piso centro</a><div class="item-price">2.400<span> €/mes</span></div><p>Particular. Piso de dos habitaciones.</p></article>';
  const rows=parseIdealista(html,'https://www.idealista.com/');
  assert.equal(rows.length,1);
  assert.equal(rows[0].src,'https://www.idealista.com/inmueble/123/');
  assert.equal(rows[0].price,'2.400€');
  assert.equal(rows[0].advertiserType,'private');
  assert.equal(parseIdealista('<p>Please enable JS captcha</p>','https://www.idealista.com/').length,0);
});

test('annual and seasonal searches filter all sources and skip holiday connectors', async () => {
  const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const start=app.indexOf('async function runSearch(');
  const end=app.indexOf('// ─── COMPONENTS',start);
  for (const durationType of ['annuale','stagionale']) {
    const calls=[];
    const ctx={IS_VERCEL:true,directApartment,normKey:s=>s, isWantedAd:()=>false,
      computeScore:()=>({score:10,priority:'LOW',reasons:[],flags:[],matchReasons:[],penalties:[]}),
      runEnrichment:async x=>x};
    for (const name of ['searchGoogleMaps','searchFacebookGroups','searchTelegramSerper','searchMediaVacanze','searchIdealista','searchTelegramPublic','searchTelegramGroupsDB','searchInstagram','searchFacebook','searchSubito','searchImmobiliare','searchVRBO','searchAirbnbApify']) {
      ctx[name]=async()=>{calls.push(name);return [
        {name:name+' private',type:'Appartamento',advertiserType:'private'},
        {name:name+' hotel',type:'Hotel',advertiserType:'private'},
        {name:name+' agency',type:'Appartamento',advertiserType:'agency'},
        {name:name+' unknown',type:'Appartamento',no_agency:true},
      ];};
    }
    vm.createContext(ctx);
    vm.runInContext(app.slice(start,end),ctx);
    const rows=await ctx.runSearch('Ibiza','all',{durationType},{},()=>{},'immobili');
    assert.ok(rows.length>0);
    assert.ok(rows.every(r=>r.name.endsWith(' private')));
    assert.ok(!calls.some(n=>['searchMediaVacanze','searchVRBO','searchAirbnbApify'].includes(n)));
    assert.ok(calls.includes('searchIdealista'));
    assert.ok(calls.includes('searchTelegramGroupsDB'));
  }
});
