const test = require('node:test');
const assert = require('node:assert/strict');
const { createCatalogAdminService } = require('../src/admin/catalogAdminService');
const { setup, emptySeed, addRestaurant, fakeGeo, goongPlace, CENTER } = require('./helpers');

const ADMIN = 'admin-0001';
const ADMIN_2 = 'admin-0002';

async function setupAdmin(options = {}) {
  const base = await setup(options);
  let tick = Date.parse('2026-11-27T08:00:00.000Z');
  const admin = createCatalogAdminService({ repository: base.repository, dishText: base.dishText, now: () => new Date((tick += 1000)) });
  const errorOf = async (promise) => promise.then(() => null, (error) => error);
  return { ...base, admin, errorOf };
}

const manualLocation = (overrides = {}) => ({
  provider: 'MANUAL', address_text: '12 Lê Văn Lương, Hà Nội', latitude: CENTER.lat + 0.004, longitude: CENTER.lng, ...overrides
});
const search = (run, body = {}) => run({ dish: 'bún bò', max_price: 60000, radius_km: 2, ...body });

test('createRestaurant: tạo quán PUBLISHED đã xác minh, có món và giá, tìm thấy ngay trong catalog', async () => {
  const { admin, run } = await setupAdmin();
  const result = await admin.createRestaurant({
    name: 'Bún Bò Cô Lan', phone: '0901 234 567', cuisines: ['Quán bún'], location: manualLocation(), acted_by: ADMIN,
    source_type: 'COMMUNITY', source_ref: 'contrib/1',
    menu_items: [{ name: 'Bún bò Huế', price: { min_price: 45000, max_price: 50000 } }, { name: 'Chả cua' }]
  });
  assert.equal(result.changed, true);
  assert.equal(result.after.visibility_status, 'PUBLISHED');
  assert.equal(result.after.verified, true);
  assert.equal(result.after.verified_by, ADMIN);
  assert.deepEqual(result.after.cuisines, ['Quán bún']);
  assert.equal(result.after.locations.length, 1);
  assert.equal(result.after.locations[0].is_primary, true);
  const noPrice = result.after.menu_items.find((item) => item.name === 'Chả cua');
  assert.equal(noPrice.price_status, 'NO_PRICE');

  const found = await search(run);
  assert.equal(found.source, 'CATALOG');
  assert.equal(found.results[0].name, 'Bún Bò Cô Lan');
  assert.equal(found.results[0].verified, true);
  assert.equal(found.results[0].starting_price, 45000);
  assert.ok(!('verified_by' in found.results[0]), 'API tìm kiếm không trả verified_by');
});

test('createRestaurant: gọi lại cùng source_ref không tạo bản thứ hai; trùng địa điểm Goong trả 409', async () => {
  const { admin, repository, errorOf } = await setupAdmin();
  const body = { name: 'Quán A', location: manualLocation(), acted_by: ADMIN, source_ref: 'contrib/7' };
  const first = await admin.createRestaurant(body);
  const replay = await admin.createRestaurant(body);
  assert.equal(replay.replayed, true);
  assert.equal(replay.changed, false);
  assert.equal(replay.after.restaurant_id, first.after.restaurant_id);
  assert.equal(repository._table('restaurant').length, 1);

  const goong = { provider: 'GOONG', provider_place_id: 'gp-1', geocoded_at: '2026-11-26T05:00:00Z' };
  await admin.createRestaurant({ name: 'Quán B', location: manualLocation(goong), acted_by: ADMIN });
  const duplicate = await errorOf(admin.createRestaurant({ name: 'Quán C', location: manualLocation(goong), acted_by: ADMIN }));
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.code, 'DUPLICATE_LOCATION');
  assert.ok(duplicate.details.restaurant_id);
});

test('createRestaurant lỗi giữa chừng thì hoàn tác toàn bộ', async () => {
  const { admin, repository, errorOf } = await setupAdmin();
  const error = await errorOf(admin.createRestaurant({
    name: 'Quán lỗi', location: manualLocation(), acted_by: ADMIN, cuisines: ['Quán bún'],
    menu_items: [{ name: 'Bún bò' }, { name: 'BUN BO' }]
  }));
  assert.equal(error.status, 400);
  for (const table of ['restaurant', 'restaurant_location', 'menu_item', 'cuisine', 'restaurant_cuisine']) {
    assert.equal(repository._table(table).length, 0, `${table} phải rỗng sau rollback`);
  }
});

