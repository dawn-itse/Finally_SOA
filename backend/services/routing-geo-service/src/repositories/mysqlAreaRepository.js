/**
 * Kho SEARCH_AREA trên MySQL 8.0.16+ (schema: db/schema.sql). Chưa được chạy trên MySQL thật trong test:
 * test chỉ dùng pool giả (xem README).
 */
const COLUMNS = 'area_id, name, short_label, anchor_address, anchor_latitude, anchor_longitude, anchor_place_id, display_order, is_active';
const WRITABLE = ['name', 'short_label', 'anchor_address', 'anchor_latitude', 'anchor_longitude', 'anchor_place_id', 'display_order', 'is_active'];

function createMysqlPool(env = process.env) {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch {
    throw new Error('Thiếu gói mysql2. Chạy "npm install" trong backend/services/routing-geo-service.');
  }
  return mysql.createPool({
    host: env.GEO_MYSQL_HOST || env.MYSQL_HOST,
    port: Number(env.GEO_MYSQL_PORT || env.MYSQL_PORT) || 3306,
    user: env.GEO_MYSQL_USER || env.MYSQL_USER,
    password: env.GEO_MYSQL_PASSWORD || env.MYSQL_PASSWORD,
    database: env.GEO_MYSQL_DATABASE,
    charset: 'utf8mb4',
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: Number(env.GEO_MYSQL_POOL_SIZE) || 5,
    connectTimeout: 5000
  });
}

const mapArea = (row) => ({
  area_id: row.area_id,
  name: row.name,
  short_label: row.short_label,
  anchor_address: row.anchor_address,
  anchor_latitude: Number(row.anchor_latitude), // DECIMAL về dạng chuỗi
  anchor_longitude: Number(row.anchor_longitude),
  anchor_place_id: row.anchor_place_id ?? null,
  display_order: Number(row.display_order),
  is_active: Boolean(row.is_active)
});

const toDb = (value) => (typeof value === 'boolean' ? (value ? 1 : 0) : value);

function createMysqlAreaRepository({ pool }) {
  const first = (rows) => (rows[0] ? mapArea(rows[0]) : null);

  function view(conn) {
    return {
      // Luôn khóa tập khu vực đang hoạt động trước, rồi mới khóa dòng đích: cùng một thứ tự ở mọi giao dịch nên không deadlock,
      // và hai lần tắt khu vực khác nhau được xử lý lần lượt.
      async lockActiveAreaIds() {
        const [rows] = await conn.query('SELECT area_id FROM search_area WHERE is_active = 1 ORDER BY area_id FOR UPDATE');
        return rows.map((row) => row.area_id);
      },
      async getArea(id) {
        const [rows] = await conn.query(`SELECT ${COLUMNS} FROM search_area WHERE area_id = ? FOR UPDATE`, [id]);
        return first(rows);
      },
      async findByName(name, excludeId = null) {
        const [rows] = await conn.query(`SELECT ${COLUMNS} FROM search_area WHERE name = ? AND area_id <> ? LIMIT 1`, [name, excludeId ?? '']);
        return first(rows);
      },
      async maxDisplayOrder() {
        const [rows] = await conn.query('SELECT COALESCE(MAX(display_order), 0) AS max_order FROM search_area');
        return Number(rows[0]?.max_order ?? 0);
      },
      async insertArea(area) {
        await conn.query(
          `INSERT INTO search_area (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [area.area_id, area.name, area.short_label, area.anchor_address, area.anchor_latitude, area.anchor_longitude,
            area.anchor_place_id ?? null, area.display_order, area.is_active ? 1 : 0]
        );
      },
      async updateArea(id, fields) {
        const keys = Object.keys(fields).filter((key) => WRITABLE.includes(key));
        if (keys.length === 0) return;
        await conn.query(
          `UPDATE search_area SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE area_id = ?`,
          [...keys.map((key) => toDb(fields[key])), id]
        );
      }
    };
  }

  return {
    async ping() { await pool.query('SELECT 1'); },
    async listAreas({ activeOnly = false } = {}) {
      const [rows] = await pool.query(
        `SELECT ${COLUMNS} FROM search_area ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY display_order, name, area_id`
      );
      return rows.map(mapArea);
    },
    async getArea(id) {
      const [rows] = await pool.query(`SELECT ${COLUMNS} FROM search_area WHERE area_id = ?`, [id]);
      return first(rows);
    },
    async transaction(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await conn.beginTransaction();
        const result = await fn(view(conn));
        await conn.commit();
        return result;
      } catch (error) {
        try { await conn.rollback(); } catch { /* giữ lỗi gốc */ }
        throw error;
      } finally {
        conn.release();
      }
    }
  };
}

module.exports = { createMysqlAreaRepository, createMysqlPool };
