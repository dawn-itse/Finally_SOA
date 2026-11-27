/**
 * NLP Intent & Slot-Filling Parser Service (Client-Side Simulation of SOA NLP Service)
 * Parses natural Vietnamese queries like:
 * - "phở bò" -> { dish: "Phở bò", budget: null }
 * - "30k cà phê sữa" -> { dish: "Cà phê sữa", budget: 30000 }
 * - "50k" -> { budget: 50000 }
 * - Multi-turn refinements: "rẻ hơn", "gần hơn", "đi 2 người"
 */

export function parseUserUtterance(rawText, currentState) {
  const text = (rawText || '').trim();
  const lower = text.toLowerCase();

  const result = {
    rawText: text,
    intent: 'SEARCH',
    extractedDish: null,
    extractedBudget: null,
    extractedRadiusKm: null,
    extractedPartySize: null,
    sortOverride: null,
    explanation: ''
  };

  // 1. Check multi-turn refinement intents ("rẻ hơn", "gần hơn", "đi 2 người")
  if (lower.includes('rẻ hơn') || lower.includes('re hon') || lower.includes('ít tiền hơn')) {
    result.intent = 'REFINE_CHEAPER';
    const currentBudget = currentState.budget || 50000;
    result.extractedBudget = Math.max(25000, currentBudget - 10000);
    result.sortOverride = 'price';
    result.explanation = `Giảm ngân sách từ ${formatK(currentBudget)} xuống ${formatK(result.extractedBudget)} & ưu tiên giá rẻ`;
    return result;
  }

  if (lower.includes('gần hơn') || lower.includes('gan hon') || lower.includes('quanh đây thôi')) {
    result.intent = 'REFINE_CLOSER';
    result.extractedRadiusKm = 1;
    result.sortOverride = 'distance';
    result.explanation = 'Thu hẹp bán kính xuống 1km & sắp xếp từ Gần → Xa';
    return result;
  }

  const partyMatch = lower.match(/đi\s*(\d+)\s*người|(\d+)\s*người/);
  if (partyMatch) {
    const count = parseInt(partyMatch[1] || partyMatch[2], 10);
    result.intent = 'REFINE_PARTY_SIZE';
    result.extractedPartySize = count;
    result.explanation = `Cập nhật số người ăn: ${count} người`;
    return result;
  }

  // 2. Extract Budget (e.g., "30k", "50 nghìn", "45000", "50 cành")
  const priceRegex = /(\d+)\s*(k|nghìn|ngàn|cành|đ|vnđ)?/i;
  const priceMatch = lower.match(priceRegex);

  let cleanedForDish = text;
  if (priceMatch) {
    let num = parseInt(priceMatch[1], 10);
    const unit = (priceMatch[2] || '').toLowerCase();
    if (num < 1000 && (unit === 'k' || unit === 'nghìn' || unit === 'ngàn' || unit === 'cành' || num <= 500)) {
      num = num * 1000;
    }
    if (num >= 10000 && num <= 1000000) {
      result.extractedBudget = num;
      cleanedForDish = text.replace(priceMatch[0], '').trim();
    }
  }

  // 3. Clean common filler words to extract dish name
  cleanedForDish = cleanedForDish
    .replace(/^(tìm|mua|ăn|uống|cho|mình|tôi|muốn|tối đa|dưới|khoảng|tầm)\s+/gi, '')
    .replace(/\s+(dưới|tối đa|khoảng|tầm|nhé|nha|ạ)$/gi, '')
    .trim();

  if (cleanedForDish.length >= 2) {
    result.extractedDish = capitalizeFirst(cleanedForDish);
  }

  if (result.extractedDish && result.extractedBudget) {
    result.intent = 'SEARCH_COMPLETE';
    result.explanation = `Đã tách đủ: Món="${result.extractedDish}", Ngân sách=${formatK(result.extractedBudget)}`;
  } else if (result.extractedDish && !result.extractedBudget) {
    result.intent = 'NEED_BUDGET_SLOT';
    result.explanation = `Đã nhận món "${result.extractedDish}", thiếu slot [Ngân sách] -> Hỏi lại người dùng`;
  } else if (!result.extractedDish && result.extractedBudget) {
    result.intent = 'SUPPLY_BUDGET_SLOT';
    result.explanation = `Bổ sung slot [Ngân sách]=${formatK(result.extractedBudget)}`;
  }

  return result;
}

export function normalizeDishText(value) {
  return String(value ?? '').toLowerCase().normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Budget and radius belong to the controls in the dock.
export function readDishName(rawText) {
  const name = String(rawText ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  const normalized = normalizeDishText(name);
  const hasFilter = /\d+(?:[.,]\d+)?\s*(?:km|k|nghìn|ngàn|nghin|ngan|cành|canh|vnd|vnđ|đồng|đong|đ)(?=$|[^\p{L}])/iu.test(name)
    || /\b\d{4,}\b|\b(?:duoi|toi da|trong ban kinh|di) \d|\b\d+ nguoi\b|\b(?:gan hon|re hon|quanh day)\b/u.test(normalized)
    || /\b\d{1,3}(?:[.,]\d{3})+(?!\d)/u.test(name);
  if (!/\p{L}/u.test(normalized) || name.length < 2 || name.length > 100 || hasFilter) return null;
  return capitalizeFirst(name);
}

export function formatK(amount) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return 'Số tiền';
  if (Number(amount) === 0) return '0đ';
  return `${(Number(amount) / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 })}k`;
}

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
