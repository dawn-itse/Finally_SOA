const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoongClient } = require('../src/goongClient');
const { fakeGoong, detailPayload, json, silentLogger } = require('./helpers');

const make = (handler, extra = {}) => {
  const fake = fakeGoong(handler);
  const client = createGoongClient({ apiKey: 'secret-key', fetchImpl: fake.fetchImpl, now: () => new Date('2026-11-27T05:00:00Z'), logger: silentLogger, ...extra });
  return { fake, client };
};

test('autocomplete: gửi tham số Goong V2, chuẩn hóa và cắt còn 5 gợi ý', async () => {
  const predictions = Array.from({ length: 7 }, (_, i) => ({ place_id: `p${i}`, description: `Quán ${i}`, extra: 'bỏ' }));
  predictions.push({ place_id: '', description: 'thiếu id' });
  const { fake, client } = make(() => ({ status: 'OK', predictions }));
  const result = await client.autocomplete({ input: 'quán bún bò', location: '21.0048,105.8042', radiusKm: 3 });
  assert.deepEqual(result.map((item) => item.place_id), ['p0', 'p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(Object.keys(result[0]), ['place_id', 'description']);
  assert.deepEqual(fake.calls[0].params, {
    input: 'quán bún bò', limit: '5', more_compound: 'true', has_deprecated_administrative_unit: 'true', location: '21.0048,105.8042', radius: '3'
  });
  assert.equal(fake.calls[0].endpoint, '/v2/place/autocomplete');
  assert.equal(fake.calls[0].apiKey, 'secret-key');
});

test('autocomplete: ZERO_RESULTS trả mảng rỗng', async () => {
  const { client } = make(() => ({ status: 'ZERO_RESULTS', predictions: [] }));
  assert.deepEqual(await client.autocomplete({ input: 'abc' }), []);
});

test('placeDetail: ánh xạ sang cột RESTAURANT_LOCATION', async () => {
  const { fake, client } = make(() => detailPayload({ id: 'pid-1', name: ' Phở Thìn ', address: '13 Lò Đúc', lat: 21.01, lng: 105.85 }));
  const place = await client.placeDetail('pid-1');
  assert.deepEqual(place, {
    provider: 'GOONG', provider_place_id: 'pid-1', name: 'Phở Thìn', types: ['restaurant'], address_text: '13 Lò Đúc',
    latitude: 21.01, longitude: 105.85, commune: 'Phường A', province: 'Hà Nội', deprecated_address_text: 'Địa chỉ cũ',
    geocoded_at: '2026-11-27T05:00:00.000Z'
  });
  assert.equal(fake.calls[0].params.has_deprecated_administrative_unit, 'true');
});

test('placeDetail: NOT_FOUND trả null, thiếu tọa độ là lỗi 502', async () => {
  assert.equal(await make(() => ({ status: 'NOT_FOUND' })).client.placeDetail('x'), null);
  const broken = make(() => ({ status: 'OK', result: { formatted_address: 'x' } }));
  await assert.rejects(broken.client.placeDetail('x'), { status: 502, code: 'GOONG_BAD_RESPONSE' });
});

test('reverse, distanceMatrix và directions', async () => {
  const { fake, client } = make((endpoint) => {
    if (endpoint === '/v2/geocode') return { status: 'OK', results: [{ formatted_address: '68 Lê Văn Lương' }] };
    if (endpoint === '/v2/distancematrix') {
      return { rows: [{ elements: [
        { status: 'OK', distance: { value: 1200 }, duration: { value: 300 } },
        { status: 'NOT_FOUND' },
        { status: 'OK', distance: { value: -1 }, duration: { value: 5 } }
      ] }] };
    }
    return { status: 'OK', routes: [{ overview_polyline: { points: 'abc~' }, legs: [{
      distance: { value: 2500 }, duration: { value: 600 },
      steps: [{ html_instructions: 'Đi thẳng <b>500 m</b>' }, { html_instructions: '' }, { html_instructions: 'Rẽ <b>phải</b>' }]
    }] }] };
  });
  assert.deepEqual(await client.reverse('21.0,105.8'), { address: '68 Lê Văn Lương' });
  assert.deepEqual(await client.distanceMatrix({ origin: '21,105', destinations: ['21.1,105.1', '21.2,105.2', '21.3,105.3'] }), [
    { distance_m: 1200, duration_s: 300 }, null, null
  ]);
  assert.equal(fake.calls[1].params.destinations, '21.1,105.1|21.2,105.2|21.3,105.3');
  assert.equal(fake.calls[1].params.vehicle, 'motorcycle');
  assert.deepEqual(await client.directions({ origin: '21,105', destination: '21.1,105.1' }), {
    distance_m: 2500, duration_s: 600, steps: ['Đi thẳng 500 m', 'Rẽ phải'], polyline: 'abc~'
  });
  assert.equal(fake.calls[2].params.vehicle, 'car'); // Directions V2 chỉ nhận car/bike
});

test('distanceMatrix: số phần tử khác số điểm đến là lỗi 502', async () => {
  const { client } = make(() => ({ rows: [{ elements: [{ status: 'OK', distance: { value: 1 }, duration: { value: 1 } }] }] }));
  await assert.rejects(client.distanceMatrix({ origin: '21,105', destinations: ['21,105', '22,105'] }), { code: 'GOONG_BAD_RESPONSE' });
});

test('thiếu khóa: 503 và không gọi mạng', async () => {
  const { fake, client } = make(() => ({}), { apiKey: '  ' });
  assert.equal(client.configured, false);
  await assert.rejects(client.reverse('21,105'), { status: 503, code: 'GOONG_NOT_CONFIGURED' });
  assert.equal(fake.calls.length, 0);
});

test('lỗi upstream: 429 -> 503, lỗi khác và mất kết nối -> 502, JSON hỏng -> 502', async () => {
  await assert.rejects(make(() => json({}, 429)).client.reverse('21,105'), { status: 503, code: 'GOONG_RATE_LIMITED' });
  await assert.rejects(make(() => json({}, 500)).client.reverse('21,105'), { status: 502, code: 'GOONG_UNAVAILABLE' });
  await assert.rejects(make(() => ({ status: 'OVER_QUERY_LIMIT' })).client.reverse('21,105'), { status: 503 });
  await assert.rejects(make(() => ({ status: 'REQUEST_DENIED' })).client.reverse('21,105'), { status: 502 });
  await assert.rejects(make(() => new Response('<html>', { status: 200 })).client.reverse('21,105'), { status: 502 });
  const offline = createGoongClient({ apiKey: 'k', fetchImpl: async () => { throw new TypeError('fetch failed'); }, logger: silentLogger });
  await assert.rejects(offline.reverse('21,105'), { status: 502, code: 'GOONG_UNAVAILABLE' });
});

test('khóa API không lọt vào thông báo lỗi', async () => {
  const { client } = make(() => json({}, 500));
  await assert.rejects(client.reverse('21,105'), (error) => !JSON.stringify(error).includes('secret-key') && !error.message.includes('secret-key'));
});

test('hai lượt gọi giống hệt nhau cùng lúc chỉ gọi Goong một lần, sau đó gọi lại bình thường', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { fake, client } = make(async () => { await gate; return { status: 'OK', results: [{ formatted_address: 'A' }] }; });
  const first = client.reverse('21,105');
  const second = client.reverse('21,105');
  release();
  assert.deepEqual(await Promise.all([first, second]), [{ address: 'A' }, { address: 'A' }]);
  assert.equal(fake.calls.length, 1);
  await client.reverse('21,105');
  assert.equal(fake.calls.length, 2);
});
