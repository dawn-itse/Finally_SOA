const express = require('express');
const { parseSearchRequest } = require('../validation');
const {
  send, asyncHandler, withContext, requireJson, jsonBody, methodNotAllowed, createErrorHandler
} = require('../http');

const MAX_BODY_BYTES = 4096;

/**
 * Router công khai, gắn tại /api/v1/restaurants:
 *   POST /search  - tìm quán theo món
 *   GET  /health  - kiểm tra kết nối kho dữ liệu
 * getContext trả về { service, repository, dishText }.
 */
function createSearchRouter(getContext, logger = console) {
  const router = express.Router({ caseSensitive: true, strict: true });

  router.route('/health')
    .get(withContext(getContext), asyncHandler(async (req, res) => {
      await res.locals.ctx.repository.ping();
      send(res, 200, { success: true, status: 'ok' });
    }))
    .all(methodNotAllowed('GET'));

  router.route('/search')
    .post(requireJson(), jsonBody(MAX_BODY_BYTES), asyncHandler(async (req, res) => {
      const { service, dishText } = await getContext();
      const request = parseSearchRequest(req.body, dishText);
      const data = await service.search(request);
      send(res, 200, { success: true, data });
    }))
    .all(methodNotAllowed('POST'));

  router.use(createErrorHandler({
    logger,
    logLabel: '[restaurant-search] Lỗi không mong đợi:',
    genericError: 'Dịch vụ tìm quán gặp lỗi. Vui lòng thử lại.'
  }));
  return router;
}

module.exports = { createSearchRouter };
