const test = require('node:test');
const assert = require('node:assert/strict');
const { withServer, detailPayload, CENTER, json } = require('./helpers');

const goongRouter = (places) => (endpoint, params) => {
  if (endpoint === '/v2/place/autocomplete') {
    return { status: 'OK', predictions: Object.keys(places).map((id) => ({ place_id: id, description: `mô tả ${id}` })) };
  }
  if (endpoint === '/v2/place/detail') {
    const place = places[params.place_id];
    if (place instanceof Response) return place;
    return place ? detailPayload({ id: params.place_id, ...place }) : { status: 'NOT_FOUND' };
  }
  return { status: 'ZERO_RESULTS' };
};

test('proxy /api/geo/*: hợp đồng { data } / { error } như bản preview', async () => {
  await withServer({
    goongHandler: (endpoint) => {
      if (endpoint === '/v2/geocode') return { status: 'OK', results: [{ formatted_address: '68 Lê Văn Lương' }] };
      if (endpoint === '/v2/place/autocomplete') return { status: 'OK', predictions: [{ place_id: 'p1', description: 'Phở A' }] };
      return { status: 'ZERO_RESULTS' };
    }
  }, async ({ get }) => {
    const reverse = await get('/api/geo/reverse?latlng=21.0048,105.8042');
    assert.equal(reverse.status, 200);
    assert.deepEqual(await reverse.json(), { data: { address: '68 Lê Văn Lương' } });
    assert.equal(reverse.headers.get('cache-control'), 'no-store');

    const auto = await get('/api/geo/autocomplete?' + new URLSearchParams({ input: 'quán phở', location: '21.0048,105.8042', radius: '3' }));
    assert.deepEqual(await auto.json(), { data: [{ place_id: 'p1', description: 'Phở A' }] });

    const missing = await get('/api/geo/place-detail?place_id=none');
    assert.equal(missing.status, 404);
    assert.match((await missing.json()).error, /Goong/);

    assert.equal((await get('/api/geo/unknown')).status, 404);
    const post = await fetch(`${(await get('/api/geo/reverse?latlng=1,1')).url.split('/api')[0]}/api/geo/reverse`, { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET');
  });
});

test('proxy: autocomplete trống trả 200 { data: [] }', async () => {
  await withServer({}, async ({ get }) => {
    const response = await get('/api/geo/autocomplete?input=không có gì');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: [] });
  });
});

test('proxy: kiểm tra tham số trước khi gọi Goong (kể cả khi thiếu khóa)', async () => {
  await withServer({ apiKey: '' }, async ({ get, goongFake }) => {
    const cases = [
      '/api/geo/autocomplete?input=ab',
      '/api/geo/autocomplete?input=' + 'a'.repeat(201),
      '/api/geo/autocomplete?input=abcd&location=91,0',
      '/api/geo/autocomplete?input=abcd&radius=3',
      '/api/geo/autocomplete?input=abcd&location=21,105&radius=51',
      '/api/geo/autocomplete?input=abcd&location=21,105&radius=0',
      '/api/geo/place-detail',
      '/api/geo/place-detail?place_id=' + 'x'.repeat(513),
      '/api/geo/reverse?latlng=abc',
      '/api/geo/distance-matrix?origin=21,105',
      '/api/geo/distance-matrix?origin=21,105&destinations=' + Array(11).fill('21,105').join('|'),
      '/api/geo/distance-matrix?origin=21,105&destinations=21,105|x',
      '/api/geo/directions?origin=21,105'
    ];
    for (const path of cases) {
      const response = await get(path);
      assert.equal(response.status, 400, path);
      assert.equal((await response.json()).code, 'INVALID_REQUEST', path);
    }
    assert.equal(goongFake.calls.length, 0);
    const valid = await get('/api/geo/reverse?latlng=21,105');
    assert.equal(valid.status, 503);
    assert.equal((await valid.json()).code, 'GOONG_NOT_CONFIGURED');
  });
});

