const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, emptySeed, addRestaurant, fakeGeo, goongPlace, CENTER } = require('./helpers');

// ~0.009° vĩ độ ≈ 1 km
const north = (km) => CENTER.lat + km * 0.009;

test('tìm không dấu khớp món có dấu, đúng chuẩn hóa dùng chung với NLP', async () => {
  const seed = emptySeed();
  addRestaurant(seed, { name: 'Phở A', branches: [[north(1), CENTER.lng]], items: [['Phở bò chín', 45000]] });
  const { run } = await setup({ seed });
  for (const dish of ['pho bo', 'Phở Bò', 'phở  bò']) {
    const { source, results } = await run({ dish });
    assert.equal(source, 'CATALOG', dish);
    assert.equal(results[0].name, 'Phở A');
  }
});

test('khớp theo từ, không khớp một phần của từ', async () => {
  const seed = emptySeed();
  addRestaurant(seed, { name: 'Quán X', branches: [[north(1), CENTER.lng]], items: [['Phở bò chín', 40000]] });
  const { run, geo } = await setup({ seed });
  const { results } = await run({ dish: 'bo ch' });
  assert.equal(results.length, 0);
  assert.equal(geo.calls.autocomplete, 1); // catalog trống nên rơi xuống Geo
});

test('tên và giá phải thỏa trên cùng một món', async () => {
  const seed = emptySeed();
  addRestaurant(seed, {
    name: 'Quán đắt món, rẻ món khác', branches: [[north(1), CENTER.lng]],
    items: [['Phở bò đặc biệt', 80000], ['Cơm rang', 30000]]
  });
  const { run } = await setup({ seed });
  const { results } = await run({ max_price: 50000 });
  assert.equal(results.length, 0);
});

test('chỉ xét giá hiện hành: giá lịch sử và món ngừng bán bị bỏ qua', async () => {
  const seed = emptySeed();
  addRestaurant(seed, { name: 'Giá cũ', branches: [[north(1), CENTER.lng]], items: [['Phở bò', 30000, 30000, { current: false }]] });
  addRestaurant(seed, { name: 'Món ngừng', branches: [[north(1), CENTER.lng]], items: [['Phở bò', 30000, 30000, { status: 'INACTIVE' }]] });
  const { run } = await setup({ seed });
  assert.equal((await run({})).results.length, 0);
});

test('chỉ quán PUBLISHED xuất hiện trong results; khoản dư và khoảng giá được tính', async () => {
  const seed = emptySeed();
  addRestaurant(seed, { name: 'Chờ duyệt', status: 'PENDING', branches: [[north(1), CENTER.lng]], items: [['Phở bò', 30000]] });
  addRestaurant(seed, { name: 'Công khai', branches: [[north(1), CENTER.lng]], items: [['Phở bò', 40000, 45000]] });
  const { run } = await setup({ seed });
  const { results } = await run({ max_price: 50000 });
  assert.deepEqual(results.map((r) => r.name), ['Công khai']);
  assert.equal(results[0].starting_price, 40000);
  assert.equal(results[0].starting_max_price, 45000);
  assert.equal(results[0].leftover, 10000);
  assert.equal(results[0].matched_items[0].price_updated_at, '2024-01-01T00:00:00.000Z');
});

test('loại quán ngoài bán kính; chọn chi nhánh gần nhất khi chi nhánh chính ở xa', async () => {
  const seed = emptySeed();
  addRestaurant(seed, { name: 'Quá xa', branches: [[north(6), CENTER.lng, true]], items: [['Phở bò', 40000]] });
  const branchId = addRestaurant(seed, {
    name: 'Nhiều chi nhánh',
    branches: [[north(6), CENTER.lng, true], [north(1), CENTER.lng, false]],
    items: [['Phở bò', 40000]]
  });
  const { run } = await setup({ seed });
  const { results } = await run({ radius_km: 3 });
  assert.equal(results.length, 1);
  assert.equal(results[0].restaurant_id, branchId);
  assert.equal(results[0].location.address_text, 'Nhiều chi nhánh chi nhánh 2');
  assert.ok(results[0].distance_km > 0.9 && results[0].distance_km < 1.1);
  assert.equal(results[0].distance_basis, 'STRAIGHT_LINE');
});

