/**
 * SERVICE 1: Context & Weather Service (Port 4001)
 * Lấy thời tiết hiện tại từ WeatherAPI, tạo gợi ý món ăn và dùng dữ liệu
 * mẫu làm fallback khi thiếu API key hoặc nhà cung cấp không phản hồi.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Hỗ trợ .env ở thư mục service/src (vị trí hiện tại của bạn) hoặc ở project root.
// Node.js 24 có sẵn process.loadEnvFile, nên service không cần thêm package dotenv.
const envCandidates = [
  path.join(__dirname, '.env'),
  path.resolve(__dirname, '../../../.env')
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
    break;
  }
}

const app = express();
const PORT = Number(process.env.PORT) || 4001;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const WEATHER_API_URL = 'https://api.weatherapi.com/v1/current.json';
const CACHE_TTL_MS = 10 * 60 * 1000;
const weatherCache = new Map();

app.use(cors());
app.use(express.json());

// Dữ liệu dùng khi chưa cấu hình key hoặc WeatherAPI tạm thời không dùng được.
const WEATHER_CONTEXTS = [
  {
    id: 'morning-clear',
    temp: 28,
    condition: 'trời quang',
    greetingQuestion: 'Sáng nay bạn muốn chi bao nhiêu tiền?',
    suggestionQuote: 'Trời quang ấm nhẹ lúc sáng sớm, bún riêu cua với trà đào cho dễ ăn mà thanh miệng nhé.',
    suggestedQuery: '45k bún riêu cua',
    recommendedTags: ['thanh đạm', 'món nước', 'mát mẻ']
  },
  {
    id: 'morning-cool',
    temp: 22,
    condition: 'se lạnh',
    greetingQuestion: 'Sáng nay bạn muốn chi bao nhiêu tiền?',
    suggestionQuote: 'Sáng sớm trời se lạnh dễ chịu, làm một bát phở bò tái nóng hổi kèm quẩy giòn là chuẩn bài!',
    suggestedQuery: '50k phở bò',
    recommendedTags: ['nóng hổi', 'món nước', 'đậm đà']
  },
  {
    id: 'morning-rainy',
    temp: 24,
    condition: 'mưa nhẹ',
    greetingQuestion: 'Sáng nay bạn muốn chi bao nhiêu tiền?',
    suggestionQuote: 'Ngoài trời đang mưa nhẹ, ổ bánh mì pate trứng nóng giòn với ly cà phê sữa ấm áp sẽ rất hợp.',
    suggestedQuery: '35k bánh mì pate',
    recommendedTags: ['nhanh gọn', 'nóng giòn', 'đồ uống ấm']
  }
];

function getFallbackContext(index) {
  const parsedIndex = Number.parseInt(index, 10);
  const safeIndex = Number.isFinite(parsedIndex) ? parsedIndex : 0;
  return WEATHER_CONTEXTS[((safeIndex % WEATHER_CONTEXTS.length) + WEATHER_CONTEXTS.length) % WEATHER_CONTEXTS.length];
}

function getTimeOfDay(localtime) {
  // WeatherAPI trả localtime dạng "YYYY-MM-DD HH:mm" theo múi giờ địa điểm.
  const hourText = typeof localtime === 'string' ? localtime.match(/\s(\d{2}):\d{2}$/) : null;
  const hour = hourText ? Number(hourText[1]) : new Date().getHours();
  if (hour >= 5 && hour < 11) return 'buổi sáng';
  if (hour >= 11 && hour < 14) return 'buổi trưa';
  if (hour >= 14 && hour < 18) return 'buổi chiều';
  return 'buổi tối';
}

function getFoodSuggestion(condition, tempC) {
  const normalizedCondition = String(condition || '').toLowerCase();
  if (normalizedCondition.includes('mưa') || normalizedCondition.includes('dông')) {
    return {
      suggestionQuote: 'Trời đang mưa, một phần bánh mì nóng giòn kèm đồ uống ấm sẽ tiện và dễ ăn.',
      suggestedQuery: '35k bánh mì pate',
      recommendedTags: ['nhanh gọn', 'nóng giòn', 'đồ uống ấm']
    };
  }
  if (Number(tempC) <= 22 || normalizedCondition.includes('lạnh')) {
    return {
      suggestionQuote: 'Trời se lạnh, một bát phở nóng hổi sẽ là lựa chọn hợp bụng.',
      suggestedQuery: '50k phở bò',
      recommendedTags: ['nóng hổi', 'món nước', 'đậm đà']
    };
  }
  if (Number(tempC) >= 30 || normalizedCondition.includes('nắng')) {
    return {
      suggestionQuote: 'Trời khá nóng, món thanh nhẹ cùng đồ uống mát có thể hợp với bạn.',
      suggestedQuery: '45k bún riêu cua',
      recommendedTags: ['thanh đạm', 'món nước', 'mát mẻ']
    };
  }
  return {
    suggestionQuote: 'Thời tiết khá dễ chịu, bún riêu cua là một gợi ý thanh nhẹ cho bữa sáng.',
    suggestedQuery: '45k bún riêu cua',
    recommendedTags: ['thanh đạm', 'món nước', 'dễ ăn']
  };
}

async function fetchCurrentWeather(locationQuery) {
  const cached = weatherCache.get(locationQuery);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const url = new URL(WEATHER_API_URL);
  url.searchParams.set('key', WEATHER_API_KEY);
  url.searchParams.set('q', locationQuery);
  url.searchParams.set('lang', 'vi');
  url.searchParams.set('aqi', 'no');

  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    const providerCode = payload.error && payload.error.code;
    throw new Error(`WeatherAPI request failed${providerCode ? ` (code ${providerCode})` : ''}`);
  }

  weatherCache.set(locationQuery, { data: payload, expiresAt: Date.now() + CACHE_TTL_MS });
  return payload;
}

app.get('/health', (req, res) => {
  res.json({
    service: 'context-weather-service',
    status: 'UP',
    providerConfigured: Boolean(WEATHER_API_KEY),
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/context/morning-greeting', async (req, res) => {
  const fallback = getFallbackContext(req.query.index);
  // Mặc định dùng Thành phố Hồ Chí Minh; có thể gửi vị trí khác qua ?q=lat,lon.
  const requestedLocation = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const locationQuery = requestedLocation && requestedLocation.length <= 120
    ? requestedLocation
    : 'Ho Chi Minh City';

  if (!WEATHER_API_KEY) {
    return res.json({
      success: true,
      service: 'context-weather-service',
      timeOfDay: getTimeOfDay(),
      source: 'mock-fallback',
      data: fallback
    });
  }

  try {
    const weather = await fetchCurrentWeather(locationQuery);
    const current = weather.current;
    const location = weather.location;
    const recommendation = getFoodSuggestion(current.condition.text, current.temp_c);

    const data = {
      ...fallback,
      id: 'live-weather',
      temp: current.temp_c,
      condition: current.condition.text,
      icon: current.condition.icon,
      location: {
        name: location.name,
        region: location.region,
        country: location.country,
        localtime: location.localtime
      },
      greetingQuestion: `${getTimeOfDay(location.localtime)} nay bạn muốn ăn gì?`,
      ...recommendation
    };

    console.log(`[Context-Weather-Service] WeatherAPI data loaded for ${location.name}`);
    return res.json({
      success: true,
      service: 'context-weather-service',
      timeOfDay: getTimeOfDay(location.localtime),
      source: 'weatherapi',
      data
    });
  } catch (error) {
    // Không gửi chi tiết provider hoặc URL (có thể chứa key) về client hay log.
    console.warn(`[Context-Weather-Service] WeatherAPI unavailable; using mock fallback (${error.message})`);
    return res.json({
      success: true,
      service: 'context-weather-service',
      timeOfDay: getTimeOfDay(),
      source: 'mock-fallback',
      data: fallback
    });
  }
});

app.listen(PORT, () => {
  console.log(`[Context-Weather-Service] đang chạy tại http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
