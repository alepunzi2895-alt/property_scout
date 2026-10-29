export function directApartment(s) {
  const norm = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Group names and inferred provider flags are not evidence about an advertiser.
  const text = norm([s.platform === 'telegram' ? '' : s.name, s.type, s.bio].join(' '));
  const cleaned = text.replace(/\b(?:sin|no|senza|no se aceptan)\s+(?:agencias?|agenzie|intermediarios?)\b/g, '');
  if (s.chain_hotel || s.is_hotel || s.advertiserType === 'agency' ||
      /\b(?:agencia|agenzia|inmobiliaria|real estate agency|property management|hotel|hostal|hostel|resort|aparthotel|albergo)\b/.test(cleaned)) return false;
  if (/\b(?:busco|buscamos|cerco|looking for)\s+(?:(?:un|una|a)\s+)?(?:piso|casa|habitacion|apartamento|room|flat)\b/.test(text)) return false;
  if (/\b(?:se vende|en venta|for sale|vendo|vendita)\b/.test(text)) return false;
  if (/\b(?:alquilo|alquila|alquilan|ofrezco)\s+(?:(?:una|la)\s+)?habitacion\b|\b(?:compartir|comparto|companera|companero)\b/.test(text)) return false;
  const apartment = /\b(?:piso|apartamento|appartamento|apartment|flat|casa|villa|estudio|studio)\b/.test(text);
  const direct = s.advertiserType === 'private' || /\b(?:particular|propietario directo|directo con (?:el )?propietario|soy (?:el |la )?propietari[oa]|sin agencia|sin agencias|senza agenzia|proprietario diretto|direct owner|no agencies)\b/.test(text);
  return apartment && direct;
}
