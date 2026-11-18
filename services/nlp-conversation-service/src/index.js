/**
 * SERVICE 2: NLP & Conversation Service (Port 4002)
 * Phân tích câu tiếng Việt thành món ăn, ngân sách, bán kính, số người
 * và xác định bước tiếp theo của hội thoại (slot filling).
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT) || 4002;

app.use(cors());
app.use(express.json());

/**
 * Chuyển một số tiền thành VNĐ.
 * Ví dụ: 40k -> 40000, 50 nghìn -> 50000, 45000đ -> 45000.
 */
function parseBudget(text) {
  const withUnit = text.match(/(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|cành|vnđ|đồng|đ)/i);
  if (withUnit) {
    const value = Number(withUnit[1].replace(',', '.'));
    const unit = withUnit[2].toLowerCase();
    const amount = ['k', 'nghìn', 'ngàn', 'cành'].includes(unit)
      ? value * 1000
      : value;

    if (Number.isFinite(amount) && amount >= 1000 && amount <= 2000000) {
      return { amount: Math.round(amount), matchedText: withUnit[0] };
    }
    return null;
  }

  // Chỉ coi số không có đơn vị là VNĐ khi là một số tiền đủ lớn,
  // tránh hiểu nhầm các số nhỏ trong câu thành ngân sách.
  const plainAmount = text.match(/(?:^|\D)(\d{4,7})(?:\D|$)/);
  if (plainAmount) {
    const amount = Number(plainAmount[1]);
    if (amount >= 10000 && amount <= 2000000) {
      return { amount, matchedText: plainAmount[1] };
    }
  }

  return null;
}

/**
 * Phân tích câu chat tiếng Việt.
 * currentState có thể chứa dish, budget, radiusKm, partySize.
 */
