// Không có MySQL trong môi trường test, nên dùng pool giả để kiểm tra những gì kiểm tra được ở tầng này:
// số `?` khớp số tham số, thứ tự POINT(kinh độ, vĩ độ), ánh xạ dòng kết quả và giao dịch lưu discovery.
// Cú pháp SQL và hành vi ST_Distance_Sphere cần chạy thử trên MySQL 8.0.16+ thật (xem README).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMysqlRepository } = require('../src/repositories/mysqlRepository');

const placeholders = (sql) => (sql.match(/\?/g) ?? []).length;

function fakePool(handler) {
  const log = [];
  const run = async (sql, params = []) => {
    assert.equal(placeholders(sql), params.length, `số ? khác số tham số:\n${sql}`);
    log.push({ sql, params });
    return handler(sql, params, log) ?? [[]];
  };
  return {
    log,
    query: run,
    async getConnection() {
      const events = [];
      return {
        events,
        query: run,
        async beginTransaction() { events.push('begin'); },
        async commit() { events.push('commit'); },
        async rollback() { events.push('rollback'); },
        release() { events.push('release'); }
      };
    }
  };
}

const center = { latitude: 21.0048, longitude: 105.8042 };

test('searchCatalog: tham số đúng thứ tự và ánh xạ kết quả', async () => {
  const pool = fakePool((sql) => {
    if (sql.includes('WITH branch')) {
      return [[{
        restaurant_id: 'r1', location_id: 'l1', address_text: 'Địa chỉ', latitude: '21.0086000', longitude: '105.8095000',
        commune: null, province: null, distance_m: 640.5, name: 'Phở A', description: null, phone: null,
        verified_at: new Date('2024-01-16T09:00:00Z')
      }]];
    }
    if (sql.includes('FROM menu_item m')) {
      return [[{ restaurant_id: 'r1', menu_item_id: 'm1', name: 'Phở bò', description: null, min_price: '45000', max_price: '45000', price_created_at: new Date('2024-01-15T07:30:00Z') }]];
    }
    if (sql.includes('FROM restaurant_cuisine')) return [[{ restaurant_id: 'r1', name: 'Quán phở' }]];
    return [[]];
  });
  const repo = createMysqlRepository({ pool });
  const rows = await repo.searchCatalog({ keyword: 'pho bo', maxPrice: 50000, center, radiusM: 2000 });

  const [first] = pool.log;
  assert.equal(first.params[0], center.longitude, 'POINT nhận kinh độ trước');
  assert.equal(first.params[1], center.latitude);
  assert.equal(first.params.at(-3), ' pho bo ', 'từ khóa có khoảng trắng hai đầu để khớp theo từ');
  assert.equal(first.params.at(-2), 50000);
  assert.equal(first.params.at(-1), 2000);
  const [minLat, maxLat, minLng, maxLng] = first.params.slice(2, 6);
  assert.ok(minLat < center.latitude && maxLat > center.latitude && minLng < center.longitude && maxLng > center.longitude);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].location.latitude, 21.0086);
  assert.equal(rows[0].items[0].min_price, 45000);
  assert.equal(rows[0].items[0].price_updated_at, '2024-01-15T07:30:00.000Z');
  assert.equal(rows[0].restaurant.verified_at, '2024-01-16T09:00:00.000Z');
  assert.deepEqual(rows[0].cuisines, ['Quán phở']);
});

test('searchCatalog: không có chi nhánh thì dừng sau một truy vấn', async () => {
  const pool = fakePool(() => [[]]);
  const rows = await createMysqlRepository({ pool }).searchCatalog({ keyword: 'x', maxPrice: 1, center, radiusM: 1000 });
  assert.deepEqual(rows, []);
  assert.equal(pool.log.length, 1);
});

test('findDiscoverySuggestions: tham số và ánh xạ', async () => {
  const pool = fakePool(() => [[{ restaurant_id: 'r9', name: 'Bún bò', location_id: 'l9', address_text: 'A', latitude: '21.0055000', longitude: '105.8051000', commune: 'X', province: 'Y', distance_m: '120.4' }]]);
  const out = await createMysqlRepository({ pool }).findDiscoverySuggestions({ keyword: 'bun bo', center, radiusM: 3000 });
  assert.equal(pool.log[0].params[2], 'bun bo');
  assert.equal(pool.log[0].params.at(-1), 3000);
  assert.equal(out[0].distance_m, 120.4);
  assert.equal(out[0].location.commune, 'X');
});

const place = {
  provider: 'GOONG', provider_place_id: 'pid-1', name: 'Quán', address_text: 'Địa chỉ', latitude: 21.0055, longitude: 105.8051,
  commune: null, province: null, deprecated_address_text: null, geocoded_at: '2026-11-27T01:00:00.000Z'
};