test('applyPrice: duyệt 49k rồi 48k thì giá hiện hành 48k, 49k còn trong lịch sử, tìm kiếm thấy 48k', async () => {
  const seed = emptySeed();
  const restaurantId = addRestaurant(seed, { name: 'Phở Giá', branches: [[CENTER.lat + 0.004, CENTER.lng]], items: [['Phở bò', 52000]] });
  const { admin, run } = await setupAdmin({ seed });
  const [item] = (await admin.getRestaurant(restaurantId)).menu_items;
  assert.equal((await run({ max_price: 50000 })).results.length, 0);

  const first = await admin.applyPrice(item.menu_item_id, { min_price: 49000, source_type: 'PRICE_REPORT', source_reference: 'report-1', acted_by: ADMIN });
  const second = await admin.applyPrice(item.menu_item_id, { min_price: 48000, source_type: 'PRICE_REPORT', source_reference: 'report-2', acted_by: ADMIN_2 });
  assert.equal(first.before.current_price.min_price, 52000);
  assert.equal(second.before.current_price.min_price, 49000);
  assert.equal(second.after.current_price.min_price, 48000);
  assert.equal(second.restaurant.verified_by, ADMIN_2);
  assert.equal(second.restaurant.verified, true);

  const detail = await admin.getMenuItem(item.menu_item_id);
  assert.equal(detail.current_price.min_price, 48000);
  assert.equal(detail.price_history.length, 3);
  assert.equal(detail.price_history.filter((price) => price.is_current).length, 1);
  assert.deepEqual(detail.price_history.map((price) => price.min_price).sort(), [48000, 49000, 52000]);

  const found = await run({ max_price: 50000 });
  assert.equal(found.results[0].starting_price, 48000);
});

test('applyPrice: duyệt lại cùng báo cáo không tạo dòng mới và không đè giá mới hơn', async () => {
  const seed = emptySeed();
  const restaurantId = addRestaurant(seed, { name: 'Quán', branches: [[CENTER.lat, CENTER.lng]], items: [['Phở bò', 52000]] });
  const { admin } = await setupAdmin({ seed });
  const [item] = (await admin.getRestaurant(restaurantId)).menu_items;

  await admin.applyPrice(item.menu_item_id, { min_price: 49000, source_reference: 'report-1', acted_by: ADMIN });
  await admin.applyPrice(item.menu_item_id, { min_price: 48000, source_reference: 'report-2', acted_by: ADMIN });
  const replay = await admin.applyPrice(item.menu_item_id, { min_price: 49000, source_reference: 'report-1', acted_by: ADMIN });
  assert.equal(replay.replayed, true);
  assert.equal(replay.changed, false);
  assert.equal(replay.menu_item.current_price.min_price, 48000);
  assert.equal((await admin.getMenuItem(item.menu_item_id)).price_history.length, 3);
});

test('applyPrice: tham chiếu mức giá của món khác bị từ chối; mức giá đã vào lịch sử vẫn hợp lệ', async () => {
  const seed = emptySeed();
  const restaurantId = addRestaurant(seed, { name: 'Quán', branches: [[CENTER.lat, CENTER.lng]], items: [['Phở bò', 52000], ['Phở gà', 50000]] });
  const { admin, errorOf } = await setupAdmin({ seed });
  const { menu_items: items } = await admin.getRestaurant(restaurantId);
  const beefItem = items.find((item) => item.name === 'Phở bò');
  const otherItem = items.find((item) => item.name === 'Phở gà');

  const mismatch = await errorOf(admin.applyPrice(beefItem.menu_item_id, {
    min_price: 40000, referenced_price_assertion_id: otherItem.current_price.price_assertion_id, acted_by: ADMIN
  }));
  assert.equal(mismatch.code, 'PRICE_ASSERTION_MISMATCH');
  assert.equal(mismatch.status, 422);

  const oldId = beefItem.current_price.price_assertion_id;
  await admin.applyPrice(beefItem.menu_item_id, { min_price: 49000, acted_by: ADMIN });
  const ok = await admin.applyPrice(beefItem.menu_item_id, { min_price: 48000, referenced_price_assertion_id: oldId, acted_by: ADMIN });
  assert.equal(ok.changed, true);
});

