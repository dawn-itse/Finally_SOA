const { randomUUID } = require('node:crypto');
const { boundingBox, EARTH_RADIUS_M } = require('../geoMath');

const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

/**
 * Tạo pool kết nối từ biến môi trường. mysql2 chỉ được nạp khi dùng MySQL,
 * nên chế độ preview (in-memory) không cần cài thêm gói nào.
 */
function createMysqlPool(env = process.env) {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch {
    throw new Error('Thiếu gói mysql2. Chạy "npm install" trong backend/services/restaurant-search-service.');
  }
  return mysql.createPool({
    host: env.MYSQL_HOST,
    port: Number(env.MYSQL_PORT) || 3306,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE,
    charset: 'utf8mb4',
    timezone: 'Z', // DATETIME(3) lưu giờ UTC theo ERD
    waitForConnections: true,
    connectionLimit: Number(env.MYSQL_POOL_SIZE) || 10,
    connectTimeout: 5000
  });
}

const toIso = (value) => (value ? new Date(value).toISOString() : null);

const mapBranch = (row) => ({
  location_id: row.location_id,
  address_text: row.address_text,
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  commune: row.commune ?? null,
  province: row.province ?? null
});

// ST_Distance_Sphere nhận POINT(kinh độ, vĩ độ). Goong và API của service dùng vĩ độ, kinh độ.
const DISTANCE_SQL = `ST_Distance_Sphere(POINT(l.longitude, l.latitude), POINT(?, ?), ${EARTH_RADIUS_M})`;

// Món ACTIVE khớp tên đã chuẩn hóa (LOCATE thay LIKE để không phải escape % và _),
// có giá hiện hành và min_price <= ngân sách: cả ba điều kiện trên cùng một món.
const MATCHING_ITEM_SQL = `
  m.status = 'ACTIVE'
  AND LOCATE(?, CONCAT(' ', m.name_normalized, ' ')) > 0
  AND p.min_price <= ?`;

const RESTAURANT_UPDATE_COLUMNS = new Set(['name', 'description', 'phone', 'visibility_status', 'verified_at', 'verified_by', 'updated_at']);
const LOCATION_UPDATE_COLUMNS = new Set([
  'address_text', 'latitude', 'longitude', 'provider', 'provider_place_id', 'commune', 'province',
  'deprecated_address_text', 'geocoded_at', 'is_primary'
]);
const MENU_ITEM_UPDATE_COLUMNS = new Set(['name', 'name_normalized', 'description', 'status', 'updated_at']);

const RESTAURANT_INSERT = ['restaurant_id', 'name', 'description', 'phone', 'visibility_status', 'verified_at', 'verified_by', 'source_type', 'source_ref', 'created_at', 'updated_at'];
const LOCATION_INSERT = [
  'location_id', 'restaurant_id', 'address_text', 'latitude', 'longitude', 'provider', 'provider_place_id',
  'commune', 'province', 'deprecated_address_text', 'geocoded_at', 'is_primary'
];
const MENU_ITEM_INSERT = ['menu_item_id', 'restaurant_id', 'name', 'name_normalized', 'description', 'status', 'created_at', 'updated_at'];
const ASSERTION_INSERT = ['price_assertion_id', 'menu_item_id', 'min_price', 'max_price', 'currency', 'is_current', 'source_type', 'source_reference', 'created_at'];

const lockClause = (options) => (options?.lock ? ' FOR UPDATE' : '');

async function insertRow(connection, table, columns, row) {
  await connection.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => row[column] ?? null)
  );
}

// Tên bảng và cột chỉ đến từ hằng số ở trên; giá trị luôn đi qua tham số.
async function updateRow(connection, table, keyColumn, allowed, id, fields) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;
  for (const [column] of entries) {
    if (!allowed.has(column)) throw new Error(`Cột không được phép sửa: ${table}.${column}`);
  }
  await connection.query(
    `UPDATE ${table} SET ${entries.map(([column]) => `${column} = ?`).join(', ')} WHERE ${keyColumn} = ?`,
    [...entries.map(([, value]) => value), id]
  );
}

