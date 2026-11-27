const express = require('express');
const { ServiceError } = require('./errors');

/** Gửi JSON với các header chung của service (không cache). */
function send(res, status, body, headers = {}) {
  res.status(status).set({ 'Cache-Control': 'no-store', ...headers }).json(body);
}

/** Bọc handler async để mọi lỗi (kể cả bị throw) đều đi vào error middleware. */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve().then(() => fn(req, res, next)).catch(next);
};

/** Nạp context (service, repository, ...) một cách lười rồi đặt vào res.locals.ctx. */
const withContext = (getContext) => asyncHandler(async (req, res, next) => {
  res.locals.ctx = await getContext();
  next();
});

/** 415 nếu Content-Type không phải application/json. Có `code` thì kèm vào phản hồi (API nội bộ). */
function requireJson({ code } = {}) {
  return (req, res, next) => {
    const contentType = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
      return send(res, 415, { success: false, ...(code ? { code } : {}), error: 'Nội dung yêu cầu phải là JSON.' });
    }
    next();
  };
}

/** Đọc body JSON với giới hạn byte. Body rỗng hoặc sai cú pháp: 400 INVALID_JSON; quá giới hạn: 413. */
function jsonBody(maxBytes) {
  const parse = express.json({
    limit: maxBytes,
    strict: false,
    verify: (req, res, buf) => { req.hasJsonPayload = buf.length > 0; }
  });
  return (req, res, next) => parse(req, res, (error) => {
    if (error) return next(error);
    if (!req.hasJsonPayload) return next(new ServiceError(400, 'INVALID_JSON', 'JSON không hợp lệ.'));
    next();
  });
}

/** 405 kèm header Allow. */
function methodNotAllowed(allow, { code } = {}) {
  return (req, res) => send(
    res, 405,
    { success: false, ...(code ? { code } : {}), error: `Chỉ hỗ trợ ${allow}.` },
    { Allow: allow }
  );
}

/** Đổi lỗi của body-parser sang ServiceError; lỗi khác giữ nguyên. */
function normalizeError(error) {
  // Express tự giải mã tham số đường dẫn; %-escape hỏng (ví dụ /restaurants/%zz) là mã không hợp lệ.
  if (error instanceof URIError) return new ServiceError(400, 'INVALID_REQUEST', 'Mã trong đường dẫn không hợp lệ.');
  switch (error?.type) {
    case 'entity.too.large':
      return new ServiceError(413, 'BODY_TOO_LARGE', 'Nội dung yêu cầu quá dài.');
    case 'entity.parse.failed':
      return new ServiceError(400, 'INVALID_JSON', 'JSON không hợp lệ.');
    case 'charset.unsupported':
    case 'encoding.unsupported':
      return new ServiceError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Nội dung yêu cầu phải là JSON.');
    default:
      return error;
  }
}

/**
 * Error middleware cho một router.
 * - ServiceError (và lỗi body-parser) trả đúng mã + code + details.
 * - mapUnknown(error) có thể trả { status, body } cho lỗi hạ tầng đã biết (ví dụ ER_DUP_ENTRY).
 * - Còn lại: ghi log, trả 500 chung, không lộ chi tiết nội bộ.
 */
function createErrorHandler({ logger = console, logLabel, genericError, mapUnknown }) {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);
    const known = normalizeError(error);
    if (known instanceof ServiceError) {
      return send(res, known.status, {
        success: false, code: known.code, error: known.message, ...(known.details ? { details: known.details } : {})
      });
    }
    const mapped = mapUnknown?.(error);
    if (mapped) return send(res, mapped.status, mapped.body);
    logger.error?.(logLabel, error);
    return send(res, 500, { success: false, code: 'INTERNAL_ERROR', error: genericError });
  };
}

module.exports = { send, asyncHandler, withContext, requireJson, jsonBody, methodNotAllowed, createErrorHandler };