test('saveDiscoveredPlaces: địa điểm mới tạo quán PENDING, chi nhánh và từ khóa trong một giao dịch', async () => {
  let connection;
  const pool = fakePool(() => [[]]);
  const getConnection = pool.getConnection;
  pool.getConnection = async () => (connection = await getConnection());
  const saved = await createMysqlRepository({ pool }).saveDiscoveredPlaces({ keyword: 'bun bo', places: [place] });

  assert.equal(saved, 1);
  assert.deepEqual(connection.events, ['begin', 'commit', 'release']);
  const sqls = pool.log.map((entry) => entry.sql);
  assert.ok(sqls.some((s) => s.includes('INSERT INTO restaurant\n')) || sqls.some((s) => /INSERT INTO restaurant\s/.test(s)));
  assert.ok(sqls.some((s) => s.includes('INSERT INTO restaurant_location')));
  assert.ok(sqls.some((s) => s.includes('INSERT IGNORE INTO restaurant_discovery')));
  assert.ok(pool.log.find((e) => /INSERT INTO restaurant\s/.test(e.sql)).sql.includes("'PENDING'"));
});

test('saveDiscoveredPlaces: địa điểm của quán PENDING đã có chỉ thêm từ khóa, không tạo quán mới', async () => {
  const pool = fakePool((sql) => (sql.includes('SELECT l.location_id') ? [[{ location_id: 'l-old', visibility_status: 'PENDING' }]] : [[]]));
  const saved = await createMysqlRepository({ pool }).saveDiscoveredPlaces({ keyword: 'pho bo', places: [place] });
  assert.equal(saved, 1);
  assert.ok(!pool.log.some((e) => /INSERT INTO restaurant\s/.test(e.sql)));
  assert.ok(!pool.log.some((e) => e.sql.includes('INSERT INTO restaurant_location')));
  assert.equal(pool.log.at(-1).params[0], 'l-old');
});

test('saveDiscoveredPlaces: quán đã PUBLISHED (thuộc catalog) thì không ghi gì vào restaurant_discovery', async () => {
  let connection;
  const pool = fakePool((sql) => (sql.includes('SELECT l.location_id') ? [[{ location_id: 'l-old', visibility_status: 'PUBLISHED' }]] : [[]]));
  const getConnection = pool.getConnection;
  pool.getConnection = async () => (connection = await getConnection());
  const saved = await createMysqlRepository({ pool }).saveDiscoveredPlaces({ keyword: 'pho bo', places: [place] });
  assert.equal(saved, 0);
  assert.ok(!pool.log.some((e) => e.sql.includes('restaurant_discovery')));
  assert.ok(!pool.log.some((e) => /INSERT INTO restaurant/.test(e.sql)));
  assert.deepEqual(connection.events, ['begin', 'rollback', 'release']);
});

test('saveDiscoveredPlaces: quán bị từ chối thì rollback và bỏ qua', async () => {
  let connection;
  const pool = fakePool((sql) => (sql.includes('SELECT l.location_id') ? [[{ location_id: 'l-old', visibility_status: 'REJECTED' }]] : [[]]));
  const getConnection = pool.getConnection;
  pool.getConnection = async () => (connection = await getConnection());
  const saved = await createMysqlRepository({ pool }).saveDiscoveredPlaces({ keyword: 'pho bo', places: [place] });
  assert.equal(saved, 0);
  assert.deepEqual(connection.events, ['begin', 'rollback', 'release']);
});

test('saveDiscoveredPlaces: đụng khóa trùng (request song song) thì rollback rồi đọc lại bản đã ghi', async () => {
  let selects = 0;
  const pool = fakePool((sql) => {
    if (sql.includes('SELECT l.location_id')) {
      selects += 1;
      return selects === 1 ? [[]] : [[{ location_id: 'l-winner', visibility_status: 'PENDING' }]];
    }
    if (sql.includes('INSERT INTO restaurant_location')) {
      throw Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
    }
    return [[]];
  });
  const saved = await createMysqlRepository({ pool }).saveDiscoveredPlaces({ keyword: 'bun bo', places: [place] });
  assert.equal(saved, 1);
  assert.equal(selects, 2);
  assert.equal(pool.log.at(-1).params[0], 'l-winner');
});

test('saveDiscoveredPlaces: lỗi khác được ném ra để client nhận lỗi', async () => {
  const pool = fakePool((sql) => {
    if (sql.includes('INSERT INTO restaurant\n') || /INSERT INTO restaurant\s/.test(sql)) throw new Error('disk full');
    return [[]];
  });
  await assert.rejects(createMysqlRepository({ pool }).saveDiscoveredPlaces({ keyword: 'bun bo', places: [place] }), /disk full/);
});
