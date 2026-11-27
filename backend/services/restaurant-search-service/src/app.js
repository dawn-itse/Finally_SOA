const express = require('express');
const { send } = require('./http');
const { createSearchRouter } = require('./routes/searchRoutes');
const { createInternalRouter } = require('./admin/internalRoutes');

const SEARCH_BASE = '/api/v1/restaurants';
const INTERNAL_BASE = '/api/internal/v1';

/**
 * Dựng ứng dụng Express của Restaurant Search Service.
 * getContext trả về { service, repository, dishText, catalogAdmin, internalToken } và được gọi lười,
 * nên server preview không kết nối DB cho tới lúc có request đầu tiên.
 */
function createRestaurantSearchApp(getContext, logger = console) {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  app.set('case sensitive routing', true);

  app.use(INTERNAL_BASE, createInternalRouter(getContext, logger));
  app.use(SEARCH_BASE, createSearchRouter(getContext, logger));
  app.use((req, res) => send(res, 404, { success: false, error: 'Không tìm thấy API tìm quán.' }));
  return app;
}

module.exports = { createRestaurantSearchApp };
