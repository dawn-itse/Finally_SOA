// Không có MySQL trong môi trường test: kiểm tra thứ tự câu lệnh, khóa dòng, giao dịch và tham số bằng pool giả.
// Cú pháp SQL thật cần chạy thử trên MySQL 8.0.16+ (xem README).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMysqlRepository } = require('../src/repositories/mysqlRepository');
const { createCatalogAdminService } = require('../src/admin/catalogAdminService');
const { loadDishText } = require('../src/dishText');

const placeholders = (sql) => (sql.match(/\?/g) ?? []).length;

function fakePool(handler) {
  const log = [];
  const events = [];
  const run = async (sql, params = []) => {
    const text = sql.replace(/\s+/g, ' ').trim();
    assert.equal(placeholders(text), params.length, `số ? khác số tham số: ${text}`);
    log.push({ sql: text, params });
    return handler(text, params) ?? [[]];
  };
  return {
    log,
    events,
    async getConnection() {
      return {
        query: run,
        async beginTransaction() { events.push('begin'); },
        async commit() { events.push('commit'); },
        async rollback() { events.push('rollback'); },
        release() { events.push('release'); }
      };
    }
  };
}

const restaurantRow = { restaurant_id: 'r1', name: 'Phở A', visibility_status: 'PUBLISHED', verified_at: null, verified_by: null, source_type: 'OSM', source_ref: null, created_at: new Date('2024-01-01Z'), updated_at: new Date('2024-01-01Z') };
const itemRow = { menu_item_id: 'm1', restaurant_id: 'r1', name: 'Phở bò', name_normalized: 'pho bo', description: null, status: 'ACTIVE', created_at: new Date('2024-01-01Z'), updated_at: new Date('2024-01-01Z') };
const currentRow = { price_assertion_id: 'p1', menu_item_id: 'm1', min_price: '52000', max_price: '52000', currency: 'VND', is_current: 1, source_type: 'IMPORT', source_reference: null, created_at: new Date('2024-01-01Z') };

function priceHandler(sql) {
  if (sql.startsWith('SELECT * FROM menu_item WHERE menu_item_id')) return [[itemRow]];
  if (sql.startsWith('SELECT * FROM restaurant WHERE restaurant_id')) return [[restaurantRow]];
  if (sql.includes('FROM price_assertion WHERE menu_item_id = ? AND is_current = 1')) return [[currentRow]];
  if (sql.startsWith('UPDATE price_assertion')) return [{ affectedRows: 1 }];
  return [[]];
}

async function makeAdmin(pool) {
  const dishText = await loadDishText();
  return createCatalogAdminService({ repository: createMysqlRepository({ pool }), dishText, newId: () => 'new-id', now: () => new Date('2026-11-27T09:00:00Z') });
}