test('applyPrice: hai lần duyệt song song cùng món chỉ để lại đúng một giá hiện hành', async () => {
  const seed = emptySeed();
  const restaurantId = addRestaurant(seed, { name: 'Quán', branches: [[CENTER.lat, CENTER.lng]], items: [['Phở bò', 52000]] });
  const { admin } = await setupAdmin({ seed });
  const [item] = (await admin.getRestaurant(restaurantId)).menu_items;
  await Promise.all([30000, 31000, 32000, 33000].map((price, index) => admin.applyPrice(item.menu_item_id, { min_price: price, source_reference: `r${index}`, acted_by: ADMIN })));
  const detail = await admin.getMenuItem(item.menu_item_id);
  assert.equal(detail.price_history.filter((price) => price.is_current).length, 1);
  assert.equal(detail.price_history.length, 5);
});

test('applyPrice/withdrawPrice: kiểm tra đầu vào', async () => {
  const seed = emptySeed();
  const restaurantId = addRestaurant(seed, { name: 'Quán', branches: [[CENTER.lat, CENTER.lng]], items: [['Phở bò', 52000]] });
  const { admin, errorOf } = await setupAdmin({ seed });
  const [item] = (await admin.getRestaurant(restaurantId)).menu_items;
  const bad = async (body) => (await errorOf(admin.applyPrice(item.menu_item_id, body)))?.code;
  assert.equal(await bad({ min_price: -1, acted_by: ADMIN }), 'INVALID_REQUEST');
  assert.equal(await bad({ min_price: 1.5, acted_by: ADMIN }), 'INVALID_REQUEST');
  assert.equal(await bad({ min_price: 50000, max_price: 40000, acted_by: ADMIN }), 'INVALID_REQUEST');
  assert.equal(await bad({ min_price: 50000 }), 'INVALID_REQUEST');
  assert.equal(await bad({ min_price: 50000, acted_by: 'a b' }), 'INVALID_REQUEST');
  assert.equal(await bad({ min_price: 50000, acted_by: ADMIN, price: 1 }), 'INVALID_REQUEST');
  assert.equal(await bad({ min_price: 50000, acted_by: ADMIN, source_type: 'bad type' }), 'INVALID_REQUEST');
  assert.equal((await errorOf(admin.applyPrice('missing-item', { min_price: 1, acted_by: ADMIN }))).status, 404);
});

test('withdrawPrice: món về NO_PRICE, không còn khớp tìm kiếm, lịch sử còn; gỡ lần hai không làm gì', async () => {
  const seed = emptySeed();
  const restaurantId = addRestaurant(seed, { name: 'Quán bún', branches: [[CENTER.lat + 0.004, CENTER.lng]], items: [['Bún bò', 45000]] });
  const { admin, run } = await setupAdmin({ seed });
  const [item] = (await admin.getRestaurant(restaurantId)).menu_items;
  assert.equal((await search(run)).results.length, 1);

  const removed = await admin.withdrawPrice(item.menu_item_id, { acted_by: ADMIN });
  assert.equal(removed.changed, true);
  assert.equal(removed.menu_item.price_status, 'NO_PRICE');
  assert.equal(removed.before.current_price.min_price, 45000);
  assert.equal(removed.after.current_price, null);
  assert.equal(removed.restaurant.verified_by, ADMIN);
  assert.equal((await search(run)).results.length, 0);
  assert.equal((await admin.getMenuItem(item.menu_item_id)).price_history.length, 1);

  const again = await admin.withdrawPrice(item.menu_item_id, { acted_by: ADMIN_2 });
  assert.equal(again.changed, false);
  assert.equal(again.restaurant.verified_by, ADMIN, 'không đổi dữ liệu thì không làm mới xác minh');
});

