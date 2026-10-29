import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIdealista,PILOT_INPUT} from './idealista-normalize.mjs';
const base={listingType:'rent',url:'https://www.idealista.com/inmueble/123/',title:'Piso',propertyType:'flat',price:2400,bedrooms:2};
test('private name is not confused with an agency',()=>{
  const row=normalizeIdealista({...base,advertiserType:'private',agencyName:'Maria'});
  assert.equal(row.advertiserType,'private');assert.equal(row.priceAmount,2400);assert.equal(row.bedrooms,2);
});
test('professional and unknown remain distinct',()=>{
  assert.equal(normalizeIdealista({...base,advertiserType:'professional'}).no_agency,false);
  assert.equal(normalizeIdealista(base).no_agency,null);
  assert.equal(normalizeIdealista({...base,price:null}).priceAmount,null);
});
test('reject sales and invalid sources',()=>{
  assert.equal(normalizeIdealista({...base,listingType:'sale'}),null);
  assert.equal(normalizeIdealista({...base,url:'https://evil.example/inmueble/123/'}),null);
  assert.equal(PILOT_INPUT.maxResults,20);
});