test('applyPrice: READ COMMITTED, khóa quán rồi khóa món, tắt giá cũ, thêm giá mới, làm mới xác minh, commit', async () => {
  const pool = fakePool(priceHandler);
  const admin = await makeAdmin(pool);
  const result = await admin.applyPrice('m1', { min_price: 49000, source_reference: 'report-1', acted_by: 'admin-1' });
  assert.equal(result.changed, true);
  assert.equal(result.before.current_price.min_price, 52000);
  assert.deepEqual(pool.events, ['begin', 'commit', 'release']);

  const sqls = pool.log.map((entry) => entry.sql);
  assert.equal(sqls[0], 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  const restaurantLock = sqls.findIndex((sql) => sql.startsWith('SELECT * FROM restaurant WHERE restaurant_id = ? FOR UPDATE'));
  const itemLock = sqls.findIndex((sql) => sql.startsWith('SELECT * FROM menu_item WHERE menu_item_id = ? FOR UPDATE'));
  const deactivate = sqls.findIndex((sql) => sql.startsWith('UPDATE price_assertion SET is_current = 0'));
  const insert = sqls.findIndex((sql) => sql.startsWith('INSERT INTO price_assertion'));
  const verify = sqls.findIndex((sql) => sql.startsWith('UPDATE restaurant SET'));
  assert.ok(restaurantLock > 0 && itemLock > restaurantLock, 'khóa quán trước món');
  assert.ok(deactivate > itemLock && insert > deactivate && verify > insert, 'tắt giá cũ rồi mới thêm giá mới');

  const insertEntry = pool.log[insert];
  assert.deepEqual(insertEntry.params, ['new-id', 'm1', 49000, 49000, 'VND', 1, 'PRICE_REPORT', 'report-1', new Date('2026-11-27T09:00:00Z')]);
  assert.equal(pool.log[verify].sql, 'UPDATE restaurant SET verified_at = ?, verified_by = ?, updated_at = ? WHERE restaurant_id = ?');
  assert.deepEqual(pool.log[verify].params, [new Date('2026-11-27T09:00:00Z'), 'admin-1', new Date('2026-11-27T09:00:00Z'), 'r1']);
});

test('applyPrice: duyệt lại cùng báo cáo chỉ đọc, không ghi', async () => {
  const pool = fakePool((sql) => {
    if (sql.includes('source_type = ? AND source_reference = ?')) return [[{ ...currentRow, price_assertion_id: 'old', is_current: 0 }]];
    return priceHandler(sql);
  });
  const admin = await makeAdmin(pool);
  const result = await admin.applyPrice('m1', { min_price: 49000, source_reference: 'report-1', acted_by: 'admin-1' });
  assert.equal(result.replayed, true);
  assert.ok(!pool.log.some((entry) => /^(INSERT|UPDATE)/.test(entry.sql)));
  assert.deepEqual(pool.events, ['begin', 'commit', 'release']);
});

test('lỗi giữa giao dịch thì rollback, không commit, giải phóng kết nối', async () => {
  const pool = fakePool((sql) => {
    if (sql.startsWith('INSERT INTO price_assertion')) throw Object.assign(new Error('boom'), { code: 'ER_LOCK_DEADLOCK' });
    return priceHandler(sql);
  });
  const admin = await makeAdmin(pool);
  await assert.rejects(admin.applyPrice('m1', { min_price: 49000, acted_by: 'admin-1' }), /boom/);
  assert.deepEqual(pool.events, ['begin', 'rollback', 'release']);
});

test('getRestaurant/withdrawPrice: món không tồn tại thì 404 và vẫn đóng giao dịch', async () => {
  const pool = fakePool(() => [[]]);
  const admin = await makeAdmin(pool);
  await assert.rejects(admin.withdrawPrice('m404', { acted_by: 'admin-1' }), (error) => error.status === 404);
  assert.deepEqual(pool.events, ['begin', 'rollback', 'release']);
});

test('createRestaurant: thứ tự INSERT, cột sinh không bị ghi, nhóm provider và cuisine đúng tham số', async () => {
  let cuisineId = 0;
  const pool = fakePool((sql) => {
    if (sql.startsWith('SELECT cuisine_id, name FROM cuisine')) return [[{ cuisine_id: 'c1', name: 'Quán phở' }]];
    if (sql.startsWith('SELECT * FROM restaurant WHERE restaurant_id')) return [[{ ...restaurantRow, restaurant_id: 'new-id' }]];
    return [[]];
  });
  const dishText = await loadDishText();
  const admin = createCatalogAdminService({
    repository: createMysqlRepository({ pool }), dishText, now: () => new Date('2026-11-27T09:00:00Z'), newId: () => `id-${++cuisineId}`
  });
  await admin.createRestaurant({
    name: 'Quán mới', cuisines: ['Quán phở'], acted_by: 'admin-1', source_ref: 'contrib/1',
    location: { provider: 'GOONG', provider_place_id: 'gp-1', geocoded_at: '2026-11-26T05:00:00Z', address_text: 'Địa chỉ', latitude: 21, longitude: 105 },
    menu_items: [{ name: 'Phở bò', price: { min_price: 45000 } }]
  });
  assert.deepEqual(pool.events, ['begin', 'commit', 'release']);
  const inserts = pool.log.filter((entry) => entry.sql.startsWith('INSERT')).map((entry) => entry.sql.match(/INTO (\w+)/)[1]);
  assert.deepEqual(inserts, ['restaurant', 'restaurant_location', 'cuisine', 'restaurant_cuisine', 'menu_item', 'price_assertion']);
  const location = pool.log.find((entry) => entry.sql.startsWith('INSERT INTO restaurant_location'));
  assert.ok(!location.sql.includes('primary_restaurant_id'), 'không ghi cột sinh');
  assert.equal(location.params[location.params.length - 1], true, 'chi nhánh đầu tiên là chính');
  assert.equal(location.params[5], 'GOONG');
  const links = pool.log.find((entry) => entry.sql.startsWith('INSERT INTO restaurant_cuisine'));
  assert.deepEqual(links.params, [[['id-1', 'c1']]]);
});

test('listRestaurants: lọc động bằng tham số, không nối chuỗi người dùng vào SQL', async () => {
  const pool = fakePool((sql) => (sql.startsWith('SELECT COUNT') ? [[{ total: 0 }]] : [[]]));
  const admin = await makeAdmin(pool);
  await admin.listRestaurants(new URLSearchParams("status=PENDING&q=' OR 1=1 --&limit=5&offset=10"));
  const list = pool.log.find((entry) => entry.sql.startsWith('SELECT * FROM restaurant WHERE'));
  assert.ok(!list.sql.includes('OR 1=1'));
  assert.deepEqual(list.params, ['PENDING', "' OR 1=1 --", 5, 10]);
  const count = pool.log.find((entry) => entry.sql.startsWith('SELECT COUNT'));
  assert.deepEqual(count.params, ['PENDING', "' OR 1=1 --"]);
});

test('cột sửa ngoài danh sách cho phép bị chặn ở tầng kho', async () => {
  const pool = fakePool(() => [[]]);
  const repository = createMysqlRepository({ pool });
  await assert.rejects(repository.transaction((tx) => tx.updateRestaurant('r1', { 'name = 1, visibility_status': 'x' })), /Cột không được phép sửa/);
  assert.deepEqual(pool.events, ['begin', 'rollback', 'release']);
});
