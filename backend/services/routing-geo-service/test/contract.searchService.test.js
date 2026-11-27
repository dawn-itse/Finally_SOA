// Hợp đồng với restaurant-search-service (4003): dùng chính geoClient và searchService của service đó
// để chắc rằng Geo Service trả đúng những gì Search Service đang đọc.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGeoClient } = require('../../restaurant-search-service/src/clients/geoClient');
const { setup, emptySeed, silentLogger } = require('../../restaurant-search-service/test/helpers');
const { withServer, detailPayload, CENTER } = require('./helpers');

const goongHandler = (endpoint, params) => {
  if (endpoint === '/v2/place/autocomplete') return { status: 'OK', predictions: [{ place_id: 'gp-bunbo', description: 'Quán Bún Bò Huế' }] };
  if (endpoint === '/v2/place/detail') {
    return detailPayload({ id: params.place_id, name: 'Quán Bún Bò Huế Cô Ba', address: '10 Lê Văn Lương, Hà Nội', lat: CENTER.lat + 0.001, lng: CENTER.lng });
  }
  if (endpoint === '/v2/distancematrix') return { rows: [{ elements: [{ status: 'OK', distance: { value: 700 }, duration: { value: 150 } }] }] };
  return { status: 'ZERO_RESULTS' };
};

test('geoClient của Search Service đọc được getArea/autocomplete/placeDetail/distanceMatrix từ Geo Service', async () => {
  await withServer({ goongHandler }, async ({ base }) => {
    const client = createGeoClient({ baseUrl: base });
    const area = await client.getArea('area-1');
    assert.deepEqual({ lat: area.latitude, lng: area.longitude, active: area.is_active }, { lat: 21.0048, lng: 105.8042, active: true });
    assert.equal((await client.getArea('area-3')).is_active, false);
    assert.equal(await client.getArea('khong-co'), null);

    const predictions = await client.autocomplete({ input: 'quán bún bò', center: { latitude: CENTER.lat, longitude: CENTER.lng }, radiusKm: 3 });
    assert.deepEqual(predictions, [{ place_id: 'gp-bunbo', description: 'Quán Bún Bò Huế' }]);
    const place = await client.placeDetail('gp-bunbo');
    assert.equal(place.provider, 'GOONG');
    assert.equal(place.address_text, '10 Lê Văn Lương, Hà Nội');
    assert.deepEqual(await client.distanceMatrix({ origin: { latitude: CENTER.lat, longitude: CENTER.lng }, destinations: [{ latitude: 21.01, longitude: 105.81 }] }), [
      { distance_m: 700, duration_s: 150 }
    ]);
  });
});

test('Search Service tìm theo khu vực (AREA) và tự tìm địa điểm qua Geo Service khi kho rỗng', async () => {
  await withServer({ goongHandler }, async ({ base }) => {
    const geo = createGeoClient({ baseUrl: base });
    const { service } = await setup({ seed: emptySeed(), geo });
    const { parseSearchRequest } = require('../../restaurant-search-service/src/validation');
    const { loadDishText } = require('../../restaurant-search-service/src/dishText');
    const dishText = await loadDishText();
    const search = (anchor) => service.search(parseSearchRequest({ dish: 'bún bò', max_price: 50000, radius_km: 3, anchor }, dishText));

    const found = await search({ source: 'AREA', area_id: 'area-1' });
    assert.equal(found.source, 'GEO');
    assert.equal(found.meta.anchor.source, 'AREA');
    assert.equal(found.meta.anchor.latitude, 21.0048);
    assert.equal(found.suggestions.length, 1);
    assert.equal(found.suggestions[0].name, 'Quán Bún Bò Huế Cô Ba');

    await assert.rejects(search({ source: 'AREA', area_id: 'area-3' }), { status: 404, code: 'AREA_NOT_FOUND' }); // khu vực đã ẩn
    await assert.rejects(search({ source: 'AREA', area_id: 'khong-co' }), { status: 404, code: 'AREA_NOT_FOUND' });
    assert.ok(silentLogger);
  });
});

test('places/search trả đúng dạng mà Search Service lưu (isStorablePlace)', async () => {
  await withServer({ goongHandler }, async ({ get }) => {
    const query = new URLSearchParams({ keyword: 'quán bún bò', lat: String(CENTER.lat), lng: String(CENTER.lng), radius_km: '3' });
    const { data } = await (await get('/api/v1/geo/places/search?' + query)).json();
    const [place] = data.places;
    for (const field of ['provider', 'provider_place_id', 'name', 'address_text', 'latitude', 'longitude', 'commune', 'province', 'deprecated_address_text', 'geocoded_at']) {
      assert.ok(Object.hasOwn(place, field), field);
    }
    assert.equal(place.provider, 'GOONG');
  });
});

test('Geo Service lỗi khi đọc khu vực: Search Service báo 503 GEO_UNAVAILABLE', async () => {
  await withServer({}, async ({ base, repository }) => {
    repository.getArea = async () => { throw new Error('db down'); };
    const { service } = await setup({ seed: emptySeed(), geo: createGeoClient({ baseUrl: base }) });
    const { parseSearchRequest } = require('../../restaurant-search-service/src/validation');
    const { loadDishText } = require('../../restaurant-search-service/src/dishText');
    const request = parseSearchRequest({ dish: 'phở bò', max_price: 50000, radius_km: 3, anchor: { source: 'AREA', area_id: 'area-1' } }, await loadDishText());
    await assert.rejects(service.search(request), { status: 503, code: 'GEO_UNAVAILABLE' });
  });
});
