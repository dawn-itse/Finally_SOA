require('./config');
const express = require('express');
const path = require('node:path');
const { handleGoong } = require('./routes/geo');
const { createWeatherRouter } = require('./services/context-weather-service/src');
const { createNlpRouter } = require('./services/nlp-conversation-service/src');
const { createAuthRouter } = require('./services/auth-service/src');
const { fail, apiErrors } = require('./lib/http');

const app = express();
app.disable('x-powered-by');
app.use(createAuthRouter());
app.use(createNlpRouter());
app.use(createWeatherRouter());
app.use('/api/geo', (req, res) => handleGoong(req, res, new URL(req.originalUrl, 'http://localhost')));
app.use('/api', (_req, res) => fail(res, 404, 'Không tìm thấy API.'));

app.get('/shared/dishText.mjs', (_req, res) => res.sendFile(path.join(__dirname, '..', 'shared', 'dishText.mjs')));
app.use(express.static(path.join(__dirname, '..', 'frontend'), { dotfiles: 'ignore' }));
app.use((_req, res) => res.status(404).type('text').send('404 Not Found'));
app.use(apiErrors);

function startServer(port) {
  app.listen(port, 'localhost', (error) => {
    if (error?.code === 'EADDRINUSE' && port < 65535) {
      console.log(`Cổng ${port} đang được sử dụng, chuyển sang cổng ${port + 1}.`);
      return startServer(port + 1);
    }
    if (error) {
      console.error('Preview:', error.code || error.name);
      process.exitCode = 1;
      return;
    }
    console.log(`Mua Gì Đây đang chạy tại http://localhost:${port}`);
  });
}

startServer(Number(process.env.PORT) || 3000);
