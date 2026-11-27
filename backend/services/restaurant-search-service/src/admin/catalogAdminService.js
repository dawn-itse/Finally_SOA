const { randomUUID } = require('node:crypto');
const { ServiceError } = require('../errors');
const validation = require('./adminValidation');

const iso = (value) => (value ? new Date(value).toISOString() : null);
const notFound = (code, message) => new ServiceError(404, code, message);

const restaurantView = (row) => ({
  restaurant_id: row.restaurant_id,
  name: row.name,
  description: row.description ?? null,
  phone: row.phone ?? null,
  visibility_status: row.visibility_status,
  verified: Boolean(row.verified_at),
  verified_at: iso(row.verified_at),
  verified_by: row.verified_by ?? null, // chỉ dành cho service nội bộ, không trả cho khách
  source_type: row.source_type,
  source_ref: row.source_ref ?? null,
  created_at: iso(row.created_at),
  updated_at: iso(row.updated_at)
});

const locationView = (row) => ({
  location_id: row.location_id,
  address_text: row.address_text,
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  provider: row.provider,
  provider_place_id: row.provider_place_id ?? null,
  commune: row.commune ?? null,
  province: row.province ?? null,
  deprecated_address_text: row.deprecated_address_text ?? null,
  geocoded_at: iso(row.geocoded_at),
  is_primary: Boolean(row.is_primary)
});

const assertionView = (row) => ({
  price_assertion_id: row.price_assertion_id,
  menu_item_id: row.menu_item_id,
  min_price: Number(row.min_price),
  max_price: Number(row.max_price),
  currency: row.currency ?? 'VND',
  is_current: Boolean(row.is_current),
  source_type: row.source_type,
  source_reference: row.source_reference ?? null,
  created_at: iso(row.created_at)
});

const menuItemView = (row, assertion) => ({
  menu_item_id: row.menu_item_id,
  restaurant_id: row.restaurant_id,
  name: row.name,
  description: row.description ?? null,
  status: row.status,
  // Món không có dòng is_current = 1 thì NO_PRICE (docs/ERD.md mục 2).
  price_status: assertion ? 'CURRENT' : 'NO_PRICE',
  current_price: assertion ? assertionView(assertion) : null,
  created_at: iso(row.created_at),
  updated_at: iso(row.updated_at)
});

const restaurantSummary = (row) => ({
  restaurant_id: row.restaurant_id,
  visibility_status: row.visibility_status,
  verified: Boolean(row.verified_at),
  verified_at: iso(row.verified_at),
  verified_by: row.verified_by ?? null
});

/**
 * API nội bộ của Catalog dành cho feedback-review-service (4005) và trang Admin.
 * Mọi thao tác ghi chạy trong một giao dịch, khóa dòng quán trước rồi mới khóa món (thứ tự cố định để không deadlock),
 * làm mới RESTAURANT.verified_at/verified_by khi là thay đổi do Admin duyệt (docs/ERD.md mục 2).
 * AUDIT_EVENT thuộc service 4005: phản hồi luôn có before/after để bên gọi tự ghi.
 */
