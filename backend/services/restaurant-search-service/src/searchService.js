const { ServiceError } = require('./errors');
const { haversineMeters, roundKm } = require('./geoMath');

const UNCONFIRMED_LABEL = 'Chưa xác nhận món và giá';
const MAX_GEO_CANDIDATES = 5;
// Tổng số quán trả về cho khách (catalog + gợi ý). Thiếu thì quét Goong bù, vẫn thiếu thì trả ít hơn.
const MAX_TOTAL_RESULTS = 3;
const MAX_ROUTE_DESTINATIONS = 10;

const FOOD_TYPES = /^(restaurant|food|cafe|bakery|meal_takeaway|meal_delivery)$/;
const ADDRESS_TYPES = /^(house_number|street|route|administrative_area(?:_level_\d+)?)$/;

/**
 * Điều phối luồng tìm quán (docs/SOA_ARCHITECTURE.md mục 4):
 *   1. Catalog: quán PUBLISHED có món khớp tên, giá hiện hành <= max_price, trong bán kính.
 *   2. Tối đa MAX_TOTAL_RESULTS (3) quán cho mỗi lượt tìm. Catalog đủ 3 thì trả ngay.
 *   3. Chưa đủ thì lấy thêm gợi ý đã lưu (RESTAURANT_DISCOVERY), bỏ quán đã có trong catalog.
 *   4. Vẫn chưa đủ mới gọi Geo Service (Goong), lưu kết quả PENDING rồi đọc lại để bù cho đủ 3.
 *      Goong lỗi hoặc không có thêm thì trả số quán đang có (có thể 0, 1 hoặc 2).
 */
