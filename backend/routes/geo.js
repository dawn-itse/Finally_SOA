const GOONG_BASE = 'https://rsapi.goong.io';
const MAX_DESTINATIONS = 10;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function coordinates(value) {
  const pieces = cleanText(value).split(',').map((part) => part.trim());
  if (pieces.length !== 2 || pieces.some((part) => !part)) return null;
  const [lat, lng] = pieces.map(Number);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? `${lat},${lng}` : null;
}

function send(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function durationAndDistance(value) {
  const distance_m = value?.distance?.value;
  const duration_s = value?.duration?.value;
  if (!Number.isFinite(distance_m) || distance_m < 0 || !Number.isFinite(duration_s) || duration_s < 0) return null;
  return { distance_m, duration_s };
}

function placeDetails(result, requestedId) {
  const latitude = result?.geometry?.location?.lat;
  const longitude = result?.geometry?.location?.lng;
  const address = cleanText(result?.formatted_address);
  if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !coordinates(`${latitude},${longitude}`)) return null;
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
    geocoded_at: new Date().toISOString()
  };
}

async function handleGoong(req, res, url) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Chỉ hỗ trợ GET.' });
  const query = url.searchParams;
  const params = {};
  let endpoint;
  let normalize;

  switch (url.pathname) {
    case '/api/geo/autocomplete': {
      const input = cleanText(query.get('input'));
      if (input.length < 3 || input.length > 200) return send(res, 400, { error: 'Nhập địa chỉ từ 3 đến 200 ký tự.' });
      endpoint = '/v2/place/autocomplete';
      Object.assign(params, { input, limit: '5', more_compound: 'true', has_deprecated_administrative_unit: 'true' });
      if (query.has('location')) {
        params.location = coordinates(query.get('location'));
        if (!params.location) return send(res, 400, { error: 'Tọa độ tìm kiếm không hợp lệ.' });
      }
      if (query.has('radius')) {
        const radius = Number(query.get('radius'));
        if (!params.location || !Number.isFinite(radius) || radius <= 0 || radius > 50) {
          return send(res, 400, { error: 'Cần tọa độ và bán kính hợp lệ trong khoảng trên 0 đến 50 km.' });
        }
        params.radius = String(radius);
      }
      normalize = (payload) => Array.isArray(payload.predictions) ? payload.predictions
        .map((item) => ({ place_id: cleanText(item?.place_id), description: cleanText(item?.description) }))
        .filter((item) => item.place_id && item.description).slice(0, 5) : null;
      break;
    }
    case '/api/geo/place-detail': {
      const placeId = cleanText(query.get('place_id'));
      if (!placeId || placeId.length > 512) return send(res, 400, { error: 'Mã địa điểm không hợp lệ.' });
      endpoint = '/v2/place/detail';
      Object.assign(params, { place_id: placeId, has_deprecated_administrative_unit: 'true' });
      normalize = (payload) => placeDetails(payload.result, placeId);
      break;
    }
    case '/api/geo/reverse': {
      params.latlng = coordinates(query.get('latlng'));
      if (!params.latlng) return send(res, 400, { error: 'Tọa độ không hợp lệ.' });
      endpoint = '/v2/geocode';
      params.limit = '1';
      normalize = (payload) => {
        const address = cleanText(payload.results?.[0]?.formatted_address);
        return address ? { address } : null;
      };
      break;
    }
    case '/api/geo/distance-matrix': {
      const origin = coordinates(query.get('origin'));
      const destinations = cleanText(query.get('destinations')).split('|').map(coordinates);
      if (!origin || destinations.length > MAX_DESTINATIONS || destinations.some((point) => !point)) {
        return send(res, 400, { error: 'Cần một điểm đi và tối đa 10 điểm đến hợp lệ.' });
      }
      endpoint = '/v2/distancematrix';
      Object.assign(params, { origins: origin, destinations: destinations.join('|'), vehicle: 'motorcycle' });
      normalize = (payload) => {
        const elements = payload.rows?.[0]?.elements;
        return Array.isArray(elements) && elements.length === destinations.length
          ? elements.map((cell) => cell?.status === 'OK' ? durationAndDistance(cell) : null)
          : null;
      };
      break;
    }
    case '/api/geo/directions': {
      const origin = coordinates(query.get('origin'));
      const destination = coordinates(query.get('destination'));
      if (!origin || !destination) return send(res, 400, { error: 'Cần một điểm đi và một điểm đến hợp lệ.' });
      endpoint = '/v2/direction';
      Object.assign(params, { origin, destination, vehicle: 'motorcycle' });
      normalize = (payload) => {
        const route = payload.routes?.[0];
        const leg = route?.legs?.[0];
        const metrics = durationAndDistance(leg);
        if (!metrics) return null;
        return {
          ...metrics,
          steps: Array.isArray(leg.steps) ? leg.steps.map((step) => cleanText(step?.html_instructions).replace(/<[^>]*>/g, '')).filter(Boolean) : []
        };
      };
      break;
    }
    default:
      return send(res, 404, { error: 'Không tìm thấy API vị trí.' });
  }

  const key = cleanText(process.env.GOONG_API_KEY);
  if (!key) return send(res, 503, { error: 'Goong chưa được cấu hình.' });
  try {
    const upstream = new URL(endpoint, GOONG_BASE);
    upstream.search = new URLSearchParams({ ...params, api_key: key });
    const response = await fetch(upstream, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.ok) {
      return send(res, response.status === 429 ? 503 : 502, { error: 'Dịch vụ Goong tạm thời không khả dụng.' });
    }
    const payload = await response.json();
    if (payload?.status === 'ZERO_RESULTS' || payload?.status === 'NOT_FOUND') {
      return endpoint.endsWith('/autocomplete') ? send(res, 200, { data: [] }) : send(res, 404, { error: 'Goong chưa tìm được kết quả phù hợp.' });
    }
    const data = payload && (!payload.status || payload.status === 'OK') ? normalize(payload) : null;
    if (data === null) return send(res, 502, { error: 'Goong chưa trả về dữ liệu phù hợp.' });
    return send(res, 200, { data });
  } catch {
    return send(res, 502, { error: 'Chưa kết nối được với Goong. Vui lòng thử lại.' });
  }
}

module.exports = { handleGoong };
