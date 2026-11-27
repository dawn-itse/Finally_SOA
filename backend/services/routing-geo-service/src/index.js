const { existsSync } = require('node:fs');
const path = require('node:path');

const { createGeoApp, isGeoRoute, GEO_ROUTE_PREFIXES } = require('./app');
const { createGoongClient } = require('./goongClient');
const { createGeoService } = require('./geoService');
const { createAreaService } = require('./areaService');
const { createMemoryAreaRepository } = require('./repositories/memoryAreaRepository');
const { createMysqlAreaRepository, createMysqlPool } = require('./repositories/mysqlAreaRepository');

function createGeoHandler(getContext, logger = console) {
  const app = createGeoApp(getContext, logger);
  return (req, res) => app(req, res);
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
const app = createGeoApp(async () => {
  defaultContext ??= createDefaultContext();
  return defaultContext;
});
const handleGeo = (req, res) => app(req, res);

if (require.main === module) {
  const envFile = path.join(__dirname, '..', '..', '..', '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const port = Number(process.env.GEO_SERVICE_PORT) || 4004;
  app.listen(port, 'localhost', () => {
    console.log(`Routing & Geo Service đang chạy tại http://localhost:${port}`);
  });
}

module.exports = { app, handleGeo, createGeoApp, createGeoHandler, createDefaultContext, isGeoRoute, GEO_ROUTE_PREFIXES };
