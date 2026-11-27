const { existsSync } = require('node:fs');
const path = require('node:path');

const { createRestaurantSearchApp } = require('./app');
const { createCatalogAdminService } = require('./admin/catalogAdminService');
const { INTERNAL_PREFIX } = require('./admin/internalRoutes');
const { loadDishText } = require('./dishText');
const { createSearchService } = require('./searchService');
const { createGeoClient } = require('./clients/geoClient');
const { createReviewClient } = require('./clients/reviewClient');
const { createMemoryRepository } = require('./repositories/memoryRepository');
const { createMysqlRepository, createMysqlPool } = require('./repositories/mysqlRepository');

const SEARCH_ROUTE = '/api/v1/restaurants/search';
const HEALTH_ROUTE = '/api/v1/restaurants/health';

/**
 * Trả về handler (req, res) cho server Node thuần (server preview dùng cách này).
 * Bên trong là ứng dụng Express; tham số thứ ba (url) của handler cũ được bỏ qua.
 */
function createRestaurantSearchHandler(getContext, logger = console) {
  const app = createRestaurantSearchApp(getContext, logger);
  return (req, res) => { app(req, res); };
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
const getDefaultContext = () => {
  defaultContext ??= createDefaultContext().catch((error) => {
    defaultContext = undefined; // cho phép thử lại ở request sau
    throw error;
  });
  return defaultContext;
};
const app = createRestaurantSearchApp(getDefaultContext);
const handleRestaurantSearch = (req, res) => { app(req, res); };

if (require.main === module) {
  const envFile = path.join(__dirname, '..', '..', '..', '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const port = Number(process.env.RESTAURANT_SEARCH_PORT) || 4003;
  app.listen(port, 'localhost', () => {
    console.log(`Restaurant Search Service đang chạy tại http://localhost:${port}`);
  });
}

module.exports = {
  app,
  handleRestaurantSearch,
  createRestaurantSearchApp,
  createRestaurantSearchHandler,
  createDefaultContext,
  RESTAURANT_SEARCH_ROUTE: SEARCH_ROUTE,
  RESTAURANT_HEALTH_ROUTE: HEALTH_ROUTE,
  RESTAURANT_INTERNAL_PREFIX: INTERNAL_PREFIX
};