test('proxy: distance-matrix và directions', async () => {
  await withServer({
    goongHandler: (endpoint) => endpoint === '/v2/distancematrix'
      ? { rows: [{ elements: [{ status: 'OK', distance: { value: 900 }, duration: { value: 200 } }, { status: 'ZERO_RESULTS' }] }] }
      : { status: 'OK', routes: [{ legs: [{ distance: { value: 900 }, duration: { value: 200 }, steps: [{ html_instructions: '<b>Đi</b> thẳng' }] }] }] }
  }, async ({ get }) => {
    const matrix = await get('/api/geo/distance-matrix?origin=21,105&destinations=21.1,105.1|21.2,105.2');
    assert.deepEqual(await matrix.json(), { data: [{ distance_m: 900, duration_s: 200 }, null] });
    const route = await get('/api/geo/directions?origin=21,105&destination=21.1,105.1');
    assert.deepEqual(await route.json(), { data: { distance_m: 900, duration_s: 200, steps: ['Đi thẳng'], polyline: null } });
  });
});

test('proxy: lỗi Goong trả 502/503 với { error, code }', async () => {
  await withServer({ goongHandler: () => json({}, 429) }, async ({ get }) => {
    const response = await get('/api/geo/reverse?latlng=21,105');
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, 'GOONG_RATE_LIMITED');
    assert.equal(Object.hasOwn(body, 'success'), false);
  });
});

test('places/search: lọc bán kính, loại trùng, sắp theo khoảng cách', async () => {
  const places = {
    far: { name: 'Quán xa', lat: CENTER.lat + 0.05, lng: CENTER.lng },      // ~5,5 km
    near: { name: 'Quán gần', lat: CENTER.lat + 0.004, lng: CENTER.lng },   // ~445 m
    mid: { name: 'Quán giữa', lat: CENTER.lat, lng: CENTER.lng + 0.015 },   // ~1,6 km
    dup: { name: 'Quán gần (trùng)', lat: CENTER.lat + 0.004, lng: CENTER.lng, id: 'near' },
    gone: undefined
  };
  await withServer({ goongHandler: goongRouter(places) }, async ({ get, goongFake }) => {
    const query = new URLSearchParams({ keyword: 'quán bún bò', lat: String(CENTER.lat), lng: String(CENTER.lng), radius_km: '3' });
    const response = await get('/api/v1/geo/places/search?' + query);
    assert.equal(response.status, 200);
    const { success, data } = await response.json();
    assert.equal(success, true);
    assert.deepEqual(data.places.map((place) => place.name), ['Quán gần', 'Quán giữa']);
    assert.ok(data.places[0].distance_m > 400 && data.places[0].distance_m < 500);
    assert.equal(data.places[0].provider, 'GOONG');
    assert.equal(data.meta.candidates, 5);
    assert.deepEqual(goongFake.calls[0].params.location, `${CENTER.lat},${CENTER.lng}`);
    assert.equal(goongFake.calls[0].params.radius, '3');
    assert.equal(goongFake.calls[0].params.input, 'quán bún bò');
  });
});

test('places/search: một chi tiết lỗi thì bỏ qua, tất cả lỗi thì báo lỗi', async () => {
  const q = new URLSearchParams({ keyword: 'quán phở', lat: String(CENTER.lat), lng: String(CENTER.lng), radius_km: '3' });
  await withServer({ goongHandler: goongRouter({ ok: { name: 'Phở OK' }, boom: json({}, 500) }) }, async ({ get }) => {
    const { data } = await (await get('/api/v1/geo/places/search?' + q)).json();
    assert.deepEqual(data.places.map((place) => place.name), ['Phở OK']);
    assert.equal(data.meta.failed_details, 1);
  });
  await withServer({ goongHandler: goongRouter({ a: json({}, 500), b: json({}, 500) }) }, async ({ get }) => {
    const response = await get('/api/v1/geo/places/search?' + q);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, 'GOONG_UNAVAILABLE');
  });
  await withServer({}, async ({ get }) => {
    const { success, data } = await (await get('/api/v1/geo/places/search?' + q)).json();
    assert.equal(success, true);
    assert.deepEqual(data.places, []);
  });
});

