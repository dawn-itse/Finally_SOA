/**
 * Client gọi Routing & Geo Service.
 *
 * Hợp đồng /api/geo/* do routing-geo-service cung cấp (cùng hợp đồng với proxy Goong của bản preview):
 *   thành công  -> 200 { data }
 *   không có    -> 404 { error }  (autocomplete trống trả 200 { data: [] })
 *   lỗi         -> 5xx { error }
 * Mặc định trỏ vào server preview (đã gắn routing-geo-service). Chạy riêng service 4004 thì đặt GEO_SERVICE_URL=http://localhost:4004.
 *
 * getArea (GET /api/v1/geo/areas/:id) do routing-geo-service cài đặt cho SEARCH_AREA:
 *   200 { success: true, data: { area_id, name, ..., latitude, longitude, is_active } }, 404 khi không có.
 */
const TIMEOUT_MS = 5000;

function createGeoClient({ baseUrl, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  const root = baseUrl.replace(/\/+$/, '');

  async function getJson(path, params = {}) {
    const url = new URL(path, `${root}/`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error'
    });
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Geo Service trả về ${response.status}`);
    }
    return response.json();
  }

  const point = ({ latitude, longitude }) => `${latitude},${longitude}`;

  return {
    /** Tối đa 5 gợi ý { place_id, description }. */
    async autocomplete({ input, center, radiusKm }) {
      const payload = await getJson('api/geo/autocomplete', {
        input, location: point(center), radius: radiusKm
      });
      return Array.isArray(payload?.data) ? payload.data : [];
    },

    /** Trả chi tiết địa điểm đã chuẩn hóa hoặc null nếu Goong không có. */
    async placeDetail(placeId) {
      const payload = await getJson('api/geo/place-detail', { place_id: placeId });
      return payload?.data ?? null;
    },

    /** Quãng đường xe máy từ origin tới tối đa 10 điểm; phần tử null nếu không có tuyến. */
    async distanceMatrix({ origin, destinations }) {
      const payload = await getJson('api/geo/distance-matrix', {
        origin: point(origin),
        destinations: destinations.map(point).join('|')
      });
      return Array.isArray(payload?.data) ? payload.data : null;
    },

    /** Điểm mốc của khu vực tìm kiếm; null nếu không tồn tại. */
    async getArea(areaId) {
      const payload = await getJson(`api/v1/geo/areas/${encodeURIComponent(areaId)}`);
      return payload?.data ?? null;
    }
  };
}

module.exports = { createGeoClient };
