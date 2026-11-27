/**
 * Node.js server for previewing the "Mua Gì Đây" frontend and APIs.
 * Run: node backend/server.js -> Open http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleGeo, isGeoRoute } = require('./services/routing-geo-service/src');
const { handleWeather, WEATHER_ROUTE } = require('./services/context-weather-service/src');
const { handleNlp, NLP_ROUTE } = require('./services/nlp-conversation-service/src');
const { handleRestaurantSearch, RESTAURANT_SEARCH_ROUTE, RESTAURANT_INTERNAL_PREFIX } = require('./services/restaurant-search-service/src');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const DISH_TEXT_MODULE = path.join(__dirname, '..', 'shared', 'dishText.mjs');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function createAppServer() {
  return http.createServer((req, res) => {
    const requestUrl = new URL(req.url, 'http://localhost');
    // Geo trước Restaurant Search: /api/internal/v1/geo/* nằm dưới tiền tố nội bộ của Catalog.
    if (isGeoRoute(requestUrl.pathname)) {
      handleGeo(req, res);
      return;
    }
    if (requestUrl.pathname === NLP_ROUTE) {
      void handleNlp(req, res, requestUrl);
      return;
    }
    if (requestUrl.pathname === RESTAURANT_SEARCH_ROUTE || requestUrl.pathname.startsWith(RESTAURANT_INTERNAL_PREFIX)) {
      void handleRestaurantSearch(req, res, requestUrl);
      return;
    }
    if (requestUrl.pathname === WEATHER_ROUTE) {
      void handleWeather(req, res, requestUrl);
      return;
    }
    const safePath = requestUrl.pathname;
    const relativePath = safePath === '/' ? 'index.html' : safePath.replace(/^\/+/, '');
    const filePath = safePath === '/shared/dishText.mjs' ? DISH_TEXT_MODULE : path.join(FRONTEND_DIR, relativePath);

    if (filePath !== DISH_TEXT_MODULE && !filePath.startsWith(FRONTEND_DIR + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(content);
    });
  });
}

function startServer(port) {
  const server = createAppServer();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Cổng ${port} đang được sử dụng, tự động chuyển sang cổng ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(port, 'localhost', () => {
    console.log(`=====================================================`);
    console.log(`🍜 Mua Gi Day Preview running at:`);
    console.log(`👉 http://localhost:${port}`);
    console.log(`=====================================================`);
  });
}

startServer(DEFAULT_PORT);
