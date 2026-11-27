const { existsSync } = require('node:fs');
const { createServer } = require('node:http');
const path = require('node:path');

const { ServiceError } = require('./errors');
const { send, readJsonBody } = require('./http');
const { createCatalogAdminService } = require('./admin/catalogAdminService');
const { createInternalHandler, INTERNAL_PREFIX } = require('./admin/internalRoutes');
const { loadDishText } = require('./dishText');
const { parseSearchRequest } = require('./validation');
const { createSearchService } = require('./searchService');
const { createGeoClient } = require('./clients/geoClient');
const { createReviewClient } = require('./clients/reviewClient');
const { createMemoryRepository } = require('./repositories/memoryRepository');
const { createMysqlRepository, createMysqlPool } = require('./repositories/mysqlRepository');

const SEARCH_ROUTE = '/api/v1/restaurants/search';
const HEALTH_ROUTE = '/api/v1/restaurants/health';
const MAX_BODY_BYTES = 4096;

/**
 * Tạo handler (req, res, url) cho các route của service. `getContext` trả về { service, repository, dishText, catalogAdmin, internalToken }
 * và được gọi lười, nên nạp server preview không kết nối DB cho tới lúc có request đầu tiên.
 */
function createRestaurantSearchHandler(getContext, logger = console) {
  const handleInternal = createInternalHandler(getContext, logger);
  return async function handle(req, res, url) {
    if (url.pathname.startsWith(INTERNAL_PREFIX)) return handleInternal(req, res, url);
    try {
      if (url.pathname === HEALTH_ROUTE) {
        if (req.method !== 'GET') return send(res, 405, { success: false, error: 'Chỉ hỗ trợ GET.' }, { Allow: 'GET' });
        const { repository } = await getContext();
        await repository.ping();
        return send(res, 200, { success: true, status: 'ok' });
      }
      if (url.pathname !== SEARCH_ROUTE) {
        return send(res, 404, { success: false, error: 'Không tìm thấy API tìm quán.' });
      }
      if (req.method !== 'POST') return send(res, 405, { success: false, error: 'Chỉ hỗ trợ POST.' }, { Allow: 'POST' });

      const contentType = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
      if (contentType !== 'application/json') {
        return send(res, 415, { success: false, error: 'Nội dung yêu cầu phải là JSON.' });
      }

      const body = await readJsonBody(req, MAX_BODY_BYTES);
      const { service, dishText } = await getContext();
      const request = parseSearchRequest(body, dishText);
      const data = await service.search(request);
      return send(res, 200, { success: true, data });
    } catch (error) {
      if (error instanceof ServiceError) {
        if (error.status === 413) req.resume();
        return send(res, error.status, {
          success: false, code: error.code, error: error.message, ...(error.details ? { details: error.details } : {})
        });
      }
      logger.error?.('[restaurant-search] Lỗi không mong đợi:', error);
      return send(res, 500, { success: false, code: 'INTERNAL_ERROR', error: 'Dịch vụ tìm quán gặp lỗi. Vui lòng thử lại.' });
    }
  };
}

async function createDefaultContext(env = process.env, logger = console) {
  const dishText = await loadDishText();

  let repository;
  if (env.MYSQL_HOST && env.MYSQL_DATABASE) {
    repository = createMysqlRepository({ pool: createMysqlPool(env) });
    logger.log?.(`[restaurant-search] Dùng MySQL ${env.MYSQL_HOST}/${env.MYSQL_DATABASE}`);
  } else {
    const seed = require('../db/seed.json');
    repository = createMemoryRepository(seed, { normalizeText: dishText.normalizeDishText });
    logger.log?.('[restaurant-search] Chưa cấu hình MYSQL_HOST/MYSQL_DATABASE: dùng kho in-memory với dữ liệu mẫu.');
  }

  const geoBaseUrl = env.GEO_SERVICE_URL || `http://localhost:${env.PORT || 3000}`;
  const service = createSearchService({
    repository,
    geoClient: createGeoClient({ baseUrl: geoBaseUrl }),
    reviewClient: createReviewClient({ baseUrl: env.REVIEW_SERVICE_URL || null, logger }),
    dishText,
    logger
  });
  const catalogAdmin = createCatalogAdminService({ repository, dishText });
  if (!env.INTERNAL_API_TOKEN) {
    logger.warn?.('[restaurant-search] Chưa đặt INTERNAL_API_TOKEN: API nội bộ /api/internal/v1/* đang tắt.');
  }
  return { service, repository, dishText, catalogAdmin, internalToken: env.INTERNAL_API_TOKEN || null };
}

let defaultContext;
const handleRestaurantSearch = createRestaurantSearchHandler(() => {
  defaultContext ??= createDefaultContext().catch((error) => {
    defaultContext = undefined; // cho phép thử lại ở request sau
    throw error;
  });
  return defaultContext;
});

if (require.main === module) {
  const envFile = path.join(__dirname, '..', '..', '..', '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const port = Number(process.env.RESTAURANT_SEARCH_PORT) || 4003;
  createServer((req, res) => {
    void handleRestaurantSearch(req, res, new URL(req.url, 'http://localhost'));
  }).listen(port, 'localhost', () => {
    console.log(`Restaurant Search Service đang chạy tại http://localhost:${port}`);
  });
}

module.exports = {
  handleRestaurantSearch,
  createRestaurantSearchHandler,
  createDefaultContext,
  RESTAURANT_SEARCH_ROUTE: SEARCH_ROUTE,
  RESTAURANT_HEALTH_ROUTE: HEALTH_ROUTE,
  RESTAURANT_INTERNAL_PREFIX: INTERNAL_PREFIX
};
