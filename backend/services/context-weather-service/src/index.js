const { existsSync } = require('node:fs');
const { createServer } = require('node:http');
const path = require('node:path');

const WEATHER_ROUTE = '/api/v1/context/morning-greeting';
const METEOSOURCE_URL = 'https://www.meteosource.com/api/v1/free/point';
const CACHE_TTL = 10 * 60 * 1000;
const MAX_CACHED_POINTS = 128;
const weatherByPoint = new Map();

function parseCoordinates(query) {
  const parts = (query ?? '').split(',').map((part) => part.trim());
  if (parts.length !== 2 || parts.some((part) => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(part))) return null;
  const [lat, lon] = parts.map(Number);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: lat.toFixed(3), lon: lon.toFixed(3) };
}

function suggestMeal(current, fetchedAt) {
  const icon = typeof current.icon === 'string' ? current.icon : '';
  const temp = Math.round(current.temperature);
  const rainy = /rain|shower|thunder/.test(icon) || current.precipitation?.type === 'rain';
  const cold = current.temperature <= 22;
  const hot = current.temperature >= 32;
  const condition = rainy ? 'có mưa'
    : /overcast|cloudy|partly_sunny/.test(icon) ? 'có mây'
    : /sunny|clear/.test(icon) ? 'trời quang'
    : /fog/.test(icon) ? 'có sương mù'
    : cold ? 'trời se lạnh' : hot ? 'trời nóng' : 'trời dịu';

  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: 'numeric',
    hourCycle: 'h23'
  }).format(fetchedAt));
  const timeOfDay = hour < 11 ? 'Buổi sáng' : hour < 14 ? 'Buổi trưa' : hour < 18 ? 'Buổi chiều' : 'Buổi tối';
  const meal = rainy ? 'bánh mì pate nóng'
    : cold ? 'một bát phở bò nóng'
    : hot ? 'bún riêu cua và một ly trà đá'
    : 'một bát bún riêu cua';
  const suggestedQuery = rainy ? '35k bánh mì pate' : cold ? '50k phở bò' : '45k bún riêu cua';

  return {
    temp,
    condition,
    fetchedAt: fetchedAt.toISOString(),
    suggestionQuote: `${timeOfDay} ${condition}, bạn có thể thử ${meal}.`,
    suggestedQuery
  };
}

async function fetchWeather({ lat, lon }, key) {
  const url = new URL(METEOSOURCE_URL);
  url.search = new URLSearchParams({ lat, lon, sections: 'current', units: 'metric' });
  const response = await fetch(url, {
    headers: { 'X-API-Key': key },
    signal: AbortSignal.timeout(5000),
    redirect: 'error'
  });
  if (!response.ok) {
    await response.body?.cancel();
    return { status: [402, 429].includes(response.status) ? 503 : 502 };
  }

  const { current } = await response.json();
  if (!Number.isFinite(current?.temperature)) return { status: 502 };
  return { status: 200, data: suggestMeal(current, new Date()) };
}

async function getWeather(point, key) {
  const pointKey = `${point.lat},${point.lon}`;
  const cached = weatherByPoint.get(pointKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  weatherByPoint.delete(pointKey);
  if (weatherByPoint.size >= MAX_CACHED_POINTS) {
    weatherByPoint.delete(weatherByPoint.keys().next().value);
  }

  const entry = {
    expiresAt: Date.now() + CACHE_TTL,
    result: fetchWeather(point, key).catch(() => ({ status: 502 }))
  };
  weatherByPoint.set(pointKey, entry);
  const result = await entry.result;
  if (result.status !== 200 && weatherByPoint.get(pointKey) === entry) weatherByPoint.delete(pointKey);
  return result;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(JSON.stringify(body));
}

async function handleWeather(req, res, url) {
  if (url.pathname !== WEATHER_ROUTE) {
    return send(res, 404, { success: false, error: 'Không tìm thấy API thời tiết.' });
  }
  if (req.method !== 'GET') {
    return send(res, 405, { success: false, error: 'Chỉ hỗ trợ GET.' }, { Allow: 'GET' });
  }
  const coordinates = parseCoordinates(url.searchParams.get('q'));
  if (!coordinates) return send(res, 400, { success: false, error: 'Cần tọa độ hợp lệ theo dạng vĩ độ,kinh độ.' });

  const key = process.env.METEOSOURCE_API_KEY?.trim();
  if (!key) return send(res, 503, { success: false, error: 'Chưa cấu hình Meteosource.' });
  const { status, data } = await getWeather(coordinates, key);
  if (status !== 200) return send(res, status, { success: false, error: 'Thời tiết hiện không khả dụng.' });
  return send(res, 200, { success: true, source: 'meteosource', data });
}

if (require.main === module) {
  const envFile = path.join(__dirname, '..', '..', '..', '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const port = Number(process.env.WEATHER_PORT) || 4001;
  createServer((req, res) => {
    void handleWeather(req, res, new URL(req.url, 'http://localhost'));
  }).listen(port, 'localhost', () => {
    console.log(`Context & Weather Service đang chạy tại http://localhost:${port}`);
  });
}

module.exports = { handleWeather, WEATHER_ROUTE };
