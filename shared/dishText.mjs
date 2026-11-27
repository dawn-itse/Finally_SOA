export function normalizeDishText(value) {
  return String(value ?? '').toLowerCase().normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function readDishName(rawText) {
  const name = String(rawText ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  const normalized = normalizeDishText(name);
  const hasFilter = /\d+(?:[.,]\d+)?\s*(?:km|k|nghìn|ngàn|nghin|ngan|cành|canh|vnd|vnđ|đồng|đong|đ)(?=$|[^\p{L}])/iu.test(name)
    || /\b\d{4,}\b|\b(?:duoi|toi da|trong ban kinh|di) \d|\b\d+ nguoi\b|\b(?:gan hon|re hon|quanh day)\b/u.test(normalized)
    || /\b\d{1,3}(?:[.,]\d{3})+(?!\d)/u.test(name);
  if (!/\p{L}/u.test(normalized) || name.length < 2 || name.length > 100 || hasFilter) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function parseDish(text, source = 'input') {
  // Weather suggestions currently use the format "45k bún riêu cua".
  const dishText = source === 'suggestion' ? text.trim().replace(/^\d+\s*k\s+/i, '') : text;
  const dish = readDishName(dishText);
  return dish ? { dish, normalizedDish: normalizeDishText(dish) } : null;
}
