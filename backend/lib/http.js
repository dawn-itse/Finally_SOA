const express = require('express');

function reply(res, status, body) {
  return res.set('Cache-Control', 'no-store').status(status).json(body);
}

function fail(res, status, error) {
  return reply(res, status, { success: false, error });
}

const jsonBody = [
  (req, res, next) => req.get('Content-Type')?.split(';')[0].trim().toLowerCase() === 'application/json'
    ? next() : fail(res, 415, 'Nội dung yêu cầu phải là JSON.'),
  express.json({ limit: '4kb', inflate: false }),
  (req, res, next) => req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? next() : fail(res, 400, 'Cần một đối tượng JSON.')
];

function methodNotAllowed(...methods) {
  return (_req, res) => fail(res.set('Allow', methods.join(', ')), 405, 'Phương thức không được hỗ trợ.');
}

function apiErrors(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.status === 400) return fail(res, 400, error.publicMessage || 'JSON hoặc dữ liệu đầu vào không hợp lệ.');
  if (error.status === 413) return fail(res, 413, 'Nội dung yêu cầu quá dài.');
  if (error.status === 415) return fail(res, 415, 'Nội dung hoặc mã hóa JSON không được hỗ trợ.');
  console.error('API:', error.code || error.name);
  const databaseUnavailable = ['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR',
    'ER_BAD_DB_ERROR', 'ER_NO_SUCH_TABLE'].includes(error.code);
  return fail(res, databaseUnavailable ? 503 : 500, databaseUnavailable
    ? 'MySQL tạm thời không khả dụng.' : 'Dịch vụ tạm thời không khả dụng.');
}

function listenService(router, port, name) {
  const app = express();
  app.disable('x-powered-by');
  app.use(router);
  app.use((_req, res) => fail(res, 404, 'Không tìm thấy API.'));
  app.use(apiErrors);
  return app.listen(port, '127.0.0.1', (error) => {
    if (error) {
      console.error(`${name}:`, error.code || error.name);
      process.exitCode = 1;
      return;
    }
    console.log(`${name} đang chạy tại http://127.0.0.1:${port}`);
  });
}

module.exports = { reply, fail, jsonBody, methodNotAllowed, apiErrors, listenService };