test('luồng quán PENDING quét từ Goong: thêm món + giá, công khai, rồi chuyển từ gợi ý sang kết quả catalog', async () => {
  const geo = fakeGeo({ places: [goongPlace()] });
  const { admin, run } = await setupAdmin({ geo });
  const first = await run({ dish: 'bún bò' });
  assert.equal(first.source, 'GEO');
  const suggestion = first.suggestions[0];
  assert.equal(suggestion.name, 'Quán Bún Bò Huế Cô Ba');

  const before = await admin.getRestaurant(suggestion.restaurant_id);
  assert.equal(before.visibility_status, 'PENDING');
  assert.equal(before.verified, false);

  const created = await admin.createMenuItem(suggestion.restaurant_id, {
    name: 'Bún bò Huế', price: { min_price: 50000, max_price: 55000 }, source_reference: 'contrib/9', acted_by: ADMIN
  });
  assert.equal(created.menu_item.price_status, 'CURRENT');
  assert.equal((await run({ dish: 'bún bò' })).source, 'DISCOVERY', 'PENDING chưa công khai nên vẫn là gợi ý');

  const published = await admin.setVisibility(suggestion.restaurant_id, { visibility_status: 'PUBLISHED', acted_by: ADMIN });
  assert.equal(published.changed, true);
  assert.equal(published.before.visibility_status, 'PENDING');
  assert.equal(published.after.visibility_status, 'PUBLISHED');
  assert.equal(published.after.verified_by, ADMIN);

  const after = await run({ dish: 'bún bò' });
  assert.equal(after.source, 'CATALOG');
  assert.equal(after.results[0].restaurant_id, suggestion.restaurant_id);
  assert.equal(after.results[0].starting_price, 50000);
  assert.deepEqual(after.suggestions, [], 'quán đã công khai không lặp lại ở gợi ý');
});

test('setVisibility: cùng trạng thái là no-op; REJECTED không làm mới xác minh và ẩn quán; PUBLISHED cần chi nhánh chính', async () => {
  const seed = emptySeed();
  const restaurantId = addRestaurant(seed, { name: 'Quán phở', verified: true, branches: [[CENTER.lat + 0.004, CENTER.lng, true]], items: [['Phở bò', 40000]] });
  const orphanId = addRestaurant(seed, { name: 'Quán chưa có chi nhánh', status: 'PENDING', branches: [] });
  const { admin, run, errorOf } = await setupAdmin({ seed });

  assert.equal((await admin.setVisibility(restaurantId, { visibility_status: 'PUBLISHED', acted_by: ADMIN_2 })).changed, false);
  assert.equal((await admin.getRestaurant(restaurantId)).verified_by, 'admin-1');

  const rejected = await admin.setVisibility(restaurantId, { visibility_status: 'REJECTED', acted_by: ADMIN_2 });
  assert.equal(rejected.after.visibility_status, 'REJECTED');
  assert.equal(rejected.after.verified_by, 'admin-1', 'từ chối không làm mới xác minh');
  assert.equal((await run({ dish: 'phở bò', max_price: 50000 })).results.length, 0);

  const noLocation = await errorOf(admin.setVisibility(orphanId, { visibility_status: 'PUBLISHED', acted_by: ADMIN }));
  assert.equal(noLocation.status, 409);
  assert.equal(noLocation.code, 'NO_PRIMARY_LOCATION');
  assert.equal((await errorOf(admin.setVisibility(restaurantId, { visibility_status: 'DELETED', acted_by: ADMIN }))).status, 400);
  assert.equal((await errorOf(admin.setVisibility('missing', { visibility_status: 'PUBLISHED', acted_by: ADMIN }))).status, 404);
});

test('verifyRestaurant làm mới nhãn xác minh; updateRestaurant sửa tên, điện thoại, loại hình', async () => {
  const seed = emptySeed();
  const restaurantId = addRestaurant(seed, { name: 'Quán cũ', branches: [[CENTER.lat, CENTER.lng]], items: [] });
  const { admin, errorOf } = await setupAdmin({ seed });
  const verified = await admin.verifyRestaurant(restaurantId, { acted_by: ADMIN });
  assert.equal(verified.after.verified, true);
  assert.equal(verified.after.verified_by, ADMIN);

  const updated = await admin.updateRestaurant(restaurantId, { name: 'Quán mới', phone: '0901234567', description: null, cuisines: ['Quán phở', 'quán phở', 'Đồ uống'], acted_by: ADMIN_2 });
  assert.equal(updated.before.name, 'Quán cũ');
  assert.equal(updated.after.name, 'Quán mới');
  assert.equal(updated.after.verified_by, ADMIN_2);
  assert.deepEqual(updated.after.cuisines, ['Quán phở', 'Đồ uống'].sort((a, b) => a.localeCompare(b)));
  assert.equal((await errorOf(admin.updateRestaurant(restaurantId, { acted_by: ADMIN }))).code, 'INVALID_REQUEST');
  assert.equal((await errorOf(admin.updateRestaurant(restaurantId, { phone: 'abc', acted_by: ADMIN }))).code, 'INVALID_REQUEST');
});

