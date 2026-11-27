const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, emptySeed, addRestaurant, fakeGeo, goongPlace, CENTER } = require('./helpers');

const north = (km) => CENTER.lat + km * 0.009;

function catalogOf(count) {
  const seed = emptySeed();
  for (let i = 1; i <= count; i += 1) {
    addRestaurant(seed, { name: `Quán catalog ${i}`, branches: [[north(i), CENTER.lng]], items: [['Phở bò', 40000]] });
  }
  return seed;
}

const goongPlaces = (count) => Array.from({ length: count }, (_, i) => goongPlace({
  provider_place_id: `goong-${i + 1}`,
  name: `Quán Phở Bò Goong ${i + 1}`,
  address_text: `${i + 1} Lê Văn Lương, Hà Nội`,
  latitude: CENTER.lat + (i + 1) * 0.0005
}));

const total = (out) => out.results.length + out.suggestions.length;

test('catalog 2 quán, Goong có thêm: quét bù đúng 1 quán cho đủ 3', async () => {
  const geo = fakeGeo({ places: goongPlaces(3) });
  const { run } = await setup({ seed: catalogOf(2), geo });
  const out = await run({});
  assert.equal(out.source, 'CATALOG');
  assert.equal(out.results.length, 2);
  assert.equal(out.suggestions.length, 1);
  assert.equal(total(out), 3);
  assert.equal(out.suggestions[0].source, 'GOONG');
  assert.equal(geo.calls.autocomplete, 1);
});

test('catalog 2 quán, Goong không tìm thấy gì: trả đúng 2 quán', async () => {
  const geo = fakeGeo({ places: [] });
  const { run } = await setup({ seed: catalogOf(2), geo });
  const out = await run({});
  assert.equal(out.source, 'CATALOG');
  assert.equal(out.results.length, 2);
  assert.deepEqual(out.suggestions, []);
  assert.equal(geo.calls.autocomplete, 1, 'có thử quét');
});

test('catalog 2 quán, Goong lỗi: vẫn trả 2 quán, không báo lỗi', async () => {
  const geo = fakeGeo({ failAutocomplete: true });
  const { run } = await setup({ seed: catalogOf(2), geo });
  const out = await run({});
  assert.equal(out.results.length, 2);
  assert.deepEqual(out.suggestions, []);
});

test('catalog 2 quán + 1 gợi ý đã lưu: đủ 3 nên lần sau không gọi Goong nữa', async () => {
  const geo = fakeGeo({ places: goongPlaces(1) });
  const { run, repository } = await setup({ seed: catalogOf(2), geo });

  const first = await run({}); // chưa có gợi ý nào: quét Goong bù 1 quán và lưu
  assert.equal(total(first), 3);
  assert.equal(geo.calls.autocomplete, 1);
  assert.equal(repository._table('restaurant_discovery').length, 1);

  const second = await run({}); // 2 catalog + 1 gợi ý trong kho = 3
  assert.equal(second.results.length, 2);
  assert.equal(second.suggestions.length, 1);
  assert.equal(geo.calls.autocomplete, 1, 'đủ 3 từ catalog + kho, không gọi Goong thêm');
});

test('catalog 1 + gợi ý đã lưu 1 + Goong tìm thêm: tổng 3, không quán nào lặp lại', async () => {
  const places = goongPlaces(1);
  const geo = fakeGeo({ places });
  const { run, repository } = await setup({ seed: catalogOf(1), geo });

  const first = await run({}); // catalog 1 + goong-1 = 2, vẫn thiếu
  assert.equal(total(first), 2);

  places.push(...goongPlaces(3).slice(1)); // Goong giờ trả thêm goong-2, goong-3
  const out = await run({});
  assert.equal(out.results.length, 1);
  assert.equal(out.suggestions.length, 2);
  assert.equal(total(out), 3);
  const ids = [...out.results, ...out.suggestions].map((item) => item.restaurant_id);
  assert.equal(new Set(ids).size, 3);
  assert.equal(repository._table('restaurant').filter((r) => r.visibility_status === 'PENDING').length, 3, 'cả 3 địa điểm Goong đã được lưu PENDING');
});

test('quán catalog cũng nằm trong kết quả Goong: không lặp lại ở gợi ý', async () => {
  const seed = catalogOf(1);
  // Biến chi nhánh duy nhất của quán catalog thành địa điểm Goong trùng với kết quả quét.
  const [location] = seed.restaurant_location;
  Object.assign(location, { provider: 'GOONG', provider_place_id: 'goong-1', geocoded_at: '2026-11-27T01:00:00.000Z' });
  const geo = fakeGeo({ places: goongPlaces(2) });
  const { run } = await setup({ seed, geo });
  const out = await run({});
  assert.equal(out.results.length, 1);
  assert.equal(out.suggestions.length, 1, 'chỉ còn goong-2');
  assert.equal(out.suggestions[0].name, 'Quán Phở Bò Goong 2');
  assert.notEqual(out.suggestions[0].restaurant_id, out.results[0].restaurant_id);
});

test('catalog rỗng, Goong có nhiều: tối đa 3 gợi ý', async () => {
  const geo = fakeGeo({ places: goongPlaces(5) });
  const { run } = await setup({ geo });
  const out = await run({});
  assert.equal(out.source, 'GEO');
  assert.deepEqual(out.results, []);
  assert.equal(out.suggestions.length, 3);
});

test('limit nhỏ hơn 3 vẫn được tôn trọng', async () => {
  const geo = fakeGeo({ places: goongPlaces(3) });
  const { run } = await setup({ seed: catalogOf(1), geo });
  const out = await run({ limit: 2 });
  assert.equal(total(out), 2);
  const one = await run({ limit: 1 });
  assert.equal(one.results.length, 1);
  assert.deepEqual(one.suggestions, []);
});

test('quán catalog đã có mã Goong: quét Goong không thêm quán mới và không ghi vào restaurant_discovery', async () => {
  const seed = catalogOf(1);
  Object.assign(seed.restaurant_location[0], { provider: 'GOONG', provider_place_id: 'goong-1', geocoded_at: '2026-11-27T01:00:00.000Z' });
  const geo = fakeGeo({ places: goongPlaces(1) }); // chỉ trả đúng quán đã có trong catalog
  const { run, repository } = await setup({ seed, geo });
  const out = await run({});
  assert.equal(out.results.length, 1);
  assert.deepEqual(out.suggestions, []);
  assert.equal(repository._table('restaurant').length, 1, 'không tạo quán trùng');
  assert.equal(repository._table('restaurant_discovery').length, 0, 'catalog không đi vào discovery');
});
