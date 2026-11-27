/**
 * Bộ chuyển Goong REST API V2. Chỉ lớp này đọc GOONG_API_KEY và gọi rsapi.goong.io.
 *
 * Mỗi hàm trả dữ liệu đã chuẩn hóa, hoặc null khi Goong không có kết quả (autocomplete trả []).
 * Lỗi hạ tầng ném ServiceError: 503 GOONG_NOT_CONFIGURED / GOONG_RATE_LIMITED, 502 GOONG_UNAVAILABLE / GOONG_BAD_RESPONSE.
 * Khóa API không bao giờ được ghi log hay trả về cho client.
 */
const { ServiceError } = require('./errors');
const { cleanText } = require('./validation');

const GOONG_BASE = 'https://rsapi.goong.io';
const TIMEOUT_MS = 5000;
// Goong Directions V2 chỉ nhận car hoặc bike (Distance Matrix V2 thì nhận cả motorcycle). Dùng car vì xe máy đi theo mạng đường gần giống ô tô; bike là xe đạp.
const DIRECTIONS_VEHICLE = 'car';

const unavailable = () => new ServiceError(502, 'GOONG_UNAVAILABLE', 'Chưa kết nối được với Goong. Vui lòng thử lại.');
const badResponse = () => new ServiceError(502, 'GOONG_BAD_RESPONSE', 'Goong chưa trả về dữ liệu phù hợp.');

function distanceAndDuration(value) {
  const distance_m = value?.distance?.value;
  const duration_s = value?.duration?.value;
  if (!Number.isFinite(distance_m) || distance_m < 0 || !Number.isFinite(duration_s) || duration_s < 0) return null;
  return { distance_m, duration_s };
}

function normalizePlace(result, requestedId, now) {
  const latitude = result?.geometry?.location?.lat;
  const longitude = result?.geometry?.location?.lng;
  const address = cleanText(result?.formatted_address);
  if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {
    provider: 'GOONG',
    provider_place_id: cleanText(result.place_id) || requestedId,
    name: cleanText(result.name),
    types: Array.isArray(result.types) ? result.types.map(cleanText).filter(Boolean) : [],
    address_text: address,
    latitude,
    longitude,
    commune: cleanText(result.compound?.commune) || null,
    province: cleanText(result.compound?.province) || null,
    deprecated_address_text: cleanText(result.deprecated_description) || null,
    geocoded_at: now().toISOString()
  };
}

function createGoongClient({ apiKey, fetchImpl = fetch, timeoutMs = TIMEOUT_MS, baseUrl = GOONG_BASE, now = () => new Date(), logger = console } = {}) {
  const key = cleanText(apiKey);
  const inflight = new Map();

  async function fetchPayload(url) {
    let response;
    try {
      response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    } catch {
      throw unavailable();
    }
    if (!response.ok) {
      await response.body?.cancel();
      logger.warn?.(`[routing-geo] Goong trả HTTP ${response.status}`); // không ghi URL vì có api_key
      throw response.status === 429
        ? new ServiceError(503, 'GOONG_RATE_LIMITED', 'Goong đang giới hạn lượt gọi. Vui lòng thử lại sau.')
        : new ServiceError(502, 'GOONG_UNAVAILABLE', 'Dịch vụ Goong tạm thời không khả dụng.');
    }
    try {
      return await response.json();
    } catch {
      throw badResponse();
    }
  }

  /** Trả { empty: true } khi Goong báo không có kết quả, ngược lại { payload }. */
  async function call(endpoint, params) {
    if (!key) throw new ServiceError(503, 'GOONG_NOT_CONFIGURED', 'Goong chưa được cấu hình.');
    const url = new URL(endpoint, baseUrl);
    url.search = new URLSearchParams(params);
    url.searchParams.set('api_key', key);

    // Các lượt gọi giống hệt nhau cùng lúc dùng chung một yêu cầu tới Goong (không lưu kết quả lại).
    const dedupeKey = url.href;
    let pending = inflight.get(dedupeKey);
    if (!pending) {
      pending = fetchPayload(url).finally(() => inflight.delete(dedupeKey));
      inflight.set(dedupeKey, pending);
    }
    const payload = await pending;

    if (payload?.status === 'ZERO_RESULTS' || payload?.status === 'NOT_FOUND') return { empty: true };
    if (payload?.status === 'OVER_QUERY_LIMIT') throw new ServiceError(503, 'GOONG_RATE_LIMITED', 'Goong đang giới hạn lượt gọi. Vui lòng thử lại sau.');
    if (!payload || (payload.status && payload.status !== 'OK')) throw badResponse();
    return { payload };
  }

  return {
    get configured() { return Boolean(key); },

    /** Tối đa 5 gợi ý { place_id, description }. */
    async autocomplete({ input, location, radiusKm, limit = 5 }) {
      const params = { input, limit: String(Math.min(limit, 5)), more_compound: 'true', has_deprecated_administrative_unit: 'true' };
      if (location) params.location = location;
      if (radiusKm) params.radius = String(radiusKm);
      const { payload, empty } = await call('/v2/place/autocomplete', params);
      if (empty) return [];
      if (!Array.isArray(payload.predictions)) throw badResponse();
      return payload.predictions
        .map((item) => ({ place_id: cleanText(item?.place_id), description: cleanText(item?.description) }))
        .filter((item) => item.place_id && item.description)
        .slice(0, 5);
    },

    /** Địa điểm đã chuẩn hóa theo cột RESTAURANT_LOCATION, hoặc null. */
    async placeDetail(placeId) {
      const { payload, empty } = await call('/v2/place/detail', { place_id: placeId, has_deprecated_administrative_unit: 'true' });
      if (empty) return null;
      const place = normalizePlace(payload.result, placeId, now);
      if (!place) throw badResponse();
      return place;
    },

    /** Nhãn địa chỉ cho tọa độ, hoặc null. `latlng` là chuỗi "lat,lng". */
    async reverse(latlng) {
      const { payload, empty } = await call('/v2/geocode', { latlng, limit: '1' });
      if (empty) return null;
      const address = cleanText(payload.results?.[0]?.formatted_address);
      if (!address) throw badResponse();
      return { address };
    },

    /** Quãng đường xe máy theo thứ tự điểm đến; phần tử null nếu không có tuyến. */
    async distanceMatrix({ origin, destinations }) {
      const { payload, empty } = await call('/v2/distancematrix', { origins: origin, destinations: destinations.join('|'), vehicle: 'motorcycle' });
      if (empty) return null;
      const elements = payload.rows?.[0]?.elements;
      if (!Array.isArray(elements) || elements.length !== destinations.length) throw badResponse();
      return elements.map((cell) => (cell?.status === 'OK' ? distanceAndDuration(cell) : null));
    },

    /** Tuyến đường (phương tiện car): số đo, các bước chỉ đường (văn bản thuần) và polyline mã hóa để vẽ bản đồ. */
    async directions({ origin, destination }) {
      const { payload, empty } = await call('/v2/direction', { origin, destination, vehicle: DIRECTIONS_VEHICLE });
      if (empty) return null;
      const route = payload.routes?.[0];
      const leg = route?.legs?.[0];
      const metrics = distanceAndDuration(leg);
      if (!metrics) throw badResponse();
      return {
        ...metrics,
        steps: Array.isArray(leg.steps) ? leg.steps.map((step) => cleanText(step?.html_instructions).replace(/<[^>]*>/g, '')).filter(Boolean) : [],
        polyline: cleanText(route.overview_polyline?.points) || null
      };
    }
  };
}

module.exports = { createGoongClient, GOONG_BASE };
