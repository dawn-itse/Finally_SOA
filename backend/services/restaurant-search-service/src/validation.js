const { ServiceError } = require('./errors');

const SORT_OPTIONS = ['recommended', 'distance', 'rating', 'price'];
const MAX_PRICE_VND = 10_000_000;
const MAX_RADIUS_KM = 50;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const AREA_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

const invalid = (message) => new ServiceError(400, 'INVALID_REQUEST', message);
const inRange = (value, max) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;

function parseAnchor(anchor) {
  if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) {
    throw invalid('Cần anchor dạng { source: "AREA", area_id } hoặc { source: "GPS", lat, lng }.');
  }
  if (anchor.source === 'GPS') {
    if (!inRange(anchor.lat, 90) || !inRange(anchor.lng, 180)) throw invalid('Tọa độ GPS không hợp lệ.');
    return { source: 'GPS', lat: anchor.lat, lng: anchor.lng };
  }
  if (anchor.source === 'AREA') {
    if (typeof anchor.area_id !== 'string' || !AREA_ID_PATTERN.test(anchor.area_id)) throw invalid('area_id không hợp lệ.');
    return { source: 'AREA', area_id: anchor.area_id };
  }
  throw invalid('anchor.source phải là AREA hoặc GPS.');
}

/**
 * Kiểm tra body của POST /api/v1/restaurants/search.
 * dishText là module shared/dishText.mjs: dùng chung quy tắc với NLP Service.
 */
function parseSearchRequest(body, dishText) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Nội dung yêu cầu phải là một đối tượng JSON.');
  if (typeof body.dish !== 'string') throw invalid('Cần chuỗi dish.');

  const dish = dishText.readDishName(body.dish);
  if (!dish) throw new ServiceError(422, 'INVALID_DISH', 'Chỉ nhập tên món. Chọn giá và bán kính bằng bộ lọc.');

  if (!Number.isSafeInteger(body.max_price) || body.max_price < 1 || body.max_price > MAX_PRICE_VND) {
    throw invalid(`max_price phải là số nguyên đồng trong khoảng 1 đến ${MAX_PRICE_VND}.`);
  }
  if (typeof body.radius_km !== 'number' || !Number.isFinite(body.radius_km) || body.radius_km <= 0 || body.radius_km > MAX_RADIUS_KM) {
    throw invalid(`radius_km phải lớn hơn 0 và không quá ${MAX_RADIUS_KM}.`);
  }

  const sortBy = body.sort_by ?? 'recommended';
  if (!SORT_OPTIONS.includes(sortBy)) throw invalid(`sort_by phải là một trong: ${SORT_OPTIONS.join(', ')}.`);

  const limit = body.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw invalid(`limit phải là số nguyên từ 1 đến ${MAX_LIMIT}.`);

  const includeRoute = body.include_route ?? false;
  if (typeof includeRoute !== 'boolean') throw invalid('include_route phải là true hoặc false.');

  return {
    dish,
    normalizedDish: dishText.normalizeDishText(dish),
    maxPrice: body.max_price,
    radiusKm: body.radius_km,
    sortBy,
    limit,
    includeRoute,
    anchor: parseAnchor(body.anchor)
  };
}

module.exports = { parseSearchRequest, SORT_OPTIONS, MAX_RADIUS_KM };