const first = (result) => result[0][0] ?? null;

/** Các thao tác nguyên tử trên một kết nối đang trong giao dịch. Logic nghiệp vụ nằm ở admin/catalogAdminService.js. */
function createMysqlTx(connection) {
  return {
    async getRestaurant(id, options) {
      return first(await connection.query(`SELECT * FROM restaurant WHERE restaurant_id = ?${lockClause(options)}`, [id]));
    },
    async listRestaurants({ status, q, limit, offset }) {
      const conditions = [];
      const params = [];
      if (status) {
        conditions.push('visibility_status = ?');
        params.push(status);
      }
      if (q) {
        conditions.push('LOCATE(?, name) > 0'); // collation _ai_ci: không phân biệt hoa thường
        params.push(q);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const [[count], [rows]] = await Promise.all([
        connection.query(`SELECT COUNT(*) AS total FROM restaurant ${where}`, params),
        connection.query(`SELECT * FROM restaurant ${where} ORDER BY created_at DESC, restaurant_id LIMIT ? OFFSET ?`, [...params, limit, offset])
      ]);
      return { total: Number(count[0].total), rows };
    },
    async findRestaurantBySource(sourceType, sourceRef) {
      return first(await connection.query('SELECT * FROM restaurant WHERE source_type = ? AND source_ref = ? LIMIT 1', [sourceType, sourceRef]));
    },
    async insertRestaurant(row) {
      await insertRow(connection, 'restaurant', RESTAURANT_INSERT, row);
    },
    async updateRestaurant(id, fields) {
      await updateRow(connection, 'restaurant', 'restaurant_id', RESTAURANT_UPDATE_COLUMNS, id, fields);
    },

    async listLocations(restaurantIds) {
      if (restaurantIds.length === 0) return [];
      const [rows] = await connection.query(
        'SELECT * FROM restaurant_location WHERE restaurant_id IN (?) ORDER BY is_primary DESC, location_id',
        [restaurantIds]
      );
      return rows;
    },
    async getLocation(id) {
      return first(await connection.query('SELECT * FROM restaurant_location WHERE location_id = ?', [id]));
    },
    async findLocationByProvider(provider, placeId) {
      return first(await connection.query('SELECT * FROM restaurant_location WHERE provider = ? AND provider_place_id = ?', [provider, placeId]));
    },
    async insertLocation(row) {
      await insertRow(connection, 'restaurant_location', LOCATION_INSERT, row);
    },
    async updateLocation(id, fields) {
      await updateRow(connection, 'restaurant_location', 'location_id', LOCATION_UPDATE_COLUMNS, id, fields);
    },

    async getCuisineNames(restaurantId) {
      const [rows] = await connection.query(
        'SELECT c.name FROM restaurant_cuisine rc JOIN cuisine c ON c.cuisine_id = rc.cuisine_id WHERE rc.restaurant_id = ? ORDER BY c.name',
        [restaurantId]
      );
      return rows.map((row) => row.name);
    },
    async setCuisines(restaurantId, names, newId) {
      await connection.query('DELETE FROM restaurant_cuisine WHERE restaurant_id = ?', [restaurantId]);
      if (names.length === 0) return;
      for (const name of names) {
        await connection.query('INSERT IGNORE INTO cuisine (cuisine_id, name) VALUES (?, ?)', [newId(), name]);
      }
      const [rows] = await connection.query('SELECT cuisine_id, name FROM cuisine WHERE name IN (?)', [names]);
      const idByName = new Map(rows.map((row) => [row.name.toLowerCase(), row.cuisine_id]));
      const links = names.map((name) => [restaurantId, idByName.get(name.toLowerCase())]).filter(([, cuisineId]) => cuisineId);
      if (links.length > 0) await connection.query('INSERT INTO restaurant_cuisine (restaurant_id, cuisine_id) VALUES ?', [links]);
    },

    async listMenuItems(restaurantId) {
      const [rows] = await connection.query('SELECT * FROM menu_item WHERE restaurant_id = ? ORDER BY name_normalized, menu_item_id', [restaurantId]);
      return rows;
    },
    async getMenuItem(id, options) {
      return first(await connection.query(`SELECT * FROM menu_item WHERE menu_item_id = ?${lockClause(options)}`, [id]));
    },
    async findActiveItemsByName(restaurantId, normalized) {
      const [rows] = await connection.query(
        "SELECT * FROM menu_item WHERE restaurant_id = ? AND status = 'ACTIVE' AND name_normalized = ?",
        [restaurantId, normalized]
      );
      return rows;
    },
    async insertMenuItem(row) {
      await insertRow(connection, 'menu_item', MENU_ITEM_INSERT, row);
    },
    async updateMenuItem(id, fields) {
      await updateRow(connection, 'menu_item', 'menu_item_id', MENU_ITEM_UPDATE_COLUMNS, id, fields);
    },

    async listCurrentAssertions(restaurantId) {
      const [rows] = await connection.query(
        `SELECT p.* FROM price_assertion p
         JOIN menu_item m ON m.menu_item_id = p.menu_item_id
         WHERE m.restaurant_id = ? AND p.is_current = 1`,
        [restaurantId]
      );
      return rows;
    },
    async getCurrentAssertion(menuItemId) {
      return first(await connection.query('SELECT * FROM price_assertion WHERE menu_item_id = ? AND is_current = 1', [menuItemId]));
    },
    async getAssertion(id) {
      return first(await connection.query('SELECT * FROM price_assertion WHERE price_assertion_id = ?', [id]));
    },
    async listAssertions(menuItemId) {
      const [rows] = await connection.query(
        'SELECT * FROM price_assertion WHERE menu_item_id = ? ORDER BY created_at DESC, is_current DESC, price_assertion_id',
        [menuItemId]
      );
      return rows;
    },
    async findAssertionBySource(menuItemId, sourceType, sourceReference) {
      return first(await connection.query(
        'SELECT * FROM price_assertion WHERE menu_item_id = ? AND source_type = ? AND source_reference = ? ORDER BY created_at DESC LIMIT 1',
        [menuItemId, sourceType, sourceReference]
      ));
    },
    async deactivateCurrentAssertion(menuItemId) {
      const [result] = await connection.query('UPDATE price_assertion SET is_current = 0 WHERE menu_item_id = ? AND is_current = 1', [menuItemId]);
      return result.affectedRows ?? 0;
    },
    async insertAssertion(row) {
      await insertRow(connection, 'price_assertion', ASSERTION_INSERT, { ...row, is_current: row.is_current ? 1 : 0 });
    }
  };
}

function createMysqlRepository({ pool }) {
  return {
    /**
     * Một giao dịch cho API nội bộ. READ COMMITTED để mỗi lần đọc sau khi đã khóa dòng thấy dữ liệu mới nhất đã commit
     * (REPEATABLE READ có thể trả ảnh chụp cũ sau khi lấy khóa). Bên gọi khóa quán trước, món sau.
     */
    async transaction(fn) {
      const connection = await pool.getConnection();
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await connection.beginTransaction();
        const result = await fn(createMysqlTx(connection));
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
      } finally {
        connection.release();
      }
    },

    async searchCatalog({ keyword, maxPrice, center, radiusM }) {
      const box = boundingBox(center.latitude, center.longitude, radiusM);
      const needle = ` ${keyword} `;

      // Chi nhánh gần nhất trong bán kính cho mỗi quán PUBLISHED có món phù hợp.
      const [branchRows] = await pool.query(
        `WITH branch AS (
           SELECT l.restaurant_id, l.location_id, l.address_text, l.latitude, l.longitude,
                  l.commune, l.province, l.is_primary,
                  ${DISTANCE_SQL} AS distance_m
           FROM restaurant_location l
           JOIN restaurant r ON r.restaurant_id = l.restaurant_id AND r.visibility_status = 'PUBLISHED'
           WHERE l.latitude BETWEEN ? AND ?
             AND l.longitude BETWEEN ? AND ?
             AND EXISTS (
               SELECT 1
               FROM menu_item m
               JOIN price_assertion p ON p.menu_item_id = m.menu_item_id AND p.is_current = 1
               WHERE m.restaurant_id = l.restaurant_id AND ${MATCHING_ITEM_SQL}
             )
         ), ranked AS (
           SELECT branch.*,
                  ROW_NUMBER() OVER (PARTITION BY restaurant_id ORDER BY distance_m, is_primary DESC, location_id) AS branch_rank
           FROM branch
           WHERE distance_m <= ?
         )
         SELECT ranked.restaurant_id, ranked.location_id, ranked.address_text, ranked.latitude, ranked.longitude,
                ranked.commune, ranked.province, ranked.distance_m,
                r.name, r.description, r.phone, r.verified_at
         FROM ranked
         JOIN restaurant r ON r.restaurant_id = ranked.restaurant_id
         WHERE ranked.branch_rank = 1
         ORDER BY ranked.distance_m`,
        [center.longitude, center.latitude, box.minLat, box.maxLat, box.minLng, box.maxLng, needle, maxPrice, radiusM]
      );
      if (branchRows.length === 0) return [];

      const ids = branchRows.map((row) => row.restaurant_id);
      const [[itemRows], [cuisineRows]] = await Promise.all([
        pool.query(
          `SELECT m.restaurant_id, m.menu_item_id, m.name, m.description,
                  p.min_price, p.max_price, p.created_at AS price_created_at
           FROM menu_item m
           JOIN price_assertion p ON p.menu_item_id = m.menu_item_id AND p.is_current = 1
           WHERE m.restaurant_id IN (?) AND ${MATCHING_ITEM_SQL}
           ORDER BY m.restaurant_id, p.min_price, p.max_price, m.name`,
          [ids, needle, maxPrice]
        ),
        pool.query(
          `SELECT rc.restaurant_id, c.name
           FROM restaurant_cuisine rc
           JOIN cuisine c ON c.cuisine_id = rc.cuisine_id
           WHERE rc.restaurant_id IN (?)
           ORDER BY c.name`,
          [ids]
        )
      ]);

      const group = (rows, pick) => {
        const map = new Map();
        for (const row of rows) {
          if (!map.has(row.restaurant_id)) map.set(row.restaurant_id, []);
          map.get(row.restaurant_id).push(pick(row));
        }
        return map;
      };
      const items = group(itemRows, (row) => ({
        menu_item_id: row.menu_item_id,
        name: row.name,
        description: row.description ?? null,
        min_price: Number(row.min_price),
        max_price: Number(row.max_price),
        price_updated_at: toIso(row.price_created_at)
      }));
      const cuisines = group(cuisineRows, (row) => row.name);

      return branchRows.map((row) => ({
        restaurant: {
          restaurant_id: row.restaurant_id,
          name: row.name,
          description: row.description ?? null,
          phone: row.phone ?? null,
          verified_at: toIso(row.verified_at)
        },
        location: mapBranch(row),
        distance_m: Number(row.distance_m),
        cuisines: cuisines.get(row.restaurant_id) ?? [],
        items: items.get(row.restaurant_id) ?? []
      })).filter((row) => row.items.length > 0);
    },

    async findDiscoverySuggestions({ keyword, center, radiusM }) {
      const box = boundingBox(center.latitude, center.longitude, radiusM);
      const [rows] = await pool.query(
        `WITH cand AS (
           SELECT r.restaurant_id, r.name, l.location_id, l.address_text, l.latitude, l.longitude,
                  l.commune, l.province,
                  ${DISTANCE_SQL} AS distance_m
           FROM restaurant_discovery d
           JOIN restaurant_location l ON l.location_id = d.location_id AND l.provider = 'GOONG'
           JOIN restaurant r ON r.restaurant_id = l.restaurant_id AND r.visibility_status IN ('PENDING', 'PUBLISHED')
           WHERE d.dish_keyword = ?
             AND l.latitude BETWEEN ? AND ?
             AND l.longitude BETWEEN ? AND ?
         ), ranked AS (
           SELECT cand.*,
                  ROW_NUMBER() OVER (PARTITION BY restaurant_id ORDER BY distance_m, location_id) AS branch_rank
           FROM cand
           WHERE distance_m <= ?
         )
         SELECT restaurant_id, name, location_id, address_text, latitude, longitude, commune, province, distance_m
         FROM ranked
         WHERE branch_rank = 1
         ORDER BY distance_m`,
        [center.longitude, center.latitude, keyword, box.minLat, box.maxLat, box.minLng, box.maxLng, radiusM]
      );
      return rows.map((row) => ({
        restaurant_id: row.restaurant_id,
        name: row.name,
        location: mapBranch(row),
        distance_m: Number(row.distance_m)
      }));
    },

    /**
     * Lưu quán PENDING + chi nhánh + liên kết từ khóa; mỗi địa điểm một giao dịch.
     * Cặp (provider, provider_place_id) nhận ra chi nhánh đã lưu để dùng lại restaurant_id.
     * Hai request cùng gặp một địa điểm: bên thua gặp ER_DUP_ENTRY, rollback rồi đọc lại bản đã ghi.
     */
    async saveDiscoveredPlaces({ keyword, places }) {
      let saved = 0;
      for (const place of places) {
        if (await saveOnePlace(pool, keyword, place)) saved += 1;
      }
      return saved;
    },

    async ping() {
      await pool.query('SELECT 1');
      return true;
    },

    async close() {
      await pool.end();
    }
  };
}

