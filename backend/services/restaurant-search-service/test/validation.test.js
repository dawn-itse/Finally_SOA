const test = require('node:test');
const assert = require('node:assert/strict');
const { loadDishText } = require('../src/dishText');
const { parseSearchRequest } = require('../src/validation');

const valid = { dish: 'Phở bò', max_price: 50000, radius_km: 2, anchor: { source: 'GPS', lat: 21.0048, lng: 105.8042 } };

test('request hợp lệ được chuẩn hóa và gắn giá trị mặc định', async () => {
  const dishText = await loadDishText();
  const parsed = parseSearchRequest(valid, dishText);
  assert.equal(parsed.normalizedDish, 'pho bo');
  assert.equal(parsed.sortBy, 'recommended');
  assert.equal(parsed.limit, 20);
  assert.equal(parsed.includeRoute, false);
  assert.deepEqual(parsed.anchor, { source: 'GPS', lat: 21.0048, lng: 105.8042 });
});

test('từ chối đầu vào sai', async () => {
  const dishText = await loadDishText();
  const bad = (override, status, code) => assert.throws(
    () => parseSearchRequest({ ...valid, ...override }, dishText), { status, code }, JSON.stringify(override)
  );

  bad({ dish: undefined }, 400, 'INVALID_REQUEST');
  bad({ dish: 42 }, 400, 'INVALID_REQUEST');
  bad({ dish: '50k phở bò' }, 422, 'INVALID_DISH'); // giá phải đi qua bộ lọc, không nằm trong tên món
  bad({ dish: '' }, 422, 'INVALID_DISH');
  bad({ max_price: 0 }, 400, 'INVALID_REQUEST');
  bad({ max_price: 49999.5 }, 400, 'INVALID_REQUEST');
  bad({ max_price: '50000' }, 400, 'INVALID_REQUEST');
  bad({ max_price: 1e9 }, 400, 'INVALID_REQUEST');
  bad({ radius_km: 0 }, 400, 'INVALID_REQUEST');
  bad({ radius_km: 51 }, 400, 'INVALID_REQUEST');
  bad({ radius_km: '3' }, 400, 'INVALID_REQUEST');
  bad({ sort_by: 'cheapest' }, 400, 'INVALID_REQUEST');
  bad({ limit: 0 }, 400, 'INVALID_REQUEST');
  bad({ limit: 51 }, 400, 'INVALID_REQUEST');
  bad({ include_route: 'yes' }, 400, 'INVALID_REQUEST');
  bad({ anchor: undefined }, 400, 'INVALID_REQUEST');
  bad({ anchor: { source: 'IP' } }, 400, 'INVALID_REQUEST');
  bad({ anchor: { source: 'GPS', lat: 91, lng: 0 } }, 400, 'INVALID_REQUEST');
  bad({ anchor: { source: 'GPS', lat: '21', lng: 105 } }, 400, 'INVALID_REQUEST');
  bad({ anchor: { source: 'AREA' } }, 400, 'INVALID_REQUEST');
  bad({ anchor: { source: 'AREA', area_id: '../etc/passwd' } }, 400, 'INVALID_REQUEST');
  assert.throws(() => parseSearchRequest(null, dishText), { status: 400 });
  assert.throws(() => parseSearchRequest([], dishText), { status: 400 });
});
