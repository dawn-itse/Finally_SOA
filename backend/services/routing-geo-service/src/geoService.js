/**
 * Các thao tác vị trí/lộ trình: kiểm tra tham số, gọi Goong, và tra cứu địa điểm theo từ khóa + tâm + bán kính
 * cho Restaurant Search. Hàm trả null khi Goong không có kết quả (handler đổi thành 404).
 */
const { ServiceError } = require('./errors');
const { haversineMeters } = require('./geoMath');
const { MAX_DESTINATIONS, cleanText, parseCoordinates, formatPoint, parseRadiusKm } = require('./validation');

const bad = (message) => new ServiceError(400, 'INVALID_REQUEST', message);
const MAX_PLACE_CANDIDATES = 10;

function requiredPoint(value, message) {
  const point = parseCoordinates(value);
  if (!point) throw bad(message);
  return point;
}

function createGeoService({ goong, mapStyleUrl = null }) {
  return {
    async autocomplete(query) {
      const input = cleanText(query.get('input'));
      if (input.length < 3 || input.length > 200) throw bad('Nhập địa chỉ từ 3 đến 200 ký tự.');
      let location;
      let radiusKm;
      if (query.has('location')) location = formatPoint(requiredPoint(query.get('location'), 'Tọa độ tìm kiếm không hợp lệ.'));
      if (query.has('radius')) {
        radiusKm = parseRadiusKm(query.get('radius'));
        if (!location || !radiusKm) throw bad('Cần tọa độ và bán kính hợp lệ trong khoảng trên 0 đến 50 km.');
      }
      return goong.autocomplete({ input, location, radiusKm });
    },

    async placeDetail(query) {
      const placeId = cleanText(query.get('place_id'));
      if (!placeId || placeId.length > 512) throw bad('Mã địa điểm không hợp lệ.');
      return goong.placeDetail(placeId);
    },

    async reverse(query) {
      const point = requiredPoint(query.get('latlng'), 'Tọa độ không hợp lệ.');
      return goong.reverse(formatPoint(point));
    },

    async distanceMatrix(query) {
      const origin = parseCoordinates(query.get('origin'));
      const destinations = cleanText(query.get('destinations')).split('|').map(parseCoordinates);
      if (!origin || destinations.length > MAX_DESTINATIONS || destinations.some((point) => !point)) {
        throw bad(`Cần một điểm đi và tối đa ${MAX_DESTINATIONS} điểm đến hợp lệ.`);
      }
      return goong.distanceMatrix({ origin: formatPoint(origin), destinations: destinations.map(formatPoint) });
    },

    /**
     * Cấu hình bản đồ cho trình duyệt: URL style Goong kèm Map Key (khóa công khai dành cho tải bản đồ, khác GOONG_API_KEY).
     * `style_url` là null khi chưa đặt GOONG_MAPTILES_KEY; frontend dùng bản đồ nền OpenStreetMap thay thế.
     */
    async mapConfig() {
      return { style_url: mapStyleUrl };
    },

    async directions(query) {
      const origin = parseCoordinates(query.get('origin'));
      const destination = parseCoordinates(query.get('destination'));
      if (!origin || !destination) throw bad('Cần một điểm đi và một điểm đến hợp lệ.');
      return goong.directions({ origin: formatPoint(origin), destination: formatPoint(destination) });
    },

    /**
     * Tra cứu địa điểm cho Search Service khi kho nội bộ không có dữ liệu: Autocomplete theo từ khóa quanh tâm,
     * Place Detail cho từng gợi ý, rồi kiểm tra lại bán kính đường chim bay bằng tọa độ Goong trả về.
     * Kết quả theo khoảng cách tăng dần, mỗi phần tử đủ trường để Catalog lưu vào RESTAURANT_LOCATION.
     */
    async searchPlaces(query) {
      const keyword = cleanText(query.get('keyword'));
      if (keyword.length < 2 || keyword.length > 200) throw bad('Từ khóa phải từ 2 đến 200 ký tự.');
      const center = requiredPoint(`${query.get('lat')},${query.get('lng')}`, 'Tọa độ tâm (lat, lng) không hợp lệ.');
      const radiusKm = parseRadiusKm(query.get('radius_km'));
      if (!radiusKm) throw bad('radius_km phải lớn hơn 0 và tối đa 50.');
      let limit = 5;
      if (query.has('limit')) {
        limit = Number(query.get('limit'));
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PLACE_CANDIDATES) throw bad(`limit phải là số nguyên từ 1 đến ${MAX_PLACE_CANDIDATES}.`);
      }

      const predictions = await goong.autocomplete({ input: keyword, location: formatPoint(center), radiusKm });
      const ids = [...new Set(predictions.map((item) => item.place_id))].slice(0, limit);
      const settled = await Promise.allSettled(ids.map((id) => goong.placeDetail(id)));
      const failures = settled.filter((item) => item.status === 'rejected');
      // Mọi Place Detail đều lỗi hạ tầng: báo lỗi để bên gọi không hiểu nhầm là "không có quán nào".
      if (ids.length > 0 && failures.length === ids.length) throw failures[0].reason;

      const radiusM = radiusKm * 1000;
      const seen = new Set();
      const places = [];
      for (const item of settled) {
        const place = item.status === 'fulfilled' ? item.value : null;
        if (!place || seen.has(place.provider_place_id)) continue;
        seen.add(place.provider_place_id);
        const distance_m = Math.round(haversineMeters(center.lat, center.lng, place.latitude, place.longitude));
        if (distance_m > radiusM) continue;
        places.push({ ...place, distance_m });
      }
      places.sort((a, b) => a.distance_m - b.distance_m || a.provider_place_id.localeCompare(b.provider_place_id));
      return {
        center: { latitude: center.lat, longitude: center.lng },
        radius_km: radiusKm,
        places,
        meta: { candidates: ids.length, failed_details: failures.length, outside_radius_or_missing: ids.length - failures.length - places.length }
      };
    }
  };
}

module.exports = { createGeoService };
