/**
 * Zero-dependency Node.js Server for previewing "Mua Gì Đây" Frontend
 * Run: node backend/server.js -> Open http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleGoong } = require('./routes/geo');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function createAppServer() {
  return http.createServer((req, res) => {
    const requestUrl = new URL(req.url, 'http://localhost');
    if (requestUrl.pathname.startsWith('/api/geo/')) {
      void handleGoong(req, res, requestUrl);
      return;
    }
    const safePath = requestUrl.pathname;
    const relativePath = safePath === '/' ? 'index.html' : safePath.replace(/^\/+/, '');
    const filePath = path.join(FRONTEND_DIR, relativePath);

    if (!filePath.startsWith(FRONTEND_DIR + path.sep)) {
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