async function saveOnePlace(pool, keyword, place) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const now = new Date();

      const [existing] = await connection.query(
        `SELECT l.location_id, r.visibility_status
         FROM restaurant_location l
         JOIN restaurant r ON r.restaurant_id = l.restaurant_id
         WHERE l.provider = 'GOONG' AND l.provider_place_id = ?`,
        [place.provider_place_id]
      );

      let locationId;
      if (existing.length > 0) {
        if (existing[0].visibility_status !== 'PENDING') {
          await connection.rollback();
          // PUBLISHED: quán đã thuộc catalog, không ghi thêm vào restaurant_discovery.
          // REJECTED/SUSPENDED/CLOSED: không gợi ý lại.
          return false;
        }
        locationId = existing[0].location_id;
      } else {
        const restaurantId = randomUUID();
        locationId = randomUUID();
        await connection.query(
          `INSERT INTO restaurant
             (restaurant_id, name, visibility_status, verified_at, verified_by, source_type, source_ref, created_at, updated_at)
           VALUES (?, ?, 'PENDING', NULL, NULL, 'GOONG_DISCOVERY', ?, ?, ?)`,
          [restaurantId, place.name, place.provider_place_id, now, now]
        );
        await connection.query(
          `INSERT INTO restaurant_location
             (location_id, restaurant_id, address_text, latitude, longitude, provider, provider_place_id,
              commune, province, deprecated_address_text, geocoded_at, is_primary)
           VALUES (?, ?, ?, ?, ?, 'GOONG', ?, ?, ?, ?, ?, 1)`,
          [
            locationId, restaurantId, place.address_text, place.latitude, place.longitude, place.provider_place_id,
            place.commune ?? null, place.province ?? null, place.deprecated_address_text ?? null,
            place.geocoded_at ? new Date(place.geocoded_at) : now
          ]
        );
      }

      await connection.query(
        'INSERT IGNORE INTO restaurant_discovery (location_id, dish_keyword, discovered_at) VALUES (?, ?, ?)',
        [locationId, keyword, now]
      );
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback().catch(() => {});
      if (error.code === DUPLICATE_ENTRY && attempt === 1) continue; // đọc lại bản do request kia ghi
      throw error;
    } finally {
      connection.release();
    }
  }
  return false;
}

module.exports = { createMysqlRepository, createMysqlPool };
