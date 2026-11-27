const { randomUUID } = require('node:crypto');
const { haversineMeters } = require('../geoMath');

const TABLES = ['restaurant', 'restaurant_location', 'restaurant_discovery', 'cuisine', 'restaurant_cuisine', 'menu_item', 'price_assertion'];
const SUGGESTABLE = new Set(['PENDING', 'PUBLISHED']);

/**
 * Kho in-memory có cùng hợp đồng với mysqlRepository. Dùng cho server preview không có MySQL và cho test.
 * seed có các bảng theo ERD (restaurant, restaurant_location, ...). Dữ liệu mất khi tắt service.
 * normalizeText dùng để tính name_normalized cho món chưa có cột này.
 */
function createMemoryRepository(seed = {}, { normalizeText, now = () => new Date() } = {}) {
  const db = Object.fromEntries(TABLES.map((table) => [table, structuredClone(seed[table] ?? [])]));
  if (normalizeText) {
    for (const item of db.menu_item) item.name_normalized ??= normalizeText(item.name);
  }

  const restaurantById = (id) => db.restaurant.find((row) => row.restaurant_id === id);

  /** Chi nhánh gần nhất trong bán kính cho mỗi quán; hòa khoảng cách thì ưu tiên is_primary rồi location_id. */
  function nearestBranches(restaurantIds, center, radiusM) {
    const best = new Map();
    for (const location of db.restaurant_location) {
      if (!restaurantIds.has(location.restaurant_id)) continue;
      const distance = haversineMeters(center.latitude, center.longitude, Number(location.latitude), Number(location.longitude));
      if (distance > radiusM) continue;
      const current = best.get(location.restaurant_id);
      const better = !current || distance < current.distance_m ||
        (distance === current.distance_m && (Number(Boolean(location.is_primary)) > Number(Boolean(current.location.is_primary)) ||
          (Boolean(location.is_primary) === Boolean(current.location.is_primary) && location.location_id < current.location.location_id)));
      if (better) best.set(location.restaurant_id, { location, distance_m: distance });
    }
    return best;
  }

  function currentPrice(menuItemId) {
    return db.price_assertion.find((row) => row.menu_item_id === menuItemId && row.is_current);
  }

  const publicBranch = (location) => ({
    location_id: location.location_id,
    address_text: location.address_text,
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    commune: location.commune ?? null,
    province: location.province ?? null
  });

  // ---------- Giao dịch cho API nội bộ ----------
  // Chạy tuần tự qua một hàng đợi; lỗi thì khôi phục toàn bộ bảng về trạng thái trước giao dịch.
  let queue = Promise.resolve();
  const time = (value) => (value ? new Date(value).getTime() : 0);
  const copy = (row) => (row ? { ...row } : null);

  function createTx() {
    return {
      async getRestaurant(id) {
        return copy(restaurantById(id));
      },
      async listRestaurants({ status, q, limit, offset }) {
        const needle = q?.toLowerCase();
        const rows = db.restaurant
          .filter((row) => (!status || row.visibility_status === status) && (!needle || row.name.toLowerCase().includes(needle)))
          .sort((a, b) => time(b.created_at) - time(a.created_at) || a.restaurant_id.localeCompare(b.restaurant_id));
        return { total: rows.length, rows: rows.slice(offset, offset + limit).map(copy) };
      },
      async findRestaurantBySource(sourceType, sourceRef) {
        return copy(db.restaurant.find((row) => row.source_type === sourceType && row.source_ref === sourceRef));
      },
      async insertRestaurant(row) {
        db.restaurant.push({ ...row });
      },
      async updateRestaurant(id, fields) {
        Object.assign(restaurantById(id), definedOnly(fields));
      },

      async listLocations(restaurantIds) {
        const ids = new Set(restaurantIds);
        return db.restaurant_location
          .filter((row) => ids.has(row.restaurant_id))
          .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) || a.location_id.localeCompare(b.location_id))
          .map(copy);
      },
      async getLocation(id) {
        return copy(db.restaurant_location.find((row) => row.location_id === id));
      },
      async findLocationByProvider(provider, placeId) {
        return copy(db.restaurant_location.find((row) => row.provider === provider && row.provider_place_id === placeId));
      },
      async insertLocation(row) {
        db.restaurant_location.push({ ...row });
      },
      async updateLocation(id, fields) {
        Object.assign(db.restaurant_location.find((row) => row.location_id === id), definedOnly(fields));
      },

      async getCuisineNames(restaurantId) {
        const ids = new Set(db.restaurant_cuisine.filter((row) => row.restaurant_id === restaurantId).map((row) => row.cuisine_id));
        return db.cuisine.filter((row) => ids.has(row.cuisine_id)).map((row) => row.name);
      },
      async setCuisines(restaurantId, names, newId) {
        db.restaurant_cuisine = db.restaurant_cuisine.filter((row) => row.restaurant_id !== restaurantId);
        for (const name of names) {
          let cuisine = db.cuisine.find((row) => row.name.toLowerCase() === name.toLowerCase());
          if (!cuisine) {
            cuisine = { cuisine_id: newId(), name };
            db.cuisine.push(cuisine);
          }
          db.restaurant_cuisine.push({ restaurant_id: restaurantId, cuisine_id: cuisine.cuisine_id });
        }
      },

      async listMenuItems(restaurantId) {
        return db.menu_item
          .filter((row) => row.restaurant_id === restaurantId)
          .sort((a, b) => a.name_normalized.localeCompare(b.name_normalized) || a.menu_item_id.localeCompare(b.menu_item_id))
          .map(copy);
      },
      async getMenuItem(id) {
        return copy(db.menu_item.find((row) => row.menu_item_id === id));
      },
      async findActiveItemsByName(restaurantId, normalized) {
        return db.menu_item.filter((row) => row.restaurant_id === restaurantId && row.status === 'ACTIVE' && row.name_normalized === normalized).map(copy);
      },
      async insertMenuItem(row) {
        db.menu_item.push({ ...row });
      },
      async updateMenuItem(id, fields) {
        Object.assign(db.menu_item.find((row) => row.menu_item_id === id), definedOnly(fields));
      },

      async listCurrentAssertions(restaurantId) {
        const itemIds = new Set(db.menu_item.filter((row) => row.restaurant_id === restaurantId).map((row) => row.menu_item_id));
        return db.price_assertion.filter((row) => row.is_current && itemIds.has(row.menu_item_id)).map(copy);
      },
      async getCurrentAssertion(menuItemId) {
        return copy(db.price_assertion.find((row) => row.menu_item_id === menuItemId && row.is_current));
      },
      async getAssertion(id) {
        return copy(db.price_assertion.find((row) => row.price_assertion_id === id));
      },
      async listAssertions(menuItemId) {
        // Dòng thêm sau nằm cuối mảng nên đảo ngược để mới nhất trước khi created_at bằng nhau.
        return db.price_assertion
          .filter((row) => row.menu_item_id === menuItemId)
          .reverse()
          .sort((a, b) => time(b.created_at) - time(a.created_at))
          .map(copy);
      },
      async findAssertionBySource(menuItemId, sourceType, sourceReference) {
        return copy(db.price_assertion.find((row) => row.menu_item_id === menuItemId && row.source_type === sourceType && row.source_reference === sourceReference));
      },
      async deactivateCurrentAssertion(menuItemId) {
        let count = 0;
        for (const row of db.price_assertion) {
          if (row.menu_item_id === menuItemId && row.is_current) {
            row.is_current = false;
            count += 1;
          }
        }
        return count;
      },
      async insertAssertion(row) {
        db.price_assertion.push({ ...row });
      }
    };
  }

  async function transaction(fn) {
    const run = queue.then(async () => {
      const backup = structuredClone(db);
      try {
        return await fn(createTx());
      } catch (error) {
        for (const table of TABLES) db[table] = backup[table];
        throw error;
      }
    });
    queue = run.catch(() => {});
    return run;
  }

  return {
    transaction,

    async searchCatalog({ keyword, maxPrice, center, radiusM }) {
      const needle = ` ${keyword} `;
      // Điều kiện tên và giá áp dụng trên cùng một món.
      const itemsByRestaurant = new Map();
      for (const item of db.menu_item) {
        if (item.status !== 'ACTIVE' || !` ${item.name_normalized} `.includes(needle)) continue;
        const price = currentPrice(item.menu_item_id);
        if (!price || Number(price.min_price) > maxPrice) continue;
        const list = itemsByRestaurant.get(item.restaurant_id) ?? [];
        list.push({
          menu_item_id: item.menu_item_id,
          name: item.name,
          description: item.description ?? null,
          min_price: Number(price.min_price),
          max_price: Number(price.max_price),
          price_updated_at: toIso(price.created_at)
        });
        itemsByRestaurant.set(item.restaurant_id, list);
      }

      const published = new Set(db.restaurant
        .filter((row) => row.visibility_status === 'PUBLISHED' && itemsByRestaurant.has(row.restaurant_id))
        .map((row) => row.restaurant_id));
      const branches = nearestBranches(published, center, radiusM);

      return [...branches.entries()].map(([restaurantId, { location, distance_m }]) => {
        const restaurant = restaurantById(restaurantId);
        const cuisineIds = new Set(db.restaurant_cuisine.filter((row) => row.restaurant_id === restaurantId).map((row) => row.cuisine_id));
        return {
          restaurant: {
            restaurant_id: restaurantId,
            name: restaurant.name,
            description: restaurant.description ?? null,
            phone: restaurant.phone ?? null,
            verified_at: toIso(restaurant.verified_at)
          },
          location: publicBranch(location),
          distance_m,
          cuisines: db.cuisine.filter((row) => cuisineIds.has(row.cuisine_id)).map((row) => row.name).sort(),
          items: itemsByRestaurant.get(restaurantId).sort((a, b) => a.min_price - b.min_price || a.max_price - b.max_price || a.name.localeCompare(b.name))
        };
      }).sort((a, b) => a.distance_m - b.distance_m);
    },

    async findDiscoverySuggestions({ keyword, center, radiusM }) {
      // Chỉ xét chi nhánh GOONG đã liên kết với từ khóa; mỗi quán lấy chi nhánh gần nhất trong bán kính.
      const best = new Map();
      for (const discovery of db.restaurant_discovery) {
        if (discovery.dish_keyword !== keyword) continue;
        const location = db.restaurant_location.find((row) => row.location_id === discovery.location_id);
        const restaurant = location && restaurantById(location.restaurant_id);
        if (location?.provider !== 'GOONG' || !restaurant || !SUGGESTABLE.has(restaurant.visibility_status)) continue;

        const distance = haversineMeters(center.latitude, center.longitude, Number(location.latitude), Number(location.longitude));
        if (distance > radiusM) continue;
        const current = best.get(restaurant.restaurant_id);
        if (!current || distance < current.distance_m || (distance === current.distance_m && location.location_id < current.location.location_id)) {
          best.set(restaurant.restaurant_id, { location, distance_m: distance });
        }
      }
      return [...best.entries()]
        .map(([restaurantId, { location, distance_m }]) => ({
          restaurant_id: restaurantId,
          name: restaurantById(restaurantId).name,
          location: publicBranch(location),
          distance_m
        }))
        .sort((a, b) => a.distance_m - b.distance_m);
    },

    async saveDiscoveredPlaces({ keyword, places }) {
      const timestamp = now().toISOString();
      let saved = 0;
      for (const place of places) {
        let location = db.restaurant_location.find((row) => row.provider === 'GOONG' && row.provider_place_id === place.provider_place_id);
        if (location) {
          // Dùng lại restaurant_id hiện có, giữ nguyên kiểm duyệt, menu và giá.
          // Chỉ quán PENDING mới được ghi vào discovery. PUBLISHED đã thuộc catalog nên bỏ qua;
          // REJECTED/SUSPENDED/CLOSED không gợi ý lại.
          if (restaurantById(location.restaurant_id)?.visibility_status !== 'PENDING') continue;
        } else {
          const restaurantId = randomUUID();
          db.restaurant.push({
            restaurant_id: restaurantId,
            name: place.name,
            description: null,
            phone: null,
            visibility_status: 'PENDING',
            verified_at: null,
            verified_by: null,
            source_type: 'GOONG_DISCOVERY',
            source_ref: place.provider_place_id,
            created_at: timestamp,
            updated_at: timestamp
          });
          location = {
            location_id: randomUUID(),
            restaurant_id: restaurantId,
            address_text: place.address_text,
            latitude: place.latitude,
            longitude: place.longitude,
            provider: 'GOONG',
            provider_place_id: place.provider_place_id,
            commune: place.commune ?? null,
            province: place.province ?? null,
            deprecated_address_text: place.deprecated_address_text ?? null,
            geocoded_at: place.geocoded_at ?? timestamp,
            is_primary: true
          };
          db.restaurant_location.push(location);
        }
        if (!db.restaurant_discovery.some((row) => row.location_id === location.location_id && row.dish_keyword === keyword)) {
          db.restaurant_discovery.push({ location_id: location.location_id, dish_keyword: keyword, discovered_at: timestamp });
        }
        saved += 1;
      }
      return saved;
    },

    async ping() {
      return true;
    },

    async close() {},

    /** Chỉ để test: đọc bảng hiện có. */
    _table(name) {
      return db[name];
    }
  };
}

function definedOnly(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

module.exports = { createMemoryRepository };
