const express = require('express');
const { pool } = require('../../../database/pool');
const { reply, fail, methodNotAllowed, listenService } = require('../../../lib/http');

const WEATHER_ROUTE = '/api/v1/context/morning-greeting';
const METEOSOURCE_URL = 'https://www.meteosource.com/api/v1/free/point';
const CACHE_TTL = 10 * 60 * 1000;
const MAX_PENDING_POINTS = 128;

function parseCoordinates(query) {
  if (typeof query !== 'string') return null;
  const parts = query.split(',').map((part) => part.trim());
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

function createWeatherRouter(db = pool) {
  const router = express.Router();
  const pendingByPoint = new Map();
  let nextCleanup = 0;

  async function getWeather(point) {
    const { lat, lon } = point;
    const [rows] = await db.execute(
      'SELECT payload FROM weather_cache WHERE latitude = ? AND longitude = ? AND expires_at > UTC_TIMESTAMP(3)',
      [lat, lon]
    );
    if (rows[0]) return { status: 200, data: rows[0].payload };

    const key = process.env.METEOSOURCE_API_KEY?.trim();
    if (!key) return { status: 503, error: 'Chưa cấu hình Meteosource.' };

    const result = await fetchWeather(point, key).catch(() => ({ status: 502 }));
    if (result.status !== 200) return result;
    const payload = JSON.stringify(result.data);
    const expiresAt = new Date(Date.parse(result.data.fetchedAt) + CACHE_TTL);
    await db.execute(
      `INSERT INTO weather_cache (latitude, longitude, payload, expires_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE payload = ?, expires_at = ?`,
      [lat, lon, payload, expiresAt, payload, expiresAt]
    );
    if (Date.now() >= nextCleanup) {
      nextCleanup = Date.now() + CACHE_TTL;
      void db.execute('DELETE FROM weather_cache WHERE expires_at <= UTC_TIMESTAMP(3) LIMIT 500')
        .catch((error) => console.error('Weather cleanup:', error.code || error.name));
    }
    return result;
  }

  router.head(WEATHER_ROUTE, methodNotAllowed('GET'));
  router.get(WEATHER_ROUTE, async (req, res) => {
    const coordinates = parseCoordinates(req.query.q);
    if (!coordinates) return fail(res, 400, 'Cần tọa độ hợp lệ theo dạng vĩ độ,kinh độ.');

    const pointKey = `${coordinates.lat},${coordinates.lon}`;
    let pending = pendingByPoint.get(pointKey);
    if (!pending) {
      if (pendingByPoint.size >= MAX_PENDING_POINTS) return fail(res, 503, 'Dịch vụ thời tiết đang bận.');
      pending = getWeather(coordinates).finally(() => pendingByPoint.delete(pointKey));
      pendingByPoint.set(pointKey, pending);
    }
    const { status, data, error } = await pending;
    if (status !== 200) return fail(res, status, error || 'Thời tiết hiện không khả dụng.');
    return reply(res, 200, { success: true, source: 'meteosource', data });
  });
  router.all(WEATHER_ROUTE, methodNotAllowed('GET'));

  return router;
}

if (require.main === module) {
  listenService(createWeatherRouter(), Number(process.env.WEATHER_PORT) || 4001, 'Context & Weather Service');
}

module.exports = { createWeatherRouter };
