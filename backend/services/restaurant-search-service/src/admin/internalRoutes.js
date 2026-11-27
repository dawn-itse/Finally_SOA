const { createHash, timingSafeEqual } = require('node:crypto');
const { ServiceError } = require('../errors');
const { send, readJsonBody } = require('../http');
const { ID_PATTERN } = require('./adminValidation');

const INTERNAL_PREFIX = '/api/internal/v1/';
const MAX_BODY_BYTES = 16 * 1024;

const sha256 = (value) => createHash('sha256').update(value).digest();

/** So sánh token theo thời gian không đổi (băm trước để hai chuỗi cùng độ dài). */
function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || !expected) return false;
  return timingSafeEqual(sha256(provided), sha256(expected));
}

// [method, đường dẫn (các đoạn :tên là tham số), hàm xử lý, mã trả về khi tạo mới]
const ROUTES = [
  ['GET', 'restaurants', ({ admin, url }) => admin.listRestaurants(url.searchParams)],
  ['POST', 'restaurants', ({ admin, body }) => admin.createRestaurant(body), 201],
  ['GET', 'restaurants/:id', ({ admin, params }) => admin.getRestaurant(params.id)],
  ['PATCH', 'restaurants/:id', ({ admin, params, body }) => admin.updateRestaurant(params.id, body)],
  ['POST', 'restaurants/:id/status', ({ admin, params, body }) => admin.setVisibility(params.id, body)],
  ['POST', 'restaurants/:id/verify', ({ admin, params, body }) => admin.verifyRestaurant(params.id, body)],
  ['POST', 'restaurants/:id/locations', ({ admin, params, body }) => admin.addLocation(params.id, body), 201],
  ['PATCH', 'restaurants/:id/locations/:locationId', ({ admin, params, body }) => admin.updateLocation(params.id, params.locationId, body)],
  ['POST', 'restaurants/:id/menu-items', ({ admin, params, body }) => admin.createMenuItem(params.id, body), 201],
  ['GET', 'menu-items/:id', ({ admin, params }) => admin.getMenuItem(params.id)],
  ['PATCH', 'menu-items/:id', ({ admin, params, body }) => admin.updateMenuItem(params.id, body)],
  ['POST', 'menu-items/:id/prices', ({ admin, params, body }) => admin.applyPrice(params.id, body), 201],
  ['POST', 'menu-items/:id/prices/withdraw', ({ admin, params, body }) => admin.withdrawPrice(params.id, body)]
].map(([method, pattern, handler, createdStatus]) => ({ method, segments: pattern.split('/'), handler, createdStatus }));

function matchPath(segments, parts) {
  if (segments.length !== parts.length) return null;
  const params = {};
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index].startsWith(':')) {
      if (!ID_PATTERN.test(parts[index])) throw new ServiceError(400, 'INVALID_REQUEST', 'Mã trong đường dẫn không hợp lệ.');
      params[segments[index] === ':id' ? 'id' : segments[index].slice(1)] = parts[index];
    } else if (segments[index] !== parts[index]) {
      return null;
    }
  }
  return params;
}

/**
 * Router cho /api/internal/v1/*. getContext trả về { catalogAdmin, internalToken }.
 * Dành cho service khác trong mạng nội bộ: API Gateway không được chuyển tiếp tiền tố này ra ngoài.
 */
function createInternalHandler(getContext, logger = console) {
  return async function handleInternal(req, res, url) {
    try {
      const { catalogAdmin, internalToken } = await getContext();
      if (!internalToken || !catalogAdmin) {
        return send(res, 503, { success: false, code: 'INTERNAL_API_DISABLED', error: 'API nội bộ chưa bật: đặt INTERNAL_API_TOKEN.' });
      }
      if (!tokenMatches(req.headers['x-internal-token'], internalToken)) {
        return send(res, 401, { success: false, code: 'UNAUTHORIZED', error: 'Thiếu hoặc sai X-Internal-Token.' });
      }

      const parts = url.pathname.slice(INTERNAL_PREFIX.length).split('/').filter((part) => part !== '');
      const candidates = ROUTES.map((route) => ({ route, params: matchPath(route.segments, parts) })).filter((entry) => entry.params);
      if (candidates.length === 0) return send(res, 404, { success: false, code: 'NOT_FOUND', error: 'Không tìm thấy API nội bộ.' });

      const match = candidates.find((entry) => entry.route.method === req.method);
      if (!match) {
        const allow = [...new Set(candidates.map((entry) => entry.route.method))].join(', ');
        return send(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED', error: `Chỉ hỗ trợ ${allow}.` }, { Allow: allow });
      }

      let body;
      if (req.method !== 'GET') {
        const contentType = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
        if (contentType !== 'application/json') return send(res, 415, { success: false, code: 'UNSUPPORTED_MEDIA_TYPE', error: 'Nội dung yêu cầu phải là JSON.' });
        body = await readJsonBody(req, MAX_BODY_BYTES);
      }

      const data = await match.route.handler({ admin: catalogAdmin, params: match.params, body, url });
      const status = match.route.createdStatus && data?.changed ? match.route.createdStatus : 200;
      return send(res, status, { success: true, data });
    } catch (error) {
      if (error instanceof ServiceError) {
        if (error.status === 413) req.resume();
        return send(res, error.status, {
          success: false, code: error.code, error: error.message, ...(error.details ? { details: error.details } : {})
        });
      }
      if (error?.code === 'ER_DUP_ENTRY') {
        return send(res, 409, { success: false, code: 'CONFLICT', error: 'Dữ liệu trùng với bản ghi đã có. Gọi lại để đọc bản hiện tại.' });
      }
      logger.error?.('[restaurant-search] Lỗi API nội bộ:', error);
      return send(res, 500, { success: false, code: 'INTERNAL_ERROR', error: 'Dịch vụ catalog gặp lỗi. Vui lòng thử lại.' });
    }
  };
}

module.exports = { createInternalHandler, INTERNAL_PREFIX };