test('mỗi quán chỉ xuất hiện một lần dù nhiều chi nhánh trong bán kính', async () => {
  const seed = emptySeed();
  addRestaurant(seed, { name: 'Hai nhánh gần', branches: [[north(1), CENTER.lng, true], [north(2), CENTER.lng]], items: [['Phở bò', 40000]] });
  const { run } = await setup({ seed });
  const { results, meta } = await run({});
  assert.equal(results.length, 1);
  assert.equal(meta.total_matched, 1);
});

test('không trả verified_by cho khách', async () => {
  const seed = emptySeed();
  addRestaurant(seed, { name: 'Đã xác minh', verified: true, branches: [[north(1), CENTER.lng]], items: [['Phở bò', 40000]] });
  const { run } = await setup({ seed });
  const [item] = (await run({})).results;
  assert.equal(item.verified, true);
  assert.equal(item.verification_label, 'Đã xác minh');
  assert.ok(!('verified_by' in item));
  assert.ok(!JSON.stringify(item).includes('admin-1'));
});

test('bốn kiểu sắp xếp', async () => {
  const seed = emptySeed();
  addRestaurant(seed, { name: 'Gần, đắt, chưa xác minh', branches: [[north(0.5), CENTER.lng]], items: [['Phở bò', 48000]] });
  addRestaurant(seed, { name: 'Xa, rẻ, chưa xác minh', branches: [[north(2.5), CENTER.lng]], items: [['Phở bò', 30000]] });
  addRestaurant(seed, { name: 'Vừa, đã xác minh', verified: true, branches: [[north(1.5), CENTER.lng]], items: [['Phở bò', 40000]] });
  const ratings = new Map([
    ['Gần, đắt, chưa xác minh', { rating: 4.9, reviewCount: 10 }],
    ['Xa, rẻ, chưa xác minh', { rating: 3.0, reviewCount: 2 }],
    ['Vừa, đã xác minh', { rating: 4.2, reviewCount: 30 }]
  ]);
  const reviewClient = {
    async getRatingStats(ids) {
      const byName = new Map(seed.restaurant.map((r) => [r.restaurant_id, r.name]));
      return new Map(ids.map((rid) => [rid, ratings.get(byName.get(rid))]));
    }
  };
  const { run } = await setup({ seed, reviewClient });
  const names = async (sort_by) => (await run({ sort_by })).results.map((r) => r.name);

  assert.deepEqual(await names('distance'), ['Gần, đắt, chưa xác minh', 'Vừa, đã xác minh', 'Xa, rẻ, chưa xác minh']);
  assert.deepEqual(await names('price'), ['Xa, rẻ, chưa xác minh', 'Vừa, đã xác minh', 'Gần, đắt, chưa xác minh']);
  assert.deepEqual(await names('rating'), ['Gần, đắt, chưa xác minh', 'Vừa, đã xác minh', 'Xa, rẻ, chưa xác minh']);
  assert.deepEqual(await names('recommended'), ['Vừa, đã xác minh', 'Gần, đắt, chưa xác minh', 'Xa, rẻ, chưa xác minh']);
});

test('thiếu Review Service vẫn tìm được, rating là null', async () => {
  const seed = emptySeed();
  addRestaurant(seed, { name: 'A', branches: [[north(1), CENTER.lng]], items: [['Phở bò', 40000]] });
  const { run } = await setup({ seed });
  const [item] = (await run({ sort_by: 'rating' })).results;
  assert.equal(item.rating, null);
  assert.equal(item.review_count, null);
});