test('chi nhánh: thêm chi nhánh, đổi chi nhánh chính, quy tắc đổi địa chỉ và provider', async () => {
  const seed = emptySeed();
  const restaurantId = addRestaurant(seed, { name: 'Quán', branches: [[CENTER.lat, CENTER.lng, true]], items: [] });
  const { admin, repository, errorOf } = await setupAdmin({ seed });
  const [primary] = (await admin.getRestaurant(restaurantId)).locations;

  const added = await admin.addLocation(restaurantId, { ...manualLocation({ address_text: 'Chi nhánh 2' }), is_primary: true, acted_by: ADMIN });
  assert.equal(added.location.is_primary, true);
  assert.equal(added.after.locations.filter((location) => location.is_primary).length, 1);
  assert.equal(added.after.locations.find((location) => location.location_id === primary.location_id).is_primary, false);

  const noPrimaryDrop = await errorOf(admin.updateLocation(restaurantId, added.location.location_id, { is_primary: false, acted_by: ADMIN }));
  assert.equal(noPrimaryDrop.code, 'PRIMARY_REQUIRED');

  const needCoordinates = await errorOf(admin.updateLocation(restaurantId, added.location.location_id, { address_text: 'Địa chỉ mới', acted_by: ADMIN }));
  assert.equal(needCoordinates.code, 'COORDINATES_REQUIRED');
  const moved = await admin.updateLocation(restaurantId, added.location.location_id, {
    address_text: 'Địa chỉ mới', latitude: CENTER.lat + 0.002, longitude: CENTER.lng + 0.002, acted_by: ADMIN
  });
  assert.equal(moved.location.address_text, 'Địa chỉ mới');

  const swapped = await admin.updateLocation(restaurantId, primary.location_id, { is_primary: true, acted_by: ADMIN });
  assert.equal(swapped.after.locations.filter((location) => location.is_primary).length, 1);
  assert.equal(swapped.location.is_primary, true);

  // Chi nhánh GOONG: đổi tọa độ phải gửi lại nhóm provider.
  const goong = await admin.addLocation(restaurantId, { ...manualLocation({ provider: 'GOONG', provider_place_id: 'gp-9', geocoded_at: '2026-11-26T05:00:00Z' }), acted_by: ADMIN });
  const stale = await errorOf(admin.updateLocation(restaurantId, goong.location.location_id, { latitude: 21.01, longitude: 105.8, acted_by: ADMIN }));
  assert.equal(stale.code, 'PROVIDER_REQUIRED');
  const manual = await admin.updateLocation(restaurantId, goong.location.location_id, { latitude: 21.01, longitude: 105.8, provider: 'MANUAL', acted_by: ADMIN });
  assert.equal(manual.location.provider, 'MANUAL');
  assert.equal(manual.location.provider_place_id, null);
  assert.equal(manual.location.geocoded_at, null);

  // Trùng (provider, provider_place_id) với chi nhánh khác.
  const taken = await errorOf(admin.updateLocation(restaurantId, added.location.location_id, {
    provider: 'GOONG', provider_place_id: 'gp-9-other', geocoded_at: '2026-11-26T05:00:00Z', latitude: 21, longitude: 105, address_text: 'x', acted_by: ADMIN
  }).then(() => admin.addLocation(restaurantId, { ...manualLocation({ provider: 'GOONG', provider_place_id: 'gp-9-other', geocoded_at: '2026-11-26T05:00:00Z' }), acted_by: ADMIN })));
  assert.equal(taken.code, 'DUPLICATE_LOCATION');

  assert.equal((await errorOf(admin.updateLocation(restaurantId, 'khong-co', { commune: 'x', acted_by: ADMIN }))).status, 404);
  assert.equal((await errorOf(admin.addLocation(restaurantId, { ...manualLocation({ provider: 'GOONG' }), acted_by: ADMIN }))).code, 'INVALID_REQUEST');
  assert.equal((await errorOf(admin.addLocation(restaurantId, { ...manualLocation({ provider_place_id: 'x' }), acted_by: ADMIN }))).code, 'INVALID_REQUEST');
  assert.equal(repository._table('restaurant_location').filter((row) => row.restaurant_id === restaurantId && row.is_primary).length, 1);
});

