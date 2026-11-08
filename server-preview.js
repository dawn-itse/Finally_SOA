/**
 * Zero-dependency Node.js Static Server for previewing "Mua Gì Đây" Frontend
 * Run: node server-preview.js -> Open http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIR = path.join(__dirname, 'frontend');

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
    const safePath = req.url.split('?')[0];
    const relativePath = safePath === '/' ? 'index.html' : safePath.replace(/^\/+/, '');
    const filePath = path.join(FRONTEND_DIR, relativePath);

    if (!filePath.startsWith(FRONTEND_DIR)) {
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

  server.listen(port, () => {
    console.log(`=====================================================`);
    console.log(`🍜 Mua Gi Day Frontend Server running at:`);
    console.log(`👉 http://localhost:${port}`);
    console.log(`=====================================================`);
  });
}

startServer(DEFAULT_PORT);