test('places/search: kiểm tra tham số', async () => {
  await withServer({}, async ({ get, goongFake }) => {
    const base = { keyword: 'phở', lat: '21', lng: '105', radius_km: '3' };
    for (const patch of [{ keyword: 'a' }, { lat: '100' }, { lng: 'x' }, { radius_km: '0' }, { radius_km: '51' }, { limit: '0' }, { limit: '11' }, { limit: '2.5' }]) {
      const response = await get('/api/v1/geo/places/search?' + new URLSearchParams({ ...base, ...patch }));
      assert.equal(response.status, 400, JSON.stringify(patch));
    }
    assert.equal((await get('/api/v1/geo/places/search?keyword=phở')).status, 400);
    assert.equal(goongFake.calls.length, 0);
  });
});

test('areas công khai: chỉ liệt kê khu vực đang hoạt động, theo thứ tự hiển thị', async () => {
  await withServer({}, async ({ get }) => {
    const list = await (await get('/api/v1/geo/areas')).json();
    assert.equal(list.success, true);
    assert.deepEqual(list.data.map((area) => area.area_id), ['area-1', 'area-2']);
    assert.deepEqual(list.data[0], {
      area_id: 'area-1', name: 'Lê Văn Lương', short_label: 'LVL', anchor_address: '68 Lê Văn Lương', anchor_place_id: null,
      latitude: 21.0048, longitude: 105.8042, display_order: 1, is_active: true
    });
  });
});

test('areas/:id: hợp đồng của geoClient.getArea; khu vực ẩn trả is_active=false; không có trả 404', async () => {
  await withServer({}, async ({ get }) => {
    const one = await (await get('/api/v1/geo/areas/area-2')).json();
    assert.equal(one.success, true);
    assert.equal(one.data.latitude, 21.0051);
    assert.equal(one.data.longitude, 105.8432);
    assert.equal(one.data.is_active, true);
    assert.equal((await (await get('/api/v1/geo/areas/area-3')).json()).data.is_active, false);
    const missing = await get('/api/v1/geo/areas/nope');
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).code, 'AREA_NOT_FOUND');
    assert.equal((await get('/api/v1/geo/areas/bad%20id')).status, 400);
    assert.equal((await get('/api/v1/geo/areas/area-1/extra')).status, 404);
    const post = await fetch(`${(await get('/api/v1/geo/health')).url.replace('/health', '/areas')}`, { method: 'POST' });
    assert.equal(post.status, 405);
  });
});

test('health và route v1 không tồn tại', async () => {
  await withServer({}, async ({ get }) => {
    assert.deepEqual(await (await get('/api/v1/geo/health')).json(), { success: true, status: 'ok' });
    assert.equal((await get('/api/v1/geo/nothing')).status, 404);
  });
});

test('Express giữ cách khớp đường dẫn, query lặp và phản hồi HEAD/OPTIONS', async () => {
  await withServer({}, async ({ base, get, call, goongFake }) => {
    assert.equal((await get('/api/geo/reverse/?latlng=21,105')).status, 404);
    assert.equal((await get('/api/Geo/reverse?latlng=21,105')).status, 404);
    assert.equal((await get('/api/geo/reverse?latlng=21,105&latlng=invalid')).status, 404);
    assert.equal(goongFake.calls[0].params.latlng, '21,105');
    assert.equal((await get('/api/v1/geo//areas//area-1/')).status, 200);
    assert.equal((await get('/api/v1/geo/areas/%61rea-1')).status, 400);

    const head = await fetch(base + '/api/v1/geo/health', { method: 'HEAD' });
    assert.equal(head.status, 405);
    assert.equal(head.headers.get('allow'), 'GET');
    assert.equal(await head.text(), '');

    const options = await call('OPTIONS', '/api/internal/v1/geo//areas/');
    assert.equal(options.status, 405);
    assert.equal(options.headers.get('allow'), 'GET, POST');
    assert.equal((await options.json()).code, 'METHOD_NOT_ALLOWED');
  });
});