function createSearchService({ repository, geoClient, reviewClient = null, dishText, logger = console }) {
  const inflightDiscoveries = new Map();

  async function resolveCenter(anchor) {
    if (anchor.source === 'GPS') return { latitude: anchor.lat, longitude: anchor.lng, source: 'GPS' };

    let area;
    try {
      area = await geoClient.getArea(anchor.area_id);
    } catch (error) {
      logger.error?.(`[restaurant-search] Geo Service không trả được khu vực: ${error.message}`);
      throw new ServiceError(503, 'GEO_UNAVAILABLE', 'Chưa lấy được điểm mốc tìm kiếm. Vui lòng thử lại.');
    }
    const latitude = Number(area?.latitude);
    const longitude = Number(area?.longitude);
    if (!area || area.is_active === false || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new ServiceError(404, 'AREA_NOT_FOUND', 'Không tìm thấy khu vực tìm kiếm đang hoạt động.');
    }
    return { latitude, longitude, source: 'AREA', area_id: anchor.area_id };
  }

  // ---------- Catalog ----------

  function formatCatalogResult(row, maxPrice, ratings) {
    const [cheapest] = row.items; // repository đã sắp theo giá thấp nhất
    const stats = ratings.get(row.restaurant.restaurant_id);
    const verified = Boolean(row.restaurant.verified_at);
    return {
      restaurant_id: row.restaurant.restaurant_id,
      name: row.restaurant.name,
      description: row.restaurant.description ?? null,
      phone: row.restaurant.phone ?? null,
      cuisines: row.cuisines,
      // Nhãn thuộc về quán (gồm cả giá). Không trả verified_by (tên Admin) cho khách.
      verified,
      verified_at: row.restaurant.verified_at ?? null,
      verification_label: verified ? 'Đã xác minh' : 'Chưa xác minh',
      location: publicLocation(row.location),
      distance_m: Math.round(row.distance_m),
      distance_km: roundKm(row.distance_m),
      distance_basis: 'STRAIGHT_LINE',
      route: null,
      starting_price: cheapest.min_price,
      starting_max_price: cheapest.max_price,
      leftover: maxPrice - cheapest.min_price,
      matched_items: row.items.map((item) => ({
        menu_item_id: item.menu_item_id,
        name: item.name,
        description: item.description ?? null,
        min_price: item.min_price,
        max_price: item.max_price,
        price_updated_at: item.price_updated_at
      })),
      rating: stats?.rating ?? null,
      review_count: stats?.reviewCount ?? null
    };
  }

  function compareBy(sortBy) {
    const byDistance = (a, b) => a.distance_m - b.distance_m;
    const byRating = (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.review_count ?? 0) - (a.review_count ?? 0);
    switch (sortBy) {
      case 'distance':
        return byDistance;
      case 'rating':
        return (a, b) => byRating(a, b) || byDistance(a, b);
      case 'price':
        return (a, b) => a.starting_price - b.starting_price || a.starting_max_price - b.starting_max_price || byDistance(a, b);
      default: // recommended: quán đã xác minh trước, rồi điểm đánh giá, rồi khoảng cách
        return (a, b) => Number(b.verified) - Number(a.verified) || byRating(a, b) || byDistance(a, b);
    }
  }

  async function searchCatalog(request, center, radiusM, cap) {
    const rows = await repository.searchCatalog({
      keyword: request.normalizedDish,
      maxPrice: request.maxPrice,
      center,
      radiusM
    });
    if (rows.length === 0) return null;

    const needsRatings = request.sortBy === 'rating' || request.sortBy === 'recommended';
    let ratings = new Map();
    if (reviewClient && needsRatings) {
      ratings = await reviewClient.getRatingStats(rows.map((row) => row.restaurant.restaurant_id));
    }

    const all = rows.map((row) => formatCatalogResult(row, request.maxPrice, ratings)).sort(compareBy(request.sortBy));
    const results = all.slice(0, cap);

    if (reviewClient && !needsRatings) {
      ratings = await reviewClient.getRatingStats(results.map((item) => item.restaurant_id));
      for (const item of results) {
        const stats = ratings.get(item.restaurant_id);
        item.rating = stats?.rating ?? null;
        item.review_count = stats?.reviewCount ?? null;
      }
    }
    if (request.includeRoute) await attachRoutes(results, center);
    return { results, totalMatched: all.length };
  }

  // Quãng đường theo tuyến xe máy (Goong Distance Matrix). Lỗi thì giữ số đo đường chim bay.
  async function attachRoutes(items, center) {
    const targets = items.slice(0, MAX_ROUTE_DESTINATIONS);
    if (targets.length === 0) return;
    try {
      const cells = await geoClient.distanceMatrix({
        origin: center,
        destinations: targets.map((item) => item.location)
      });
      if (!Array.isArray(cells) || cells.length !== targets.length) return;
      targets.forEach((item, index) => {
        const cell = cells[index];
        if (cell) {
          item.route = { distance_m: cell.distance_m, duration_s: cell.duration_s, mode: 'MOTORBIKE', source: 'GOONG' };
        }
      });
    } catch (error) {
      logger.warn?.(`[restaurant-search] Không lấy được quãng đường theo tuyến: ${error.message}`);
    }
  }

  // ---------- Gợi ý địa điểm (RESTAURANT_DISCOVERY + Goong) ----------

  function formatSuggestion(row) {
    return {
      restaurant_id: row.restaurant_id,
      name: row.name,
      location: publicLocation(row.location),
      distance_m: Math.round(row.distance_m),
      distance_km: roundKm(row.distance_m),
      distance_basis: 'STRAIGHT_LINE',
      route: null,
      source: 'GOONG',
      verified: false,
      verification_label: UNCONFIRMED_LABEL
    };
  }

  function looksLikeFoodPlace(place, keyword) {
    const types = Array.isArray(place.types) ? place.types : [];
    if (types.some((type) => FOOD_TYPES.test(type))) return true;
    if (types.some((type) => ADDRESS_TYPES.test(type))) return false;
    const name = dishText.normalizeDishText(place.name);
    return name !== dishText.normalizeDishText(place.address_text) &&
      (` ${name} `.includes(` ${keyword} `) || /\b(quan|nha hang|tiem an)\b/.test(name));
  }

  function isStorablePlace(place) {
    return place?.provider === 'GOONG' &&
      typeof place.provider_place_id === 'string' && place.provider_place_id.length > 0 && place.provider_place_id.length <= 512 &&
      typeof place.name === 'string' && place.name.trim().length > 0 && place.name.trim().length <= 200 &&
      typeof place.address_text === 'string' && place.address_text.length > 0 && place.address_text.length <= 500 &&
      Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90 &&
      Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180;
  }

  async function discoverViaGeo(request, center, radiusM) {
    let predictions;
    try {
      predictions = await geoClient.autocomplete({
        input: `quán ${request.dish}`,
        center,
        radiusKm: request.radiusKm
      });
    } catch (error) {
      logger.warn?.(`[restaurant-search] Goong Autocomplete lỗi: ${error.message}`);
      return [];
    }

    const details = await Promise.allSettled(
      predictions.slice(0, MAX_GEO_CANDIDATES).map((item) => geoClient.placeDetail(item.place_id))
    );
    const seen = new Set();
    const places = [];
    for (const detail of details) {
      const place = detail.status === 'fulfilled' ? detail.value : null;
      if (!isStorablePlace(place) || seen.has(place.provider_place_id)) continue;
      seen.add(place.provider_place_id);
      // Kiểm tra lại bán kính bằng tọa độ Goong trả về (đường chim bay).
      if (haversineMeters(center.latitude, center.longitude, place.latitude, place.longitude) > radiusM) continue;
      if (!looksLikeFoodPlace(place, request.normalizedDish)) continue;
      places.push({ ...place, name: place.name.trim() });
    }

    // Lỗi MySQL ở đây được ném ra cho client (500), không nuốt như lỗi Goong.
    if (places.length > 0) await repository.saveDiscoveredPlaces({ keyword: request.normalizedDish, places });
    return places.length > 0 ? repository.findDiscoverySuggestions({ keyword: request.normalizedDish, center, radiusM }) : [];
  }

  // Hai request giống nhau cùng lúc chỉ gọi Goong một lần.
  function discoverOnce(request, center, radiusM) {
    const key = [request.normalizedDish, center.latitude.toFixed(3), center.longitude.toFixed(3), request.radiusKm].join('|');
    let pending = inflightDiscoveries.get(key);
    if (!pending) {
      pending = discoverViaGeo(request, center, radiusM).finally(() => inflightDiscoveries.delete(key));
      inflightDiscoveries.set(key, pending);
    }
    return pending;
  }

  // ---------- API ----------

  async function search(request) {
    const center = await resolveCenter(request.anchor);
    const radiusM = request.radiusKm * 1000;
    const meta = {
      anchor: { source: center.source, latitude: center.latitude, longitude: center.longitude, ...(center.area_id && { area_id: center.area_id }) },
      radius_km: request.radiusKm,
      max_price: request.maxPrice,
      sort_by: request.sortBy
    };

    // Tổng số quán trả về không vượt MAX_TOTAL_RESULTS, và không vượt limit khách yêu cầu.
    const cap = Math.min(request.limit, MAX_TOTAL_RESULTS);

    const catalog = await searchCatalog(request, center, radiusM, cap);
    const results = catalog?.results ?? [];
    const totalMatched = catalog?.totalMatched ?? 0;
    const room = cap - results.length;

    let suggestionRows = [];
    let geoAdded = false;
    if (room > 0) {
      // Quán đã nằm trong kết quả catalog thì không lặp lại ở gợi ý.
      const inCatalog = new Set(results.map((item) => item.restaurant_id));
      const withoutCatalog = (rows) => rows.filter((row) => !inCatalog.has(row.restaurant_id));

      suggestionRows = withoutCatalog(await repository.findDiscoverySuggestions({ keyword: request.normalizedDish, center, radiusM }));
      if (suggestionRows.length < room) {
        // Chưa đủ: quét Goong tìm thêm. discoverOnce đọc lại toàn bộ gợi ý sau khi lưu nên là tập mở rộng của danh sách cũ.
        const expanded = withoutCatalog(await discoverOnce(request, center, radiusM));
        if (expanded.length > suggestionRows.length) {
          suggestionRows = expanded;
          geoAdded = true;
        }
      }
    }

    const suggestions = suggestionRows.slice(0, room > 0 ? room : 0).map(formatSuggestion);
    if (request.includeRoute) await attachRoutes(suggestions, center);

    let source = 'NONE';
    if (results.length > 0) source = 'CATALOG';
    else if (suggestions.length > 0) source = geoAdded ? 'GEO' : 'DISCOVERY';
    return { source, results, suggestions, meta: { ...meta, total_matched: totalMatched } };
  }

  return { search };
}

function publicLocation(location) {
  return {
    location_id: location.location_id,
    address_text: location.address_text,
    latitude: location.latitude,
    longitude: location.longitude,
    commune: location.commune ?? null,
    province: location.province ?? null
  };
}

module.exports = { createSearchService, UNCONFIRMED_LABEL };