function createCatalogAdminService({ repository, dishText, now = () => new Date(), newId = randomUUID }) {
  const normalize = (name) => {
    const normalized = dishText.normalizeDishText(name);
    if (!normalized) throw new ServiceError(422, 'INVALID_NAME', 'Tên món không hợp lệ sau khi chuẩn hóa.');
    return normalized;
  };

  const verification = (actedBy, timestamp) => ({ verified_at: timestamp, verified_by: actedBy, updated_at: timestamp });

  async function lockRestaurant(tx, restaurantId) {
    const row = await tx.getRestaurant(restaurantId, { lock: true });
    if (!row) throw notFound('RESTAURANT_NOT_FOUND', 'Không tìm thấy quán.');
    return row;
  }

  /** Khóa quán rồi khóa món của quán đó. */
  async function lockItem(tx, menuItemId) {
    const unlocked = await tx.getMenuItem(menuItemId);
    if (!unlocked) throw notFound('MENU_ITEM_NOT_FOUND', 'Không tìm thấy món.');
    const restaurant = await lockRestaurant(tx, unlocked.restaurant_id);
    const item = await tx.getMenuItem(menuItemId, { lock: true });
    if (!item) throw notFound('MENU_ITEM_NOT_FOUND', 'Không tìm thấy món.');
    return { item, restaurant };
  }

  async function restaurantDetail(tx, row) {
    const [locations, cuisines, items, prices] = await Promise.all([
      tx.listLocations([row.restaurant_id]),
      tx.getCuisineNames(row.restaurant_id),
      tx.listMenuItems(row.restaurant_id),
      tx.listCurrentAssertions(row.restaurant_id)
    ]);
    const priceByItem = new Map(prices.map((price) => [price.menu_item_id, price]));
    return {
      ...restaurantView(row),
      cuisines: [...cuisines].sort((a, b) => a.localeCompare(b)),
      locations: locations.map(locationView),
      menu_items: items.map((item) => menuItemView(item, priceByItem.get(item.menu_item_id)))
    };
  }

  const detailById = async (tx, restaurantId) => restaurantDetail(tx, await tx.getRestaurant(restaurantId));

  async function assertNoDuplicateName(tx, restaurantId, normalized, exceptItemId = null) {
    const same = (await tx.findActiveItemsByName(restaurantId, normalized)).filter((row) => row.menu_item_id !== exceptItemId);
    if (same.length > 0) {
      throw new ServiceError(409, 'DUPLICATE_MENU_ITEM', 'Quán đã có món đang bán trùng tên.', { menu_item_id: same[0].menu_item_id });
    }
  }

  async function assertLocationFree(tx, fields, exceptLocationId = null) {
    if (!fields.provider_place_id) return;
    const existing = await tx.findLocationByProvider(fields.provider, fields.provider_place_id);
    if (existing && existing.location_id !== exceptLocationId) {
      throw new ServiceError(409, 'DUPLICATE_LOCATION', 'Địa điểm này đã thuộc một quán khác hoặc chi nhánh khác.', {
        restaurant_id: existing.restaurant_id,
        location_id: existing.location_id
      });
    }
  }

  /** Thêm món (và giá hiện hành nếu có) vào quán đã khóa. */
  async function insertItem(tx, restaurantId, item, { sourceType, sourceReference, status = 'ACTIVE' }, timestamp) {
    const normalized = normalize(item.name);
    if (status === 'ACTIVE') await assertNoDuplicateName(tx, restaurantId, normalized);
    const row = {
      menu_item_id: newId(), restaurant_id: restaurantId, name: item.name, name_normalized: normalized,
      description: item.description ?? null, status, created_at: timestamp, updated_at: timestamp
    };
    await tx.insertMenuItem(row);
    let assertion = null;
    if (item.price) {
      assertion = {
        price_assertion_id: newId(), menu_item_id: row.menu_item_id, min_price: item.price.min_price, max_price: item.price.max_price,
        currency: 'VND', is_current: true, source_type: sourceType, source_reference: sourceReference ?? null, created_at: timestamp
      };
      await tx.insertAssertion(assertion);
    }
    return menuItemView(row, assertion);
  }

  async function demotePrimary(tx, restaurantId) {
    for (const location of await tx.listLocations([restaurantId])) {
      if (location.is_primary) await tx.updateLocation(location.location_id, { is_primary: false });
    }
  }

  return {
    // ---------- Đọc ----------

    async listRestaurants(query) {
      const filter = validation.parseList(query);
      return repository.transaction(async (tx) => {
        const { rows, total } = await tx.listRestaurants(filter);
        const locations = await tx.listLocations(rows.map((row) => row.restaurant_id));
        const primary = new Map(locations.filter((row) => row.is_primary).map((row) => [row.restaurant_id, locationView(row)]));
        return {
          total,
          limit: filter.limit,
          offset: filter.offset,
          restaurants: rows.map((row) => ({ ...restaurantView(row), primary_location: primary.get(row.restaurant_id) ?? null }))
        };
      });
    },

    async getRestaurant(restaurantId) {
      return repository.transaction(async (tx) => {
        const row = await tx.getRestaurant(restaurantId);
        if (!row) throw notFound('RESTAURANT_NOT_FOUND', 'Không tìm thấy quán.');
        return restaurantDetail(tx, row);
      });
    },

    /** Món kèm giá hiện hành và lịch sử giá (mới nhất trước). feedback-review-service dùng để kiểm tra price_assertion_id khi nhận báo giá. */
    async getMenuItem(menuItemId) {
      return repository.transaction(async (tx) => {
        const item = await tx.getMenuItem(menuItemId);
        if (!item) throw notFound('MENU_ITEM_NOT_FOUND', 'Không tìm thấy món.');
        const [restaurant, history] = await Promise.all([tx.getRestaurant(item.restaurant_id), tx.listAssertions(menuItemId)]);
        const current = history.find((row) => row.is_current);
        return {
          ...menuItemView(item, current),
          restaurant: restaurantSummary(restaurant),
          price_history: history.map(assertionView)
        };
      });
    },

    // ---------- Quán ----------

    /** NEW_RESTAURANT được duyệt hoặc Admin tạo trực tiếp. Có source_ref thì gọi lại cùng (source_type, source_ref) không tạo bản thứ hai. */
    async createRestaurant(input) {
      const request = validation.parseCreateRestaurant(input);
      const timestamp = now();
      return repository.transaction(async (tx) => {
        if (request.source_ref) {
          const existing = await tx.findRestaurantBySource(request.source_type, request.source_ref);
          if (existing) return { changed: false, replayed: true, before: null, after: await restaurantDetail(tx, existing) };
        }
        await assertLocationFree(tx, request.location);

        const restaurantId = newId();
        await tx.insertRestaurant({
          restaurant_id: restaurantId, name: request.name, description: request.description, phone: request.phone,
          visibility_status: request.visibility_status, verified_at: timestamp, verified_by: request.acted_by,
          source_type: request.source_type, source_ref: request.source_ref, created_at: timestamp, updated_at: timestamp
        });
        await tx.insertLocation({
          commune: null, province: null, deprecated_address_text: null,
          ...request.location, location_id: newId(), restaurant_id: restaurantId, is_primary: true
        });
        if (request.cuisines.length > 0) await tx.setCuisines(restaurantId, request.cuisines, newId);
        const seen = new Set();
        for (const item of request.menu_items) {
          const key = normalize(item.name);
          if (seen.has(key)) throw new ServiceError(400, 'INVALID_REQUEST', `menu_items có món trùng tên: ${item.name}.`);
          seen.add(key);
          await insertItem(tx, restaurantId, item, { sourceType: 'CONTRIBUTION', sourceReference: request.source_ref }, timestamp);
        }
        return { changed: true, replayed: false, before: null, after: await detailById(tx, restaurantId) };
      });
    },

    /** RESTAURANT_CORRECTION được duyệt: tên, mô tả, điện thoại, loại hình. */
    async updateRestaurant(restaurantId, input) {
      const { fields, acted_by: actedBy } = validation.parseUpdateRestaurant(input);
      const timestamp = now();
      return repository.transaction(async (tx) => {
        const row = await lockRestaurant(tx, restaurantId);
        const before = await restaurantDetail(tx, row);
        const { cuisines, ...columns } = fields;
        await tx.updateRestaurant(restaurantId, { ...columns, ...verification(actedBy, timestamp) });
        if (cuisines) await tx.setCuisines(restaurantId, cuisines, newId);
        return { changed: true, before, after: await detailById(tx, restaurantId) };
      });
    },

    /**
     * Đổi trạng thái hiển thị (duyệt quán quét từ Goong, từ chối, tạm ngưng, đóng cửa sau CLOSED_REPORT).
     * Chỉ chuyển sang PUBLISHED mới làm mới nhãn xác minh. PUBLISHED cần có chi nhánh chính.
     */
    async setVisibility(restaurantId, input) {
      const { visibility_status: target, acted_by: actedBy } = validation.parseVisibility(input);
      const timestamp = now();
      return repository.transaction(async (tx) => {
        const row = await lockRestaurant(tx, restaurantId);
        const before = restaurantSummary(row);
        if (row.visibility_status === target) return { changed: false, before, after: before };
        if (target === 'PUBLISHED') {
          const locations = await tx.listLocations([restaurantId]);
          if (!locations.some((location) => location.is_primary)) {
            throw new ServiceError(409, 'NO_PRIMARY_LOCATION', 'Quán cần có chi nhánh chính trước khi công khai.');
          }
        }
        await tx.updateRestaurant(restaurantId, {
          visibility_status: target,
          ...(target === 'PUBLISHED' ? verification(actedBy, timestamp) : { updated_at: timestamp })
        });
        return { changed: true, before, after: restaurantSummary(await tx.getRestaurant(restaurantId)) };
      });
    },

    /** Admin kiểm chứng lại quán mà không đổi dữ liệu. */
    async verifyRestaurant(restaurantId, input) {
      const { acted_by: actedBy } = validation.parseActorOnly(input);
      const timestamp = now();
      return repository.transaction(async (tx) => {
        const row = await lockRestaurant(tx, restaurantId);
        const before = restaurantSummary(row);
        await tx.updateRestaurant(restaurantId, verification(actedBy, timestamp));
        return { changed: true, before, after: restaurantSummary(await tx.getRestaurant(restaurantId)) };
      });
    },

    // ---------- Chi nhánh ----------

    async addLocation(restaurantId, input) {
      const { fields, acted_by: actedBy } = validation.parseLocation(input, { withActor: true });
      const timestamp = now();
      return repository.transaction(async (tx) => {
        const row = await lockRestaurant(tx, restaurantId);
        const before = await restaurantDetail(tx, row);
        await assertLocationFree(tx, fields);

        const hasPrimary = before.locations.some((location) => location.is_primary);
        const makePrimary = fields.is_primary === true || !hasPrimary;
        if (makePrimary) await demotePrimary(tx, restaurantId);
        const locationId = newId();
        await tx.insertLocation({
          commune: null, province: null, deprecated_address_text: null,
          ...fields, location_id: locationId, restaurant_id: restaurantId, is_primary: makePrimary
        });
        await tx.updateRestaurant(restaurantId, verification(actedBy, timestamp));
        const after = await detailById(tx, restaurantId);
        return { changed: true, location: after.locations.find((location) => location.location_id === locationId), before, after };
      });
    },

    /**
     * Sửa chi nhánh. Quy tắc từ ERD: đổi địa chỉ thì phải gửi lại tọa độ đã kiểm tra; đổi địa chỉ hoặc tọa độ của chi nhánh
     * GOONG/OSM thì phải gửi lại nhóm provider (place_id mới, hoặc MANUAL) để mã địa điểm cũ không gắn với địa chỉ mới.
     */
    async updateLocation(restaurantId, locationId, input) {
      const { fields, providerGroup, acted_by: actedBy } = validation.parseLocation(input, { partial: true, withActor: true });
      if (Object.keys(fields).length === 0) throw new ServiceError(400, 'INVALID_REQUEST', 'Cần ít nhất một trường chi nhánh để sửa.');
      const timestamp = now();
      return repository.transaction(async (tx) => {
        const row = await lockRestaurant(tx, restaurantId);
        const location = await tx.getLocation(locationId);
        if (!location || location.restaurant_id !== restaurantId) throw notFound('LOCATION_NOT_FOUND', 'Không tìm thấy chi nhánh.');
        const before = await restaurantDetail(tx, row);

        const addressChanged = fields.address_text !== undefined && fields.address_text !== location.address_text;
        const coordinatesChanged = (fields.latitude !== undefined && fields.latitude !== Number(location.latitude)) ||
          (fields.longitude !== undefined && fields.longitude !== Number(location.longitude));
        if (addressChanged && (fields.latitude === undefined || fields.longitude === undefined)) {
          throw new ServiceError(422, 'COORDINATES_REQUIRED', 'Đổi địa chỉ thì cần gửi lại latitude và longitude đã xác nhận.');
        }
        if ((addressChanged || coordinatesChanged) && location.provider !== 'MANUAL' && !providerGroup) {
          throw new ServiceError(422, 'PROVIDER_REQUIRED', 'Đổi địa chỉ hoặc tọa độ chi nhánh GOONG/OSM cần gửi lại provider, provider_place_id, geocoded_at (hoặc provider MANUAL).');
        }
        if (providerGroup) await assertLocationFree(tx, fields, locationId);

        if (fields.is_primary === false && location.is_primary) {
          throw new ServiceError(422, 'PRIMARY_REQUIRED', 'Hãy đặt chi nhánh khác làm chi nhánh chính thay vì bỏ chi nhánh chính.');
        }
        if (fields.is_primary === true && !location.is_primary) await demotePrimary(tx, restaurantId);

        await tx.updateLocation(locationId, fields);
        await tx.updateRestaurant(restaurantId, verification(actedBy, timestamp));
        const after = await detailById(tx, restaurantId);
        return { changed: true, location: after.locations.find((item) => item.location_id === locationId), before, after };
      });
    },

    // ---------- Món và giá ----------

    /** MENU_CORRECTION được duyệt: thêm món, kèm giá hiện hành nếu có. */
    async createMenuItem(restaurantId, input) {
      const request = validation.parseCreateMenuItem(input);
      const timestamp = now();
      return repository.transaction(async (tx) => {
        const row = await lockRestaurant(tx, restaurantId);
        const item = await insertItem(tx, restaurantId, request, { sourceType: request.source_type, sourceReference: request.source_reference, status: request.status }, timestamp);
        await tx.updateRestaurant(restaurantId, verification(request.acted_by, timestamp));
        return {
          changed: true,
          menu_item: item,
          restaurant: restaurantSummary(await tx.getRestaurant(row.restaurant_id)),
          before: null,
          after: { current_price: item.current_price }
        };
      });
    },

    async updateMenuItem(menuItemId, input) {
      const { fields, acted_by: actedBy } = validation.parseUpdateMenuItem(input);
      const timestamp = now();
      return repository.transaction(async (tx) => {
        const { item, restaurant } = await lockItem(tx, menuItemId);
        const beforeAssertion = await tx.getCurrentAssertion(menuItemId);
        const before = menuItemView(item, beforeAssertion);

        const columns = { ...fields, updated_at: timestamp };
        if (fields.name !== undefined) columns.name_normalized = normalize(fields.name);
        const nextStatus = fields.status ?? item.status;
        if (nextStatus === 'ACTIVE' && (fields.name !== undefined || item.status !== 'ACTIVE')) {
          await assertNoDuplicateName(tx, restaurant.restaurant_id, columns.name_normalized ?? item.name_normalized, menuItemId);
        }
        await tx.updateMenuItem(menuItemId, columns);
        await tx.updateRestaurant(restaurant.restaurant_id, verification(actedBy, timestamp));
        const after = menuItemView(await tx.getMenuItem(menuItemId), beforeAssertion);
        return { changed: true, menu_item: after, restaurant: restaurantSummary(await tx.getRestaurant(restaurant.restaurant_id)), before, after };
      });
    },

    /**
     * Duyệt giá mới: dòng hiện hành cũ chuyển is_current = 0 (còn trong lịch sử), thêm dòng mới is_current = 1,
     * created_at = lúc duyệt. Có source_reference (ví dụ price_report_id) thì duyệt lại cùng báo cáo không tạo thêm dòng.
     */
    async applyPrice(menuItemId, input) {
      const request = validation.parseApplyPrice(input);
      const timestamp = now();
      return repository.transaction(async (tx) => {
        const { item, restaurant } = await lockItem(tx, menuItemId);
        const current = await tx.getCurrentAssertion(menuItemId);

        if (request.source_reference) {
          const replay = await tx.findAssertionBySource(menuItemId, request.source_type, request.source_reference);
          if (replay) {
            return {
              changed: false, replayed: true, price: assertionView(replay), menu_item: menuItemView(item, current),
              restaurant: restaurantSummary(restaurant), before: { current_price: current ? assertionView(current) : null },
              after: { current_price: current ? assertionView(current) : null }
            };
          }
        }
        if (request.referenced_price_assertion_id) {
          const referenced = await tx.getAssertion(request.referenced_price_assertion_id);
          if (!referenced || referenced.menu_item_id !== menuItemId) {
            throw new ServiceError(422, 'PRICE_ASSERTION_MISMATCH', 'Mức giá được tham chiếu không thuộc món này.');
          }
        }

        if (current) await tx.deactivateCurrentAssertion(menuItemId);
        const created = {
          price_assertion_id: newId(), menu_item_id: menuItemId, min_price: request.min_price, max_price: request.max_price,
          currency: 'VND', is_current: true, source_type: request.source_type, source_reference: request.source_reference, created_at: timestamp
        };
        await tx.insertAssertion(created);
        await tx.updateRestaurant(restaurant.restaurant_id, verification(request.acted_by, timestamp));
        return {
          changed: true, replayed: false, price: assertionView(created), menu_item: menuItemView(item, created),
          restaurant: restaurantSummary(await tx.getRestaurant(restaurant.restaurant_id)),
          before: { current_price: current ? assertionView(current) : null },
          after: { current_price: assertionView(created) }
        };
      });
    },

    /** Duyệt gỡ giá: dòng hiện hành chuyển is_current = 0, món về NO_PRICE. Không xóa lịch sử. */
    async withdrawPrice(menuItemId, input) {
      const { acted_by: actedBy } = validation.parseActorOnly(input);
      const timestamp = now();
      return repository.transaction(async (tx) => {
        const { item, restaurant } = await lockItem(tx, menuItemId);
        const current = await tx.getCurrentAssertion(menuItemId);
        if (!current) {
          return {
            changed: false, menu_item: menuItemView(item, null), restaurant: restaurantSummary(restaurant),
            before: { current_price: null }, after: { current_price: null }
          };
        }
        await tx.deactivateCurrentAssertion(menuItemId);
        await tx.updateRestaurant(restaurant.restaurant_id, verification(actedBy, timestamp));
        return {
          changed: true, menu_item: menuItemView(item, null), restaurant: restaurantSummary(await tx.getRestaurant(restaurant.restaurant_id)),
          before: { current_price: assertionView(current) }, after: { current_price: null }
        };
      });
    }
  };
}

module.exports = { createCatalogAdminService };
