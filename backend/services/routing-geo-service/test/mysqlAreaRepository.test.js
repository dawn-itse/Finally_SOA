// Không có MySQL trong môi trường test, nên dùng pool giả để kiểm tra những gì kiểm tra được ở tầng này:
// số `?` khớp số tham số, ánh xạ dòng kết quả, thứ tự khóa dòng và vòng đời giao dịch.
// Cú pháp SQL và hành vi FOR UPDATE/READ COMMITTED cần chạy thử trên MySQL 8.0.16+ thật (xem README).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMysqlAreaRepository } = require('../src/repositories/mysqlAreaRepository');
const { createAreaService } = require('../src/areaService');

const placeholders = (sql) => (sql.match(/\?/g) ?? []).length;

function fakePool(handler = () => undefined) {
  const log = [];
  const connections = [];
  const run = async (sql, params = []) => {
    assert.equal(placeholders(sql), params.length, `số ? khác số tham số:\n${sql}`);
    log.push({ sql, params });
    return handler(sql, params, log) ?? [[]];
  };
  return {
    log, connections, query: run,
    async getConnection() {
      const events = [];
      connections.push(events);
      return {
        query: async (sql, params) => { events.push(sql.split(' ').slice(0, 2).join(' ')); return run(sql, params); },
        async beginTransaction() { events.push('begin'); },
        async commit() { events.push('commit'); },
        async rollback() { events.push('rollback'); },
        release() { events.push('release'); }
      };
    }
  };
}

const row = (overrides = {}) => ({
  area_id: 'a1', name: 'Lê Văn Lương', short_label: 'LVL', anchor_address: '68 LVL', anchor_latitude: '21.0048000',
  anchor_longitude: '105.8042000', anchor_place_id: null, display_order: 1, is_active: 1, ...overrides
});

test('listAreas: ánh xạ DECIMAL/TINYINT, lọc đang hoạt động và sắp theo display_order', async () => {
  const pool = fakePool(() => [[row(), row({ area_id: 'a2', is_active: 0, anchor_place_id: 'gp' })]]);
  const repo = createMysqlAreaRepository({ pool });
  const all = await repo.listAreas();
  assert.deepEqual(all[0], {
    area_id: 'a1', name: 'Lê Văn Lương', short_label: 'LVL', anchor_address: '68 LVL', anchor_latitude: 21.0048,
    anchor_longitude: 105.8042, anchor_place_id: null, display_order: 1, is_active: true
  });
  assert.equal(all[1].is_active, false);
  assert.match(pool.log[0].sql, /ORDER BY display_order, name, area_id/);
  assert.doesNotMatch(pool.log[0].sql, /WHERE/);
  await repo.listAreas({ activeOnly: true });
  assert.match(pool.log[1].sql, /WHERE is_active = 1/);
});

test('getArea: tham số hóa, null khi không có', async () => {
  const pool = fakePool((sql, params) => (params[0] === 'a1' ? [[row()]] : [[]]));
  const repo = createMysqlAreaRepository({ pool });
  assert.equal((await repo.getArea('a1')).area_id, 'a1');
  assert.equal(await repo.getArea('zzz'), null);
});

test('giao dịch: READ COMMITTED → begin → commit → release; lỗi thì rollback rồi release', async () => {
  const pool = fakePool();
  const repo = createMysqlAreaRepository({ pool });
  await repo.transaction(async (tx) => { await tx.lockActiveAreaIds(); });
  assert.deepEqual(pool.connections[0], ['SET TRANSACTION', 'begin', 'SELECT area_id', 'commit', 'release']);
  await assert.rejects(repo.transaction(async () => { throw new Error('boom'); }), /boom/);
  assert.deepEqual(pool.connections[1], ['SET TRANSACTION', 'begin', 'rollback', 'release']);
  assert.match(pool.log[0].sql, /READ COMMITTED/);
});

