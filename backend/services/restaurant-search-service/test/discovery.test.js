const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, emptySeed, addRestaurant, fakeGeo, goongPlace, CENTER } = require('./helpers');

const UNCONFIRMED = 'Chưa xác nhận món và giá';

test('catalog rỗng, chưa có gợi ý: gọi Goong, lưu PENDING, rồi lần sau đọc lại từ kho', async () => {
  const geo = fakeGeo({ places: [goongPlace()] });
  const { run, repository } = await setup({ geo });

  const first = await run({ dish: 'bún bò' });
  assert.equal(first.source, 'GEO');
  assert.deepEqual(first.results, []);
  assert.equal(first.suggestions.length, 1);
  assert.equal(first.suggestions[0].name, 'Quán Bún Bò Huế Cô Ba');
  assert.equal(first.suggestions[0].verification_label, UNCONFIRMED);
  assert.equal(first.suggestions[0].source, 'GOONG');
  assert.equal(geo.calls.autocomplete, 1);

  const [saved] = repository._table('restaurant');
  assert.equal(saved.visibility_status, 'PENDING');
  assert.equal(saved.verified_at, null);
  assert.equal(repository._table('restaurant_discovery')[0].dish_keyword, 'bun bo');

  // "bun bo" dùng chung khóa với "bún bò": đọc lại từ kho. Mới có 1/3 quán nên vẫn quét Goong tìm thêm,
  // nhưng địa điểm đã lưu được dùng lại (không tạo quán thứ hai).
  const second = await run({ dish: 'bun bo' });
  assert.equal(second.source, 'DISCOVERY');
  assert.equal(second.suggestions.length, 1);
  assert.equal(geo.calls.autocomplete, 2);
  assert.equal(repository._table('restaurant').length, 1);
});

test('cùng provider_place_id dùng lại restaurant_id, thêm từ khóa mới vào cùng chi nhánh', async () => {
  const geo = fakeGeo({ places: [goongPlace({ name: 'Quán Bún Bò Phở Bò Cô Ba' })] });
  const { run, repository } = await setup({ geo });
  const a = await run({ dish: 'bún bò' });
  const b = await run({ dish: 'phở bò' });

  assert.equal(repository._table('restaurant').length, 1);
  assert.equal(repository._table('restaurant_location').length, 1);
  assert.equal(a.suggestions[0].restaurant_id, b.suggestions[0].restaurant_id);
  assert.deepEqual(repository._table('restaurant_discovery').map((d) => d.dish_keyword).sort(), ['bun bo', 'pho bo']);
});

test('gợi ý ngoài bán kính tìm mới bị loại, quán đã lưu vẫn tìm lại được khi bán kính đủ lớn', async () => {
  const geo = fakeGeo({ places: [goongPlace()] });
  const { run } = await setup({ geo });
  await run({ dish: 'bún bò', radius_km: 3 });

  // Tâm khác cách chi nhánh ~5 km
  const far = { source: 'GPS', lat: CENTER.lat + 0.045, lng: CENTER.lng };
  assert.equal((await run({ dish: 'bún bò', radius_km: 3, anchor: far })).suggestions.length, 0);
  assert.equal((await run({ dish: 'bún bò', radius_km: 8, anchor: far })).source, 'DISCOVERY');
});

test('địa điểm Goong ngoài bán kính (theo tọa độ Place Detail) không được lưu', async () => {
  const geo = fakeGeo({ places: [goongPlace({ latitude: CENTER.lat + 0.2 })] });
  const { run, repository } = await setup({ geo });
  const out = await run({ dish: 'bún bò' });
  assert.equal(out.source, 'NONE');
  assert.equal(repository._table('restaurant').length, 0);
});

