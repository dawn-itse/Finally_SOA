const { existsSync } = require('node:fs');
const { createHash, timingSafeEqual } = require('node:crypto');
const { createServer } = require('node:http');
const path = require('node:path');

const { ServiceError } = require('./errors');
const { send, readJsonBody } = require('./http');
const { ID_PATTERN } = require('./validation');
const { createGoongClient } = require('./goongClient');
const { createGeoService } = require('./geoService');
const { createAreaService } = require('./areaService');
const { createMemoryAreaRepository } = require('./repositories/memoryAreaRepository');
const { createMysqlAreaRepository, createMysqlPool } = require('./repositories/mysqlAreaRepository');

const LEGACY_PREFIX = '/api/geo/'; // proxy Goong, cùng hợp đồng với backend/routes/geo.js cũ: { data } / { error }
const V1_PREFIX = '/api/v1/geo/';
const INTERNAL_PREFIX = '/api/internal/v1/geo/';
const MAX_BODY_BYTES = 8 * 1024;

const sha256 = (value) => createHash('sha256').update(value).digest();
function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || !expected) return false;
  return timingSafeEqual(sha256(provided), sha256(expected));
}

const isGeoRoute = (pathname) => pathname.startsWith(LEGACY_PREFIX) || pathname.startsWith(V1_PREFIX) || pathname.startsWith(INTERNAL_PREFIX);

// Proxy Goong: tên thao tác -> hàm của geoService. Autocomplete trống trả 200 { data: [] }, các thao tác khác trả 404.
const LEGACY_OPERATIONS = {
  autocomplete: 'autocomplete',
  'place-detail': 'placeDetail',
  reverse: 'reverse',
  'distance-matrix': 'distanceMatrix',
  directions: 'directions',
  'map-config': 'mapConfig'
};

// [method, đường dẫn (đoạn :id là tham số), hàm xử lý, mã trả về khi có thay đổi]
const INTERNAL_ROUTES = [
  ['GET', 'areas', ({ areas }) => areas.listAdmin().then((items) => ({ areas: items }))],
  ['POST', 'areas', ({ areas, body }) => areas.create(body), 201],
  ['GET', 'areas/:id', ({ areas, params }) => areas.getAdmin(params.id)],
  ['PATCH', 'areas/:id', ({ areas, params, body }) => areas.update(params.id, body)]
].map(([method, pattern, handler, createdStatus]) => ({ method, segments: pattern.split('/'), handler, createdStatus }));

function matchPath(segments, parts) {
  if (segments.length !== parts.length) return null;
  const params = {};
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index] === ':id') {
      if (!ID_PATTERN.test(parts[index])) throw new ServiceError(400, 'INVALID_REQUEST', 'Mã trong đường dẫn không hợp lệ.');
      params.id = parts[index];
    } else if (segments[index] !== parts[index]) {
      return null;
    }
  }
  return params;
}

function allowMethods(res, style, allow) {
  return send(res, 405, { ...(style === 'v1' && { success: false }), code: 'METHOD_NOT_ALLOWED', error: `Chỉ hỗ trợ ${allow}.` }, { Allow: allow });
}

/**
 * Tạo handler (req, res, url) cho mọi route của Geo Service. `getContext` trả { geo, areas, internalToken }
 * và được gọi lười, nên server preview không kết nối DB cho tới request geo đầu tiên.
 */
