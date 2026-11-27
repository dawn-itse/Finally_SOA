/**
 * Giữ lại để tương thích: proxy Goong đã chuyển sang Routing & Geo Service.
 * Xem backend/services/routing-geo-service/src/goongClient.js và index.js.
 */
const { handleGeo } = require('../services/routing-geo-service/src');

module.exports = { handleGoong: handleGeo };