test('địa chỉ, tên đường và nơi không giống quán ăn bị loại', async () => {
  const geo = fakeGeo({ places: [
    goongPlace({ provider_place_id: 'p-street', name: 'Lê Văn Lương', types: ['street'] }),
    goongPlace({ provider_place_id: 'p-addr', name: '10 Lê Văn Lương', address_text: '10 Lê Văn Lương', types: [] }),
    goongPlace({ provider_place_id: 'p-unrelated', name: 'Công ty ABC', types: [] }),
    goongPlace({ provider_place_id: 'p-name', name: 'Bún Bò Huế O Hoa', types: [] }),
    goongPlace({ provider_place_id: 'p-quan', name: 'Quán Cô Ba', types: [] })
  ] });
  const { run } = await setup({ geo });
  const out = await run({ dish: 'bún bò' });
  assert.deepEqual(out.suggestions.map((s) => s.name).sort(), ['Bún Bò Huế O Hoa', 'Quán Cô Ba']);
});

test('Goong lỗi hoặc trống thì trả hai danh sách rỗng, không ném lỗi và không lưu gì', async () => {
  const failing = await setup({ geo: fakeGeo({ failAutocomplete: true }) });
  const a = await failing.run({ dish: 'bún bò' });
  assert.deepEqual([a.source, a.results, a.suggestions], ['NONE', [], []]);

  const empty = await setup({ geo: fakeGeo({ places: [] }) });
  const b = await empty.run({ dish: 'bún bò' });
  assert.deepEqual([b.source, b.results, b.suggestions], ['NONE', [], []]);
  assert.equal(empty.repository._table('restaurant').length, 0);
});

test('Place Detail lỗi từng phần: bỏ địa điểm lỗi, giữ địa điểm còn lại', async () => {
  const geo = fakeGeo({ places: [goongPlace(), goongPlace({ provider_place_id: 'p2', name: 'Bún Bò Chú Tư' })] });
  const original = geo.placeDetail;
  geo.placeDetail = async (placeId) => {
    if (placeId === 'goong-place-1') throw new Error('timeout');
    return original(placeId);
  };
  const { run } = await setup({ geo });
  const out = await run({ dish: 'bún bò' });
  assert.deepEqual(out.suggestions.map((s) => s.name), ['Bún Bò Chú Tư']);
});

test('hai lượt tìm giống nhau cùng lúc chỉ gọi Goong một lần', async () => {
  const geo = fakeGeo({ places: [goongPlace()] });
  const slow = geo.autocomplete;
  geo.autocomplete = async (...args) => { await new Promise((r) => setTimeout(r, 20)); return slow(...args); };
  const { run, repository } = await setup({ geo });
  const [a, b] = await Promise.all([run({ dish: 'bún bò' }), run({ dish: 'bún bò' })]);
  assert.equal(geo.calls.autocomplete, 1);
  assert.equal(a.suggestions.length, 1);
  assert.equal(b.suggestions.length, 1);
  assert.equal(repository._table('restaurant').length, 1);
});

test('quán đã lưu nhưng bị từ chối/đóng cửa không được gợi ý và không bị ghi đè', async () => {
  const geo = fakeGeo({ places: [goongPlace()] });
  const { run, repository } = await setup({ geo });
  await run({ dish: 'bún bò' });
  repository._table('restaurant')[0].visibility_status = 'REJECTED';

  const again = await run({ dish: 'bún bò' });
  assert.equal(again.source, 'NONE');
  assert.equal(repository._table('restaurant').length, 1);
  assert.equal(repository._table('restaurant')[0].visibility_status, 'REJECTED');
});

test('quán catalog khớp món thì gợi ý không bao giờ được trộn vào results', async () => {
  const seed = emptySeed();
  addRestaurant(seed, { name: 'Có trong catalog', branches: [[CENTER.lat + 0.009, CENTER.lng]], items: [['Bún bò', 45000]] });
  const geo = fakeGeo({ places: [goongPlace()] });
  const { run } = await setup({ seed, geo });
  const out = await run({ dish: 'bún bò' });
  // Catalog 1 quán, Goong bù thêm 1: hai danh sách tách biệt, quán catalog có giá còn gợi ý thì không.
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].name, 'Có trong catalog');
  assert.equal(out.suggestions.length, 1);
  assert.equal(out.suggestions[0].name, 'Quán Bún Bò Huế Cô Ba');
  assert.equal(out.suggestions[0].starting_price, undefined);
  assert.equal(geo.calls.autocomplete, 1);
});