test('limit cắt danh sách nhưng total_matched giữ tổng số quán', async () => {
  const seed = emptySeed();
  for (let i = 1; i <= 4; i += 1) addRestaurant(seed, { name: `Q${i}`, branches: [[north(i * 0.4), CENTER.lng]], items: [['Phở bò', 40000]] });
  const { run } = await setup({ seed });
  const { results, meta } = await run({ limit: 2, sort_by: 'distance' });
  assert.deepEqual(results.map((r) => r.name), ['Q1', 'Q2']);
  assert.equal(meta.total_matched, 4);
});

test('catalog đủ 3 quán thì không gọi Geo Service và không trả gợi ý', async () => {
  const seed = emptySeed();
  for (const km of [0.5, 1, 1.5, 2]) {
    addRestaurant(seed, { name: `Quán ${km}`, branches: [[north(km), CENTER.lng]], items: [['Phở bò', 40000]] });
  }
  const geo = fakeGeo({ places: [goongPlace()] });
  const { run } = await setup({ seed, geo });
  const out = await run({});
  assert.equal(out.source, 'CATALOG');
  assert.equal(out.results.length, 3, 'tối đa 3 quán dù catalog có 4');
  assert.equal(out.meta.total_matched, 4);
  assert.deepEqual(out.suggestions, []);
  assert.deepEqual(geo.calls, { autocomplete: 0, placeDetail: 0, distanceMatrix: 0, getArea: 0 });
});

test('include_route gắn quãng đường theo tuyến, lỗi thì giữ số đo đường chim bay', async () => {
  const seed = emptySeed();
  addRestaurant(seed, { name: 'A', branches: [[north(1), CENTER.lng]], items: [['Phở bò', 40000]] });
  const geo = fakeGeo({ matrix: (dest) => dest.map(() => ({ distance_m: 1400, duration_s: 300 })) });
  const withRoute = await (await setup({ seed, geo })).run({ include_route: true });
  assert.deepEqual(withRoute.results[0].route, { distance_m: 1400, duration_s: 300, mode: 'MOTORBIKE', source: 'GOONG' });
  assert.equal(geo.calls.distanceMatrix, 1);

  const failing = fakeGeo({ matrix: () => { throw new Error('boom'); } });
  const fallback = await (await setup({ seed, geo: failing })).run({ include_route: true });
  assert.equal(fallback.results[0].route, null);
  assert.ok(fallback.results[0].distance_m > 0);
});

test('anchor AREA lấy mốc từ Geo Service; khu vực lạ hoặc bị ẩn trả 404', async () => {
  const seed = emptySeed();
  addRestaurant(seed, { name: 'A', branches: [[north(1), CENTER.lng]], items: [['Phở bò', 40000]] });
  const geo = fakeGeo({ areas: {
    'area-1': { area_id: 'area-1', latitude: CENTER.lat, longitude: CENTER.lng, is_active: true },
    'area-off': { area_id: 'area-off', latitude: CENTER.lat, longitude: CENTER.lng, is_active: false }
  } });
  const { run } = await setup({ seed, geo });
  const ok = await run({ anchor: { source: 'AREA', area_id: 'area-1' } });
  assert.equal(ok.results.length, 1);
  assert.deepEqual(ok.meta.anchor, { source: 'AREA', latitude: CENTER.lat, longitude: CENTER.lng, area_id: 'area-1' });

  for (const area_id of ['nope', 'area-off']) {
    await assert.rejects(run({ anchor: { source: 'AREA', area_id } }), { status: 404, code: 'AREA_NOT_FOUND' });
  }
  const down = { ...fakeGeo(), getArea: async () => { throw new Error('down'); } };
  await assert.rejects((await setup({ geo: down })).run({ anchor: { source: 'AREA', area_id: 'area-1' } }), { status: 503, code: 'GEO_UNAVAILABLE' });
});