test('món: đổi tên tính lại name_normalized, chặn trùng tên đang bán, INACTIVE ẩn khỏi tìm kiếm', async () => {
  const seed = emptySeed();
  const restaurantId = addRestaurant(seed, { name: 'Quán', branches: [[CENTER.lat + 0.004, CENTER.lng]], items: [['Phở bò', 40000], ['Phở gà', 38000]] });
  const { admin, run, errorOf } = await setupAdmin({ seed });
  const detail = await admin.getRestaurant(restaurantId);
  const beef = detail.menu_items.find((item) => item.name === 'Phở bò');
  const chicken = detail.menu_items.find((item) => item.name === 'Phở gà');

  assert.equal((await errorOf(admin.updateMenuItem(chicken.menu_item_id, { name: 'PHỞ BÒ', acted_by: ADMIN }))).code, 'DUPLICATE_MENU_ITEM');
  assert.equal((await errorOf(admin.createMenuItem(restaurantId, { name: 'pho bo', acted_by: ADMIN }))).code, 'DUPLICATE_MENU_ITEM');

  const renamed = await admin.updateMenuItem(beef.menu_item_id, { name: 'Phở bò tái lăn', acted_by: ADMIN });
  assert.equal(renamed.before.name, 'Phở bò');
  assert.equal(renamed.after.name, 'Phở bò tái lăn');
  assert.equal(renamed.after.current_price.min_price, 40000);
  assert.equal((await run({ dish: 'tái lăn', max_price: 50000 })).results.length, 1);

  await admin.updateMenuItem(beef.menu_item_id, { status: 'INACTIVE', acted_by: ADMIN });
  assert.equal((await run({ dish: 'tái lăn', max_price: 50000 })).results.length, 0);
  // Món INACTIVE không chặn tạo lại món cùng tên.
  assert.equal((await admin.createMenuItem(restaurantId, { name: 'Phở bò tái lăn', acted_by: ADMIN })).changed, true);
  assert.equal((await errorOf(admin.updateMenuItem(beef.menu_item_id, { acted_by: ADMIN }))).code, 'INVALID_REQUEST');
  assert.equal((await errorOf(admin.updateMenuItem(beef.menu_item_id, { status: 'ACTIVE', acted_by: ADMIN }))).code, 'DUPLICATE_MENU_ITEM');
});

test('listRestaurants lọc theo trạng thái, tên và phân trang; chi tiết có chi nhánh chính', async () => {
  const seed = emptySeed();
  addRestaurant(seed, { name: 'Phở A', status: 'PENDING', branches: [[CENTER.lat, CENTER.lng, true]] });
  addRestaurant(seed, { name: 'Phở B', status: 'PENDING', branches: [[CENTER.lat, CENTER.lng, true]] });
  addRestaurant(seed, { name: 'Bún C', status: 'PUBLISHED', branches: [[CENTER.lat, CENTER.lng, true]] });
  const { admin, errorOf } = await setupAdmin({ seed });

  const pending = await admin.listRestaurants(new URLSearchParams('status=PENDING'));
  assert.equal(pending.total, 2);
  assert.ok(pending.restaurants.every((row) => row.visibility_status === 'PENDING' && row.primary_location));
  const byName = await admin.listRestaurants(new URLSearchParams('q=bún'));
  assert.equal(byName.total, 1);
  const page = await admin.listRestaurants(new URLSearchParams('limit=1&offset=1'));
  assert.equal(page.restaurants.length, 1);
  assert.equal(page.total, 3);
  assert.equal((await errorOf(admin.listRestaurants(new URLSearchParams('status=NOPE')))).code, 'INVALID_REQUEST');
  assert.equal((await errorOf(admin.listRestaurants(new URLSearchParams('limit=0')))).code, 'INVALID_REQUEST');
  assert.equal((await errorOf(admin.getRestaurant('missing'))).code, 'RESTAURANT_NOT_FOUND');
});