function createGeoHandler(getContext, logger = console) {
  async function handleLegacy(req, res, url, { geo }) {
    const operation = LEGACY_OPERATIONS[url.pathname.slice(LEGACY_PREFIX.length)];
    if (!operation) return send(res, 404, { error: 'Không tìm thấy API vị trí.' });
    if (req.method !== 'GET') return allowMethods(res, 'legacy', 'GET');
    const data = await geo[operation](url.searchParams);
    if (data === null) return send(res, 404, { error: 'Goong chưa tìm được kết quả phù hợp.' });
    return send(res, 200, { data });
  }

  async function handleV1(req, res, url, { geo, areas }) {
    const parts = url.pathname.slice(V1_PREFIX.length).split('/').filter(Boolean);
    const [head, tail, extra] = parts;

    if (head === 'health' && parts.length === 1) {
      if (req.method !== 'GET') return allowMethods(res, 'v1', 'GET');
      await areas.ping();
      return send(res, 200, { success: true, status: 'ok' });
    }
    if (head === 'map-config' && parts.length === 1) {
      if (req.method !== 'GET') return allowMethods(res, 'v1', 'GET');
      return send(res, 200, { success: true, data: await geo.mapConfig() });
    }
    if (head === 'places' && tail === 'search' && parts.length === 2) {
      if (req.method !== 'GET') return allowMethods(res, 'v1', 'GET');
      return send(res, 200, { success: true, data: await geo.searchPlaces(url.searchParams) });
    }
    if (head === 'areas' && parts.length <= 2) {
      if (req.method !== 'GET') return allowMethods(res, 'v1', 'GET');
      if (tail === undefined) return send(res, 200, { success: true, data: await areas.listPublic() });
      if (!ID_PATTERN.test(tail) || extra) return send(res, 400, { success: false, code: 'INVALID_REQUEST', error: 'Mã khu vực không hợp lệ.' });
      const area = await areas.getPublic(tail);
      return area
        ? send(res, 200, { success: true, data: area })
        : send(res, 404, { success: false, code: 'AREA_NOT_FOUND', error: 'Không tìm thấy khu vực.' });
    }
    return send(res, 404, { success: false, code: 'NOT_FOUND', error: 'Không tìm thấy API vị trí.' });
  }

  async function handleInternal(req, res, url, { areas, internalToken }) {
    if (!internalToken) {
      return send(res, 503, { success: false, code: 'INTERNAL_API_DISABLED', error: 'API nội bộ chưa bật: đặt INTERNAL_API_TOKEN (hoặc GEO_INTERNAL_API_TOKEN).' });
    }
    if (!tokenMatches(req.headers['x-internal-token'], internalToken)) {
      return send(res, 401, { success: false, code: 'UNAUTHORIZED', error: 'Thiếu hoặc sai X-Internal-Token.' });
    }
    const parts = url.pathname.slice(INTERNAL_PREFIX.length).split('/').filter(Boolean);
    const candidates = INTERNAL_ROUTES.map((route) => ({ route, params: matchPath(route.segments, parts) })).filter((entry) => entry.params);
    if (candidates.length === 0) return send(res, 404, { success: false, code: 'NOT_FOUND', error: 'Không tìm thấy API nội bộ.' });
    const match = candidates.find((entry) => entry.route.method === req.method);
    if (!match) return allowMethods(res, 'v1', [...new Set(candidates.map((entry) => entry.route.method))].join(', '));

    let body;
    if (req.method !== 'GET') {
      const contentType = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
      if (contentType !== 'application/json') {
        return send(res, 415, { success: false, code: 'UNSUPPORTED_MEDIA_TYPE', error: 'Nội dung yêu cầu phải là JSON.' });
      }
      body = await readJsonBody(req, MAX_BODY_BYTES);
    }
    const data = await match.route.handler({ areas, params: match.params, body });
    return send(res, match.route.createdStatus && data?.changed ? match.route.createdStatus : 200, { success: true, data });
  }

  return async function handle(req, res, url) {
    const style = url.pathname.startsWith(LEGACY_PREFIX) ? 'legacy' : 'v1';
    try {
      const context = await getContext();
      if (style === 'legacy') return await handleLegacy(req, res, url, context);
      if (url.pathname.startsWith(INTERNAL_PREFIX)) return await handleInternal(req, res, url, context);
      return await handleV1(req, res, url, context);
    } catch (error) {
      if (error instanceof ServiceError) {
        if (error.status === 413) req.resume();
        return send(res, error.status, {
          ...(style === 'v1' && { success: false }), code: error.code, error: error.message, ...(error.details ? { details: error.details } : {})
        });
      }
      if (error?.code === 'ER_DUP_ENTRY') {
        return send(res, 409, { success: false, code: 'CONFLICT', error: 'Dữ liệu trùng với bản ghi đã có.' });
      }
      logger.error?.('[routing-geo] Lỗi không mong đợi:', error);
      return send(res, 500, {
        ...(style === 'v1' && { success: false }), code: 'INTERNAL_ERROR', error: 'Dịch vụ vị trí gặp lỗi. Vui lòng thử lại.'
      });
    }
  };
}

function createDefaultContext(env = process.env, logger = console) {
  const goong = createGoongClient({ apiKey: env.GOONG_API_KEY, logger });
  if (!goong.configured) logger.warn?.('[routing-geo] Chưa đặt GOONG_API_KEY: các API gọi Goong trả 503, quản lý khu vực vẫn dùng được.');

  let repository;
  if (env.GEO_MYSQL_DATABASE && (env.GEO_MYSQL_HOST || env.MYSQL_HOST)) {
    repository = createMysqlAreaRepository({ pool: createMysqlPool(env) });
    logger.log?.(`[routing-geo] Dùng MySQL ${env.GEO_MYSQL_HOST || env.MYSQL_HOST}/${env.GEO_MYSQL_DATABASE}`);
  } else {
    repository = createMemoryAreaRepository(require('../db/seed.json'));
    logger.log?.('[routing-geo] Chưa cấu hình GEO_MYSQL_DATABASE: dùng kho in-memory với 3 khu vực mẫu (mất khi khởi động lại).');
  }

  const internalToken = env.GEO_INTERNAL_API_TOKEN || env.INTERNAL_API_TOKEN || null;
  if (!internalToken) logger.warn?.('[routing-geo] Chưa đặt INTERNAL_API_TOKEN: API nội bộ /api/internal/v1/geo/* đang tắt.');
  // Map Key chỉ dùng để trình duyệt tải ô bản đồ, nên được gửi cho frontend (hãy giới hạn theo tên miền trên Goong).
  // Không bao giờ đặt GOONG_API_KEY vào đây.
  const mapKey = (env.GOONG_MAPTILES_KEY || '').trim();
  const mapStyleUrl = mapKey ? `https://tiles.goong.io/assets/goong_map_web.json?api_key=${encodeURIComponent(mapKey)}` : null;
  if (!mapStyleUrl) logger.warn?.('[routing-geo] Chưa đặt GOONG_MAPTILES_KEY: bản đồ chỉ đường dùng nền OpenStreetMap.');
  return { geo: createGeoService({ goong, mapStyleUrl }), areas: createAreaService({ repository, goong }), internalToken };
}

let defaultContext;
const handleGeo = createGeoHandler(async () => {
  defaultContext ??= createDefaultContext();
  return defaultContext;
});

if (require.main === module) {
  const envFile = path.join(__dirname, '..', '..', '..', '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const port = Number(process.env.GEO_SERVICE_PORT) || 4004;
  createServer((req, res) => {
    void handleGeo(req, res, new URL(req.url, 'http://localhost'));
  }).listen(port, 'localhost', () => {
    console.log(`Routing & Geo Service đang chạy tại http://localhost:${port}`);
  });
}

module.exports = { handleGeo, createGeoHandler, createDefaultContext, isGeoRoute, GEO_ROUTE_PREFIXES: [LEGACY_PREFIX, V1_PREFIX, INTERNAL_PREFIX] };
