const express = require('express');
const { createHash, timingSafeEqual } = require('node:crypto');
const { ServiceError } = require('./errors');
const { send, readJsonBody } = require('./http');
const { ID_PATTERN } = require('./validation');

const LEGACY_PREFIX = '/api/geo/';
const V1_PREFIX = '/api/v1/geo/';
const INTERNAL_PREFIX = '/api/internal/v1/geo/';
const GEO_ROUTE_PREFIXES = [LEGACY_PREFIX, V1_PREFIX, INTERNAL_PREFIX];
const MAX_BODY_BYTES = 8 * 1024;

const isGeoRoute = (pathname) => GEO_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
const sha256 = (value) => createHash('sha256').update(value).digest();

function tokenMatches(provided, expected) {
  return typeof provided === 'string' && timingSafeEqual(sha256(provided), sha256(expected));
}

function checkInternalToken(req, res, next) {
  const { internalToken } = res.locals.context;
  if (!internalToken) {
    return send(res, 503, { success: false, code: 'INTERNAL_API_DISABLED', error: 'API nội bộ chưa bật: đặt INTERNAL_API_TOKEN (hoặc GEO_INTERNAL_API_TOKEN).' });
  }
  if (!tokenMatches(req.headers['x-internal-token'], internalToken)) {
    return send(res, 401, { success: false, code: 'UNAUTHORIZED', error: 'Thiếu hoặc sai X-Internal-Token.' });
  }
  return next();
}

// Dùng .all() để Express không tự xử lý HEAD và OPTIONS thay cho phản hồi 405.
function allow(handlers) {
  return (req, res) => {
    if (Object.hasOwn(handlers, req.method)) return handlers[req.method](req, res);
    const methods = Object.keys(handlers).join(', ');
    return send(res, 405, {
      ...(res.locals.prefix !== LEGACY_PREFIX && { success: false }),
      code: 'METHOD_NOT_ALLOWED', error: `Chỉ hỗ trợ ${methods}.`
    }, { Allow: methods });
  };
}

function success(res, data) {
  return send(res, 200, { success: true, data });
}

async function readAreaBody(req) {
  const contentType = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new ServiceError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Nội dung yêu cầu phải là JSON.');
  }
  return readJsonBody(req, MAX_BODY_BYTES);
}

const LEGACY_OPERATIONS = {
  autocomplete: 'autocomplete',
  'place-detail': 'placeDetail',
  reverse: 'reverse',
  'distance-matrix': 'distanceMatrix',
  directions: 'directions',
  'map-config': 'mapConfig'
};

function createGeoApp(getContext, logger = console) {
  const app = express();
  app.disable('x-powered-by');
  app.enable('case sensitive routing');
  app.enable('strict routing');

  app.use(async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost');
    const prefix = GEO_ROUTE_PREFIXES.find((item) => url.pathname.startsWith(item));
    res.locals.prefix = prefix;
    res.locals.searchParams = url.searchParams;
    // Các API v1 chấp nhận dấu / lặp và dấu / cuối. Giữ nguyên mã hóa của ID.
    const pathname = prefix === V1_PREFIX || prefix === INTERNAL_PREFIX
      ? prefix + url.pathname.slice(prefix.length).split('/').filter(Boolean).join('/')
      : url.pathname;
    req.url = pathname + url.search;
    res.locals.context = await getContext();
    return prefix === INTERNAL_PREFIX ? checkInternalToken(req, res, next) : next();
  });

  for (const [route, operation] of Object.entries(LEGACY_OPERATIONS)) {
    app.all(LEGACY_PREFIX + route, allow({
      GET: async (req, res) => {
        const { context: { geo }, searchParams } = res.locals;
        const data = await geo[operation](searchParams);
        return data === null
          ? send(res, 404, { error: 'Goong chưa tìm được kết quả phù hợp.' })
          : send(res, 200, { data });
      }
    }));
  }

  app.all(V1_PREFIX + 'health', allow({
    GET: async (req, res) => {
      await res.locals.context.areas.ping();
      return send(res, 200, { success: true, status: 'ok' });
    }
  }));
  app.all(V1_PREFIX + 'map-config', allow({
    GET: async (req, res) => success(res, await res.locals.context.geo.mapConfig())
  }));
  app.all(V1_PREFIX + 'places/search', allow({
    GET: async (req, res) => success(res, await res.locals.context.geo.searchPlaces(res.locals.searchParams))
  }));
  app.all(V1_PREFIX + 'areas', allow({
    GET: async (req, res) => success(res, await res.locals.context.areas.listPublic())
  }));
  app.all(/^\/api\/v1\/geo\/areas\/[^/]+$/, allow({
    GET: async (req, res) => {
      const id = req.path.split('/').at(-1);
      if (!ID_PATTERN.test(id)) throw new ServiceError(400, 'INVALID_REQUEST', 'Mã khu vực không hợp lệ.');
      const area = await res.locals.context.areas.getPublic(id);
      if (!area) throw new ServiceError(404, 'AREA_NOT_FOUND', 'Không tìm thấy khu vực.');
      return success(res, area);
    }
  }));

  app.all(INTERNAL_PREFIX + 'areas', allow({
    GET: async (req, res) => success(res, { areas: await res.locals.context.areas.listAdmin() }),
    POST: async (req, res) => {
      const data = await res.locals.context.areas.create(await readAreaBody(req));
      return send(res, data?.changed ? 201 : 200, { success: true, data });
    }
  }));
  app.all(/^\/api\/internal\/v1\/geo\/areas\/[^/]+$/, (req, res, next) => {
    const id = req.path.split('/').at(-1);
    if (!ID_PATTERN.test(id)) throw new ServiceError(400, 'INVALID_REQUEST', 'Mã trong đường dẫn không hợp lệ.');
    res.locals.areaId = id;
    return next();
  }, allow({
    GET: async (req, res) => success(res, await res.locals.context.areas.getAdmin(res.locals.areaId)),
    PATCH: async (req, res) => {
      const { context: { areas }, areaId } = res.locals;
      return success(res, await areas.update(areaId, await readAreaBody(req)));
    }
  }));

  app.use((req, res) => {
    if (res.locals.prefix === LEGACY_PREFIX) return send(res, 404, { error: 'Không tìm thấy API vị trí.' });
    const error = res.locals.prefix === INTERNAL_PREFIX ? 'Không tìm thấy API nội bộ.' : 'Không tìm thấy API vị trí.';
    return send(res, 404, { success: false, code: 'NOT_FOUND', error });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const result = res.locals.prefix === LEGACY_PREFIX ? {} : { success: false };
    if (error instanceof ServiceError) {
      if (error.status === 413) req.resume();
      return send(res, error.status, {
        ...result, code: error.code, error: error.message, ...(error.details ? { details: error.details } : {})
      });
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      return send(res, 409, { success: false, code: 'CONFLICT', error: 'Dữ liệu trùng với bản ghi đã có.' });
    }
    logger.error?.('[routing-geo] Lỗi không mong đợi:', error);
    return send(res, 500, { ...result, code: 'INTERNAL_ERROR', error: 'Dịch vụ vị trí gặp lỗi. Vui lòng thử lại.' });
  });

  return app;
}

module.exports = { createGeoApp, isGeoRoute, GEO_ROUTE_PREFIXES };