test('khóa dòng: tập đang hoạt động khóa trước dòng đích, cả hai FOR UPDATE', async () => {
  const pool = fakePool((sql) => {
    if (sql.includes('SELECT area_id FROM search_area')) return [[{ area_id: 'a1' }, { area_id: 'a2' }]];
    if (sql.includes('WHERE area_id = ?')) return [[row({ area_id: 'a1' })]];
    return [[]];
  });
  const areas = createAreaService({ repository: createMysqlAreaRepository({ pool }) });
  await areas.update('a1', { short_label: 'LVL2' });
  const selects = pool.log.filter((entry) => entry.sql.startsWith('SELECT'));
  assert.match(selects[0].sql, /is_active = 1 ORDER BY area_id FOR UPDATE/);
  assert.match(selects[1].sql, /WHERE area_id = \? FOR UPDATE/);
  const update = pool.log.find((entry) => entry.sql.startsWith('UPDATE'));
  assert.equal(update.sql, 'UPDATE search_area SET short_label = ? WHERE area_id = ?');
  assert.deepEqual(update.params, ['LVL2', 'a1']);
});

test('tắt khu vực cuối cùng: 409 và rollback, không có UPDATE', async () => {
  const pool = fakePool((sql) => {
    if (sql.includes('SELECT area_id FROM search_area')) return [[{ area_id: 'a1' }]];
    if (sql.includes('WHERE area_id = ?')) return [[row()]];
    return [[]];
  });
  const areas = createAreaService({ repository: createMysqlAreaRepository({ pool }) });
  await assert.rejects(areas.update('a1', { is_active: false }), { status: 409, code: 'LAST_ACTIVE_AREA' });
  assert.equal(pool.log.some((entry) => entry.sql.startsWith('UPDATE')), false);
  assert.ok(pool.connections[0].includes('rollback'));
});

test('bật/tắt gửi 1/0 cho TINYINT(1)', async () => {
  const pool = fakePool((sql) => {
    if (sql.includes('SELECT area_id FROM search_area')) return [[{ area_id: 'a1' }, { area_id: 'a2' }]];
    if (sql.includes('WHERE area_id = ?')) return [[row({ area_id: 'a2' })]];
    return [[]];
  });
  const areas = createAreaService({ repository: createMysqlAreaRepository({ pool }) });
  await areas.update('a2', { is_active: false });
  assert.deepEqual(pool.log.find((entry) => entry.sql.startsWith('UPDATE')).params, [0, 'a2']);
});

test('tạo: INSERT đủ 9 cột, thứ tự hiển thị lấy MAX + 1, trùng tên báo 409', async () => {
  const pool = fakePool((sql) => {
    if (sql.includes('SELECT area_id FROM search_area')) return [[{ area_id: 'a1' }]];
    if (sql.includes('MAX(display_order)')) return [[{ max_order: '7' }]];
    return [[]];
  });
  const areas = createAreaService({ repository: createMysqlAreaRepository({ pool }), randomId: () => 'new-id' });
  const body = { name: 'Mới', short_label: 'M', anchor_address: 'Địa chỉ', anchor_latitude: 21, anchor_longitude: 105 };
  await areas.create(body);
  const insert = pool.log.find((entry) => entry.sql.startsWith('INSERT'));
  assert.deepEqual(insert.params, ['new-id', 'Mới', 'M', 'Địa chỉ', 21, 105, null, 8, 1]);
  assert.match(pool.log.find((entry) => entry.sql.includes('WHERE name = ?')).sql, /area_id <> \?/);

  const racing = fakePool((sql) => {
    if (sql.startsWith('INSERT')) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
    if (sql.includes('MAX(display_order)')) return [[{ max_order: 0 }]];
    return [[]];
  });
  const racingAreas = createAreaService({ repository: createMysqlAreaRepository({ pool: racing }) });
  await assert.rejects(racingAreas.create({ ...body, is_active: true }), { status: 409, code: 'DUPLICATE_AREA_NAME' });
  assert.ok(racing.connections[0].includes('rollback'));
});
