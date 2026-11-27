const { loadDishText } = require('../src/dishText');
const { createMemoryRepository } = require('../src/repositories/memoryRepository');
const { createSearchService } = require('../src/searchService');
const { parseSearchRequest } = require('../src/validation');

const silentLogger = { log() {}, warn() {}, error() {} };

// Gốc tìm kiếm: Lê Văn Lương, Hà Nội (cùng mốc với frontend mock)
const CENTER = { lat: 21.0048, lng: 105.8042 };

const iso = '2024-01-01T00:00:00.000Z';
let counter = 0;
const id = (prefix) => `${prefix}-${String(++counter).padStart(4, '0')}`;

/** Dựng nhanh một quán trong seed: restaurant + chi nhánh + món có giá hiện hành. */
function addRestaurant(seed, { name, status = 'PUBLISHED', verified = false, branches, items = [] }) {
  const restaurantId = id('rest');
  seed.restaurant.push({
    restaurant_id: restaurantId, name, description: null, phone: null, visibility_status: status,
    verified_at: verified ? iso : null, verified_by: verified ? 'admin-1' : null,
    source_type: 'TEST', source_ref: null, created_at: iso, updated_at: iso
  });
  branches.forEach(([latitude, longitude, isPrimary = false], index) => {
    seed.restaurant_location.push({
      location_id: id('loc'), restaurant_id: restaurantId, address_text: `${name} chi nhánh ${index + 1}`,
      latitude, longitude, provider: 'MANUAL', provider_place_id: null, is_primary: isPrimary
    });
  });
  for (const [itemName, min, max = min, extra = {}] of items) {
    const menuItemId = id('item');
    seed.menu_item.push({ menu_item_id: menuItemId, restaurant_id: restaurantId, name: itemName, status: extra.status ?? 'ACTIVE', created_at: iso, updated_at: iso });
    seed.price_assertion.push({
      price_assertion_id: id('price'), menu_item_id: menuItemId, min_price: min, max_price: max, currency: 'VND',
      is_current: extra.current ?? true, source_type: 'TEST', created_at: iso
    });
  }
  return restaurantId;
}

const emptySeed = () => ({ restaurant: [], restaurant_location: [], restaurant_discovery: [], cuisine: [], restaurant_cuisine: [], menu_item: [], price_assertion: [] });

/** Geo Service giả: ghi lại số lần gọi để kiểm tra việc tái sử dụng dữ liệu đã lưu. */
function fakeGeo({ places = [], areas = {}, failAutocomplete = false, matrix = null } = {}) {
  const calls = { autocomplete: 0, placeDetail: 0, distanceMatrix: 0, getArea: 0 };
  return {
    calls,
    async autocomplete() {
      calls.autocomplete += 1;
      if (failAutocomplete) throw new Error('Goong down');
      return places.map((place) => ({ place_id: place.provider_place_id, description: place.address_text }));
    },
    async placeDetail(placeId) {
      calls.placeDetail += 1;
      return places.find((place) => place.provider_place_id === placeId) ?? null;
    },
    async distanceMatrix({ destinations }) {
      calls.distanceMatrix += 1;
      return matrix ? matrix(destinations) : null;
    },
    async getArea(areaId) {
      calls.getArea += 1;
      return areas[areaId] ?? null;
    }
  };
}

const goongPlace = (overrides = {}) => ({
  provider: 'GOONG',
  provider_place_id: 'goong-place-1',
  name: 'Quán Bún Bò Huế Cô Ba',
  types: ['restaurant'],
  address_text: '10 Lê Văn Lương, Hà Nội',
  latitude: 21.0055,
  longitude: 105.8051,
  commune: 'Nhân Chính',
  province: 'Hà Nội',
  deprecated_address_text: null,
  geocoded_at: '2026-11-27T01:00:00.000Z',
  ...overrides
});

async function setup({ seed = emptySeed(), geo = fakeGeo(), reviewClient = null } = {}) {
  const dishText = await loadDishText();
  const repository = createMemoryRepository(seed, { normalizeText: dishText.normalizeDishText });
  const service = createSearchService({ repository, geoClient: geo, reviewClient, dishText, logger: silentLogger });
  const run = (body) => service.search(parseSearchRequest({
    dish: 'phở bò', max_price: 50000, radius_km: 3, anchor: { source: 'GPS', lat: CENTER.lat, lng: CENTER.lng }, ...body
  }, dishText));
  return { dishText, repository, service, run, geo };
}

module.exports = { setup, emptySeed, addRestaurant, fakeGeo, goongPlace, silentLogger, CENTER };
