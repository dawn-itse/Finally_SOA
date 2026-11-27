const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createRestaurantSearchHandler } = require('../src/index');
const { createCatalogAdminService } = require('../src/admin/catalogAdminService');
const { setup, emptySeed, addRestaurant, silentLogger, CENTER } = require('./helpers');

const TOKEN = 'test-internal-token';
const BASE_PATH = '/api/internal/v1';

async function withServer({ token = TOKEN, seed = emptySeed(), repositoryPatch } = {}, fn) {
  const { service, repository, dishText } = await setup({ seed });
  if (repositoryPatch) Object.assign(repository, repositoryPatch(repository));
  const catalogAdmin = createCatalogAdminService({ repository, dishText });
  const context = { service, repository, dishText, catalogAdmin, internalToken: token };
  const handle = createRestaurantSearchHandler(async () => context, silentLogger);
  const server = createServer((req, res) => void handle(req, res, new URL(req.url, 'http://localhost')));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, path, body, headers = {}) => fetch(base + BASE_PATH + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Internal-Token': TOKEN, ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  });
  try {
    await fn({ base, call, repository });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

const newRestaurant = (overrides = {}) => ({
  name: 'Quán HTTP', acted_by: 'admin-0001', source_ref: 'contrib/http-1',
  location: { provider: 'MANUAL', address_text: '1 Lê Văn Lương', latitude: CENTER.lat + 0.004, longitude: CENTER.lng },
  menu_items: [{ name: 'Phở bò', price: { min_price: 45000 } }],
  ...overrides
});

test('xác thực: tắt khi chưa đặt token, 401 khi thiếu hoặc sai token', async () => {
  await withServer({ token: null }, async ({ call }) => {
    const res = await call('GET', '/restaurants');
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, 'INTERNAL_API_DISABLED');
  });
  await withServer({}, async ({ call }) => {
    assert.equal((await call('GET', '/restaurants', undefined, { 'X-Internal-Token': 'sai' })).status, 401);
    assert.equal((await call('GET', '/restaurants', undefined, { 'X-Internal-Token': '' })).status, 401);
    const noHeader = await call('GET', '/restaurants/x', undefined, { 'X-Internal-Token': undefined });
    assert.equal(noHeader.status, 401);
    assert.equal((await call('POST', '/restaurants', newRestaurant(), { 'X-Internal-Token': 'sai' })).status, 401);
    assert.equal((await call('GET', '/restaurants')).status, 200);
  });
});

test('luồng đầy đủ qua HTTP: tạo quán, áp dụng giá, gỡ giá, đổi trạng thái', async () => {
  await withServer({}, async ({ call, base }) => {
    const created = await call('POST', '/restaurants', newRestaurant());
    assert.equal(created.status, 201);
    const { data } = await created.json();
    const restaurantId = data.after.restaurant_id;
    const itemId = data.after.menu_items[0].menu_item_id;

    const replay = await call('POST', '/restaurants', newRestaurant());
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).data.replayed, true);

    const price = await call('POST', `/menu-items/${itemId}/prices`, { min_price: 48000, source_reference: 'report-1', acted_by: 'admin-0002' });
    assert.equal(price.status, 201);
    const priceData = (await price.json()).data;
    assert.equal(priceData.after.current_price.min_price, 48000);
    assert.equal(priceData.before.current_price.min_price, 45000);

    const sameAgain = await call('POST', `/menu-items/${itemId}/prices`, { min_price: 48000, source_reference: 'report-1', acted_by: 'admin-0002' });
    assert.equal(sameAgain.status, 200, 'duyệt lại cùng báo cáo không phải tạo mới');

    const item = (await (await call('GET', `/menu-items/${itemId}`)).json()).data;
    assert.equal(item.price_history.length, 2);
    assert.equal(item.restaurant.verified_by, 'admin-0002');

    const publicSearch = await fetch(`${base}/api/v1/restaurants/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dish: 'phở bò', max_price: 50000, radius_km: 2, anchor: { source: 'GPS', lat: CENTER.lat, lng: CENTER.lng } })
    });
    assert.equal((await publicSearch.json()).data.results[0].starting_price, 48000);

    const withdrawn = await call('POST', `/menu-items/${itemId}/prices/withdraw`, { acted_by: 'admin-0001' });
    assert.equal(withdrawn.status, 200);
    assert.equal((await withdrawn.json()).data.menu_item.price_status, 'NO_PRICE');

    const suspended = await call('POST', `/restaurants/${restaurantId}/status`, { visibility_status: 'SUSPENDED', acted_by: 'admin-0001' });
    assert.equal((await suspended.json()).data.after.visibility_status, 'SUSPENDED');

    const queue = await (await call('GET', '/restaurants?status=SUSPENDED&limit=5')).json();
    assert.equal(queue.data.total, 1);
    assert.equal(queue.data.restaurants[0].primary_location.address_text, '1 Lê Văn Lương');
  });
});

test('lỗi: mã trạng thái và details đúng, không lộ chi tiết nội bộ', async () => {
  await withServer({ seed: (() => { const seed = emptySeed(); addRestaurant(seed, { name: 'Có sẵn', branches: [[CENTER.lat, CENTER.lng]] }); return seed; })() }, async ({ call }) => {
    const goong = { provider: 'GOONG', provider_place_id: 'gp-http', geocoded_at: '2026-11-26T05:00:00Z', address_text: 'x', latitude: 21, longitude: 105 };
    assert.equal((await call('POST', '/restaurants', newRestaurant({ source_ref: null, location: goong }))).status, 201);
    const dup = await call('POST', '/restaurants', newRestaurant({ source_ref: null, location: goong }));
    assert.equal(dup.status, 409);
    const dupBody = await dup.json();
    assert.equal(dupBody.code, 'DUPLICATE_LOCATION');
    assert.ok(dupBody.details.restaurant_id);

    assert.equal((await call('GET', '/restaurants/khong-co')).status, 404);
    assert.equal((await call('GET', '/restaurants/co%20khoang%20trang')).status, 400);
    assert.equal((await call('GET', '/nope')).status, 404);
    const wrongMethod = await call('DELETE', '/restaurants/abc');
    assert.equal(wrongMethod.status, 405);
    assert.match(wrongMethod.headers.get('allow'), /GET/);
    assert.equal((await call('POST', '/restaurants', '{oops')).status, 400);
    assert.equal((await call('POST', '/restaurants', { name: 'thiếu' })).status, 400);
    assert.equal((await call('POST', '/restaurants', 'x', { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await call('POST', '/restaurants', JSON.stringify({ pad: 'x'.repeat(17 * 1024) }))).status, 413);
    assert.equal((await call('POST', '/restaurants', JSON.stringify({ ...newRestaurant(), ['__proto__']: { admin: true } }))).status, 400);
    assert.equal((await call('GET', '/restaurants?limit=abc')).status, 400);
  });
});

test('lỗi hạ tầng trả 500 chung; ER_DUP_ENTRY trả 409', async () => {
  const failing = (code, message) => (repository) => ({
    transaction: async () => { throw Object.assign(new Error(message), { code }); },
    ping: repository.ping
  });
  await withServer({ repositoryPatch: failing('ER_ACCESS_DENIED_ERROR', 'secret-host denied') }, async ({ call }) => {
    const res = await call('GET', '/restaurants/abc');
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.ok(!text.includes('secret-host'));
    assert.equal(JSON.parse(text).code, 'INTERNAL_ERROR');
  });
  await withServer({ repositoryPatch: failing('ER_DUP_ENTRY', 'Duplicate entry') }, async ({ call }) => {
    const res = await call('POST', '/restaurants', newRestaurant());
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'CONFLICT');
  });
});
