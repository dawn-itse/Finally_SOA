const test = require('node:test');
const assert = require('node:assert/strict');
const { withServer } = require('./helpers');
const { createDefaultContext } = require('../src/index');

const silent = { log() {}, warn() {}, error() {} };

test('map-config: chưa có Map Key thì style_url là null (frontend dùng nền OpenStreetMap)', async () => {
  await withServer({}, async ({ get, goongFake }) => {
    const legacy = await get('/api/geo/map-config');
    assert.equal(legacy.status, 200);
    assert.deepEqual(await legacy.json(), { data: { style_url: null } });
    const v1 = await get('/api/v1/geo/map-config');
    assert.deepEqual(await v1.json(), { success: true, data: { style_url: null } });
    assert.equal(goongFake.calls.length, 0, 'không gọi Goong');
  });
});

test('map-config: có Map Key thì trả URL style; chỉ hỗ trợ GET', async () => {
  const mapStyleUrl = 'https://tiles.goong.io/assets/goong_map_web.json?api_key=map-key';
  await withServer({ mapStyleUrl }, async ({ get, call }) => {
    assert.deepEqual(await (await get('/api/geo/map-config')).json(), { data: { style_url: mapStyleUrl } });
    const post = await call('POST', '/api/v1/geo/map-config', {});
    assert.equal(post.status, 405);
  });
});

test('createDefaultContext: style_url dùng GOONG_MAPTILES_KEY, không lộ GOONG_API_KEY', async () => {
  const withKey = createDefaultContext({ GOONG_API_KEY: 'secret-api-key', GOONG_MAPTILES_KEY: ' map key/1 ' }, silent);
  const { style_url } = await withKey.geo.mapConfig();
  assert.equal(style_url, 'https://tiles.goong.io/assets/goong_map_web.json?api_key=map%20key%2F1');
  assert.ok(!style_url.includes('secret-api-key'));

  const without = createDefaultContext({ GOONG_API_KEY: 'secret-api-key' }, silent);
  assert.deepEqual(await without.geo.mapConfig(), { style_url: null });
});

test('directions: trả polyline mã hóa để frontend vẽ tuyến', async () => {
  const points = 'mtm_C{cudSh@C^C';
  await withServer({
    goongHandler: () => ({
      status: 'OK',
      routes: [{ overview_polyline: { points }, legs: [{ distance: { value: 900 }, duration: { value: 200 }, steps: [] }] }]
    })
  }, async ({ get }) => {
    const { data } = await (await get('/api/geo/directions?origin=21,105&destination=21.1,105.1')).json();
    assert.equal(data.polyline, points);
    assert.equal(data.distance_m, 900);
  });
});