function parseVietnameseQuery(rawText, currentState = {}) {
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  const lower = text.toLowerCase();
  const state = currentState && typeof currentState === 'object' ? currentState : {};

  const result = { // Khởi tạo đối tượng lưu kết quả phân tích câu chat.
    rawText: text, // Lưu nội dung nguyên văn người dùng đã nhập.
    intent: 'UNKNOWN', // Đặt ý định mặc định khi chưa phân loại được câu.
    extractedDish: null, // Chưa trích xuất tên món ăn.
    extractedBudget: null, // Chưa trích xuất ngân sách.
    extractedRadiusKm: null, // Chưa trích xuất bán kính tìm kiếm theo km.
    extractedPartySize: null, // Chưa trích xuất số người trong nhóm.
    sortOverride: null, // Chưa có yêu cầu thay đổi cách sắp xếp kết quả.
    botReply: null, // Chưa tạo nội dung phản hồi cho người dùng.
    quickReplies: [] // Khởi tạo danh sách gợi ý trả lời nhanh ở trạng thái trống.
  };

  if (!text) {
    result.botReply = 'Bạn muốn ăn món gì? Hãy nhập tên món hoặc ngân sách nhé.';
    result.quickReplies = ['Phở bò', 'Bún riêu', 'Cơm tấm'];
    return result;
  }

  // Nhận diện số người trước phần giá để câu "đi 2 người" không bị hiểu là tiền.
  const partyMatch = lower.match(/(?:đi\s*)?(\d+)\s*người/);
  if (partyMatch) {
    const count = Number(partyMatch[1]);
    if (count >= 1 && count <= 50) {
      result.intent = 'REFINE_PARTY_SIZE';
      result.extractedPartySize = count;
      result.botReply = `Đã cập nhật tìm quán cho ${count} người.`;
      return result;
    }
  }

  // Bán kính có thể viết "2km", "trong bán kính 2 km" hoặc "quanh đây 1,5km".
  const radiusMatch = lower.match(/(?:bán\s*kính\s*)?(\d+(?:[.,]\d+)?)\s*km\b/i);
  if (radiusMatch) {
    const radius = Number(radiusMatch[1].replace(',', '.'));
    if (radius > 0 && radius <= 50) result.extractedRadiusKm = radius;
  }

  if (lower.includes('rẻ hơn') || lower.includes('re hon') || lower.includes('ít tiền hơn')) {
    const oldBudget = Number(state.budget) || 50000;
    result.intent = 'REFINE_CHEAPER';
    result.extractedBudget = Math.max(25000, oldBudget - 10000);
    result.sortOverride = 'price';
    result.botReply = `Đã giảm ngân sách xuống tối đa ${result.extractedBudget / 1000}k và ưu tiên quán giá rẻ.`;
    return result;
  }

  if (lower.includes('gần hơn') || lower.includes('gan hon') || lower.includes('quanh đây thôi')) {
    result.intent = 'REFINE_CLOSER';
    result.extractedRadiusKm = 1;
    result.sortOverride = 'distance';
    result.botReply = 'Đã thu hẹp bán kính xuống 1km và ưu tiên quán gần bạn.';
    return result;
  }

  const budget = parseBudget(text);
  if (budget) {
    result.extractedBudget = budget.amount;
  }

  let remainingText = text;
  if (budget) {
    // Bỏ đúng cụm giá vừa nhận diện, không xóa các phần khác của câu.
    const escapedMatch = budget.matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    remainingText = remainingText.replace(new RegExp(escapedMatch, 'i'), ' ');
  }
  if (radiusMatch) {
    remainingText = remainingText.replace(radiusMatch[0], ' ');
  }

  remainingText = remainingText
    .replace(/\b(?:tìm|kiếm|mua|ăn|uống|cho|mình|tôi|muốn|giúp|quanh|trong|bán kính|tối đa|dưới|khoảng|tầm)\b/gi, ' ')
    .replace(/\b(?:nhé|nha|ạ|thôi)\b/gi, ' ')
    .replace(/[,.!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (remainingText.length >= 2) {
    result.extractedDish = remainingText.charAt(0).toLocaleUpperCase('vi-VN') + remainingText.slice(1);
  }

  if (result.extractedDish && result.extractedBudget) {
    result.intent = 'SEARCH_COMPLETE';
    result.botReply = `Đang tìm quán ${result.extractedDish} với ngân sách tối đa ${result.extractedBudget / 1000}k.`;
  } else if (result.extractedDish) {
    result.intent = 'NEED_BUDGET_SLOT';
    result.botReply = `${result.extractedDish} nhé! Bạn muốn chi tối đa bao nhiêu tiền?`;
    result.quickReplies = ['30k', '50k', '100k', '200k'];
  } else if (result.extractedBudget) {
    result.intent = 'SUPPLY_BUDGET_SLOT';
    result.extractedDish = typeof state.dish === 'string' && state.dish.trim()
      ? state.dish.trim()
      : null;
    result.botReply = result.extractedDish
      ? `Đã cập nhật ngân sách ${result.extractedBudget / 1000}k cho ${result.extractedDish}. Đang tìm quán.`
      : `Đã nhận ngân sách ${result.extractedBudget / 1000}k. Bạn muốn ăn món gì?`;
    if (!result.extractedDish) result.quickReplies = ['Phở bò', 'Bún riêu', 'Cơm tấm'];
  } else if (result.extractedRadiusKm !== null) {
    result.intent = 'REFINE_RADIUS';
    result.botReply = `Đã cập nhật bán kính tìm kiếm ${result.extractedRadiusKm}km.`;
  } else {
    result.botReply = 'Mình chưa nhận ra món ăn hoặc ngân sách. Bạn thử nhập như "40k cháo sườn" nhé.';
  }

  return result;
}

app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'nlp-conversation-service',
    status: 'UP',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/v1/nlp/parse', (req, res) => {
  const body = req.body;
  if (!body || typeof body.text !== 'string') {
    return res.status(400).json({
      success: false,
      service: 'nlp-conversation-service',
      error: 'Trường text là bắt buộc và phải là chuỗi.'
    });
  }

  const parsedData = parseVietnameseQuery(body.text, body.currentState);
  console.log(`[NLP-Service] Input: "${parsedData.rawText}" -> Intent: ${parsedData.intent}`);

  return res.json({
    success: true,
    service: 'nlp-conversation-service',
    data: parsedData
  });
});

// Endpoint tiện dụng để thử nhanh trên trình duyệt; API chính vẫn là POST /parse.
app.get('/api/v1/nlp/test', (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  const parsedData = parseVietnameseQuery(query);
  return res.json({
    success: true,
    service: 'nlp-conversation-service',
    data: parsedData
  });
});

app.listen(PORT, () => {
  console.log(`[NLP-Conversation-Service] đang chạy tại http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
