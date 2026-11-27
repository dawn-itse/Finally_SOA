const { existsSync } = require('node:fs');
const { createServer } = require('node:http');
const path = require('node:path');

const NLP_ROUTE = '/api/v1/nlp/parse';
const MAX_BODY_BYTES = 4096;
const dishText = import('../../../../shared/dishText.mjs');

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(JSON.stringify(body));
}

async function handleNlp(req, res, url) {
  if (url.pathname !== NLP_ROUTE) {
    return send(res, 404, { success: false, error: 'Không tìm thấy API NLP.' });
  }
  if (req.method !== 'POST') {
    return send(res, 405, { success: false, error: 'Chỉ hỗ trợ POST.' }, { Allow: 'POST' });
  }
  const contentType = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    return send(res, 415, { success: false, error: 'Nội dung yêu cầu phải là JSON.' });
  }

  let body;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.resume();
        return send(res, 413, { success: false, error: 'Nội dung yêu cầu quá dài.' });
      }
      chunks.push(chunk);
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    if (!res.destroyed) return send(res, 400, { success: false, error: 'JSON không hợp lệ.' });
    return;
  }

  const { text, source = 'input' } = body ?? {};
  if (typeof text !== 'string' || !['input', 'suggestion'].includes(source)) {
    return send(res, 400, { success: false, error: 'Cần chuỗi text và nguồn input hoặc suggestion.' });
  }

  const { parseDish } = await dishText;
  const data = parseDish(text, source);
  if (!data) {
    return send(res, 422, { success: false, error: 'Chỉ nhập tên món. Chọn giá và bán kính bằng bộ lọc.' });
  }
  return send(res, 200, { success: true, data });
}

if (require.main === module) {
  const envFile = path.join(__dirname, '..', '..', '..', '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const port = Number(process.env.NLP_PORT) || 4002;
  createServer((req, res) => {
    void handleNlp(req, res, new URL(req.url, 'http://localhost'));
  }).listen(port, 'localhost', () => {
    console.log(`NLP Conversation Service đang chạy tại http://localhost:${port}`);
  });
}

module.exports = { handleNlp, NLP_ROUTE };
