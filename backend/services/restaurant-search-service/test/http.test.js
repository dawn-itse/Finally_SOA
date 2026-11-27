const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createRestaurantSearchApp } = require('../src/index');
const { setup, emptySeed, addRestaurant, silentLogger, CENTER } = require('./helpers');

async function withServer(context, fn) {
  const app = createRestaurantSearchApp(async () => context, silentLogger);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

const post = (base, body, headers = { 'Content-Type': 'application/json' }, path = '/api/v1/restaurants/search') =>
  fetch(base + path, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('POST /api/v1/restaurants/search trả 200 và các lỗi đúng mã', async () => {
  const seed = emptySeed();
  addRestaurant(seed, { name: 'Phở HTTP', branches: [[CENTER.lat + 0.009, CENTER.lng]], items: [['Phở bò', 40000]] });
  const { service, repository, dishText } = await setup({ seed });

  await withServer({ service, repository, dishText }, async (base) => {
    const ok = await post(base, { dish: 'pho bo', max_price: 50000, radius_km: 2, anchor: { source: 'GPS', lat: CENTER.lat, lng: CENTER.lng } });
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /application\/json/);
    const json = await ok.json();
    assert.equal(json.success, true);
    assert.equal(json.data.source, 'CATALOG');
    assert.equal(json.data.results[0].name, 'Phở HTTP');

    assert.equal((await post(base, '{oops')).status, 400);
    assert.equal((await post(base, { dish: 'phở bò' })).status, 400);
    assert.equal((await post(base, { dish: '50k phở', max_price: 5, radius_km: 1, anchor: { source: 'GPS', lat: 1, lng: 1 } })).status, 422);
    assert.equal((await post(base, '{}', { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post(base, JSON.stringify({ pad: 'x'.repeat(5000) }))).status, 413);
    assert.equal((await fetch(base + '/api/v1/restaurants/search')).status, 405);
    assert.equal((await fetch(base + '/api/v1/restaurants/nope')).status, 404);

    const health = await fetch(base + '/api/v1/restaurants/health');
    assert.equal(health.status, 200);
  });
});

test('lỗi hạ tầng trả 500 chung, không lộ chi tiết nội bộ', async () => {
  const { dishText } = await setup();
  const repository = { async searchCatalog() { throw new Error('ER_ACCESS_DENIED secret-host'); } };
  const geo = { async getArea() { return null; } };
  const { createSearchService } = require('../src/searchService');
  const service = createSearchService({ repository, geoClient: geo, dishText, logger: silentLogger });

  await withServer({ service, repository, dishText }, async (base) => {
    const res = await post(base, { dish: 'phở bò', max_price: 50000, radius_km: 2, anchor: { source: 'GPS', lat: CENTER.lat, lng: CENTER.lng } });
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.ok(!text.includes('secret-host'));
    assert.equal(JSON.parse(text).code, 'INTERNAL_ERROR');
  });
});
