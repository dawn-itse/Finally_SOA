const express = require('express');
const { createHash, timingSafeEqual } = require('node:crypto');
const { ServiceError } = require('../errors');
const {
  send, asyncHandler, requireJson, jsonBody, methodNotAllowed, createErrorHandler
} = require('../http');
const { ID_PATTERN } = require('./adminValidation');

const INTERNAL_PREFIX = '/api/internal/v1/';
const MAX_BODY_BYTES = 16 * 1024;

const sha256 = (value) => createHash('sha256').update(value).digest();

/** So sánh token theo thời gian không đổi (băm trước để hai chuỗi cùng độ dài). */
function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || !expected) return false;
  return timingSafeEqual(sha256(provided), sha256(expected));
}

// [method, đường dẫn (đoạn :tên là tham số), hàm xử lý, mã trả về khi tạo mới]
const ROUTES = [
  ['GET', '/restaurants', ({ admin, url }) => admin.listRestaurants(url.searchParams)],
  ['POST', '/restaurants', ({ admin, body }) => admin.createRestaurant(body), 201],
  ['GET', '/restaurants/:id', ({ admin, params }) => admin.getRestaurant(params.id)],
  ['PATCH', '/restaurants/:id', ({ admin, params, body }) => admin.updateRestaurant(params.id, body)],
  ['POST', '/restaurants/:id/status', ({ admin, params, body }) => admin.setVisibility(params.id, body)],
  ['POST', '/restaurants/:id/verify', ({ admin, params, body }) => admin.verifyRestaurant(params.id, body)],
  ['POST', '/restaurants/:id/locations', ({ admin, params, body }) => admin.addLocation(params.id, body), 201],
  ['PATCH', '/restaurants/:id/locations/:locationId', ({ admin, params, body }) => admin.updateLocation(params.id, params.locationId, body)],
  ['POST', '/restaurants/:id/menu-items', ({ admin, params, body }) => admin.createMenuItem(params.id, body), 201],
  ['GET', '/menu-items/:id', ({ admin, params }) => admin.getMenuItem(params.id)],
  ['PATCH', '/menu-items/:id', ({ admin, params, body }) => admin.updateMenuItem(params.id, body)],
  ['POST', '/menu-items/:id/prices', ({ admin, params, body }) => admin.applyPrice(params.id, body), 201],
  ['POST', '/menu-items/:id/prices/withdraw', ({ admin, params, body }) => admin.withdrawPrice(params.id, body)]
].map(([method, path, handler, createdStatus]) => ({ method, path, handler, createdStatus }));

/** Mã trong đường dẫn (:id, :locationId) phải đúng định dạng, kiểm tra trước khi xét method. */
function validateIdParam(req, res, next, value) {
  if (!ID_PATTERN.test(value)) return next(new ServiceError(400, 'INVALID_REQUEST', 'Mã trong đường dẫn không hợp lệ.'));
  next();
}

/** Xác thực X-Internal-Token; chưa đặt INTERNAL_API_TOKEN thì API tắt (503). */
function createInternalAuth(getContext) {
  return asyncHandler(async (req, res, next) => {
    const context = await getContext();
    if (!context.internalToken || !context.catalogAdmin) {
      return send(res, 503, { success: false, code: 'INTERNAL_API_DISABLED', error: 'API nội bộ chưa bật: đặt INTERNAL_API_TOKEN.' });
    }
    if (!tokenMatches(req.get('x-internal-token'), context.internalToken)) {
      return send(res, 401, { success: false, code: 'UNAUTHORIZED', error: 'Thiếu hoặc sai X-Internal-Token.' });
    }
    res.locals.ctx = context;
    next();
  });
}

/**
 * Router cho /api/internal/v1/*, gắn tại tiền tố đó. getContext trả về { catalogAdmin, internalToken }.
 * Dành cho service khác trong mạng nội bộ: API Gateway không được chuyển tiếp tiền tố này ra ngoài.
 */
function createInternalRouter(getContext, logger = console) {
  const router = express.Router({ caseSensitive: true });
  router.param('id', validateIdParam);
  router.param('locationId', validateIdParam);
  router.use(createInternalAuth(getContext));

  const byPath = new Map();
  for (const definition of ROUTES) {
    byPath.set(definition.path, [...(byPath.get(definition.path) ?? []), definition]);
  }

  for (const [path, definitions] of byPath) {
    const route = router.route(path);
    for (const { method, handler, createdStatus } of definitions) {
      const bodyMiddleware = method === 'GET'
        ? []
        : [requireJson({ code: 'UNSUPPORTED_MEDIA_TYPE' }), jsonBody(MAX_BODY_BYTES)];
      route[method.toLowerCase()](...bodyMiddleware, asyncHandler(async (req, res) => {
        const url = new URL(req.originalUrl, 'http://localhost');
        const data = await handler({ admin: res.locals.ctx.catalogAdmin, params: req.params, body: req.body, url });
        const status = createdStatus && data?.changed ? createdStatus : 200;
        send(res, status, { success: true, data });
      }));
    }
    const allow = [...new Set(definitions.map((definition) => definition.method))].join(', ');
    route.all(methodNotAllowed(allow, { code: 'METHOD_NOT_ALLOWED' }));
  }

  router.use((req, res) => send(res, 404, { success: false, code: 'NOT_FOUND', error: 'Không tìm thấy API nội bộ.' }));
  router.use(createErrorHandler({
    logger,
    logLabel: '[restaurant-search] Lỗi API nội bộ:',
    genericError: 'Dịch vụ catalog gặp lỗi. Vui lòng thử lại.',
    mapUnknown: (error) => (error?.code === 'ER_DUP_ENTRY'
      ? { status: 409, body: { success: false, code: 'CONFLICT', error: 'Dữ liệu trùng với bản ghi đã có. Gọi lại để đọc bản hiện tại.' } }
      : null)
  }));
  return router;
}

module.exports = { createInternalRouter, INTERNAL_PREFIX };
