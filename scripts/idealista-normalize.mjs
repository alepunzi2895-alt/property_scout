export const ACTOR = 'studio-amba~idealista-scraper';
export const PILOT_INPUT = {country:'ES',listingType:'rent',searchQuery:'Eivissa, Ibiza',propertyType:'flat',maxPrice:6000,maxResults:20};

export function normalizeIdealista(item) {
  let url;
  try { url=new URL(item.url); } catch { return null; }
  if (url.protocol!=='https:' || !['www.idealista.com','www.idealista.it','www.idealista.pt'].includes(url.hostname) || !/\/(inmueble|immobile|imovel)\/\d+/.test(url.pathname)) return null;
  if (item.listingType !== 'rent') return null;
  const advertiserType=item.advertiserType==='private'?'private':item.advertiserType==='professional'?'agency':'unknown';
  const price=typeof item.price==='number' && Number.isFinite(item.price) && item.price>0?item.price:null;
  return {platform:'idealista',name:item.title||'Appartamento Idealista',src:url.href,
    bio:item.description||'',type:item.propertyType||'Appartamento',location:item.address||item.city||'',
    zona:item.district||null,bedrooms:Number.isInteger(item.bedrooms)?item.bedrooms:null,
    price:price===null?'':price+' €/mese',priceAmount:price,pricePeriod:'mese',
    advertiserType,is_private:advertiserType==='private',owner_managed:advertiserType==='private',
    no_agency:advertiserType==='unknown'?null:advertiserType==='private',
    phone:item.agencyPhone||null,scrapedAt:item.scrapedAt||null};
}
