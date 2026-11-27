const test = require('node:test');
const assert = require('node:assert/strict');
const { withServer, buildContext, detailPayload, TOKEN, seedAreas } = require('./helpers');

const BASE = '/api/internal/v1/geo';
const validArea = (overrides = {}) => ({
  name: 'Ngã Tư Sở', short_label: 'Ngã Tư Sở', anchor_address: 'Ngã Tư Sở, Hà Nội', anchor_latitude: 21.0, anchor_longitude: 105.82, ...overrides
});

test('xác thực: tắt khi chưa đặt token, 401 khi thiếu hoặc sai token, không lộ dữ liệu', async () => {
  await withServer({ token: null }, async ({ call }) => {
    const response = await call('GET', `${BASE}/areas`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'INTERNAL_API_DISABLED');
  });
  await withServer({}, async ({ call, get }) => {
    assert.equal((await get(`${BASE}/areas`)).status, 401);
    assert.equal((await call('GET', `${BASE}/areas`, undefined, { 'X-Internal-Token': 'sai' })).status, 401);
    assert.equal((await call('POST', `${BASE}/areas`, validArea(), { 'X-Internal-Token': '' })).status, 401);
    const ok = await call('GET', `${BASE}/areas`);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).data.areas.length, 3); // gồm cả khu vực đã ẩn
  });
});

test('định tuyến nội bộ: 404, 405, 415, JSON hỏng, thân quá lớn', async () => {
  await withServer({}, async ({ call }) => {
    assert.equal((await call('GET', `${BASE}/nothing`)).status, 404);
    const method = await call('DELETE', `${BASE}/areas/area-1`);
    assert.equal(method.status, 405);
    assert.equal(method.headers.get('allow'), 'GET, PATCH');
    assert.equal((await call('POST', `${BASE}/areas`, validArea(), { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await call('POST', `${BASE}/areas`, '{"name":')).status, 400);
    assert.equal((await call('POST', `${BASE}/areas`, { ...validArea(), name: 'x'.repeat(9000) })).status, 413);
    assert.equal((await call('GET', `${BASE}/areas/bad%20id`)).status, 400);
  });
});

test('tạo khu vực: 201, id do service cấp, thứ tự tiếp theo, xuất hiện ở danh sách công khai', async () => {
  await withServer({ randomId: () => 'new-area-id' }, async ({ call, get }) => {
    const response = await call('POST', `${BASE}/areas`, validArea({ anchor_latitude: 21.0000000049 }));
    assert.equal(response.status, 201);
    const { data } = await response.json();
    assert.equal(data.changed, true);
    assert.equal(data.before, null);
    assert.deepEqual(data.area, {
      area_id: 'new-area-id', name: 'Ngã Tư Sở', short_label: 'Ngã Tư Sở', anchor_address: 'Ngã Tư Sở, Hà Nội',
      anchor_latitude: 21, anchor_longitude: 105.82, anchor_place_id: null, display_order: 4, is_active: true
    });
    assert.deepEqual((await (await get('/api/v1/geo/areas')).json()).data.map((area) => area.area_id), ['area-1', 'area-2', 'new-area-id']);
    assert.equal((await (await get('/api/v1/geo/areas/new-area-id')).json()).data.latitude, 21);
  });
});

test('tạo khu vực: kiểm tra đầu vào và trùng tên', async () => {
  await withServer({}, async ({ call }) => {
    const bad = [
      {}, [], { ...validArea(), extra: 1 }, validArea({ name: '  ' }), validArea({ name: 'x'.repeat(101) }), validArea({ short_label: 'x'.repeat(41) }),
      validArea({ anchor_latitude: 91 }), validArea({ anchor_longitude: '105' }), validArea({ display_order: 10001 }), validArea({ display_order: 1.5 }),
      validArea({ is_active: 'yes' }), validArea({ anchor_place_id: 5 }), { ...validArea(), anchor_longitude: undefined },
      (({ anchor_address, ...rest }) => rest)(validArea()), (({ anchor_latitude, anchor_longitude, ...rest }) => rest)(validArea())
    ];
    for (const body of bad) {
      const response = await call('POST', `${BASE}/areas`, body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal((await response.json()).code, 'INVALID_REQUEST');
    }
    const duplicate = await call('POST', `${BASE}/areas`, validArea({ name: 'lê văn lương' }));
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).code, 'DUPLICATE_AREA_NAME');
    assert.equal((await call('POST', `${BASE}/areas`, validArea({ name: 'Le Van Luong' }))).status, 201); // phân biệt dấu như collation _as_ci
  });
});

test('tạo từ mã Goong: lấy tọa độ và địa chỉ từ Place Detail', async () => {
  await withServer({
    goongHandler: (endpoint, params) => endpoint === '/v2/place/detail' && params.place_id === 'gp-1'
      ? detailPayload({ id: 'gp-1', address: '1 Tây Sơn, Hà Nội', lat: 21.0087654321, lng: 105.8212345678 })
      : { status: 'NOT_FOUND' }
  }, async ({ call }) => {
    const created = await call('POST', `${BASE}/areas`, { name: 'Tây Sơn', short_label: 'Tây Sơn', anchor_place_id: 'gp-1' });
    assert.equal(created.status, 201);
    const { area } = (await created.json()).data;
    assert.equal(area.anchor_address, '1 Tây Sơn, Hà Nội');
    assert.equal(area.anchor_latitude, 21.0087654);
    assert.equal(area.anchor_longitude, 105.8212346);
    assert.equal(area.anchor_place_id, 'gp-1');
    const missing = await call('POST', `${BASE}/areas`, { name: 'Khác', short_label: 'K', anchor_place_id: 'unknown' });
    assert.equal(missing.status, 422);
    assert.equal((await missing.json()).code, 'PLACE_NOT_FOUND');
  });
  await withServer({ apiKey: '' }, async ({ call }) => {
    const response = await call('POST', `${BASE}/areas`, { name: 'Tây Sơn', short_label: 'TS', anchor_place_id: 'gp-1' });
    assert.equal(response.status, 503);
  });
});

test('tạo khu vực ẩn khi đang có khu vực hoạt động là được; chọn mốc từ Goong kèm tọa độ thì không gọi Goong', async () => {
  await withServer({}, async ({ call, goongFake }) => {
    const response = await call('POST', `${BASE}/areas`, validArea({ is_active: false, anchor_place_id: 'gp-9', display_order: 0 }));
    assert.equal(response.status, 201);
    assert.equal((await response.json()).data.area.is_active, false);
    assert.equal(goongFake.calls.length, 0);
  });
});

test('sửa khu vực: PATCH từng phần, before/after, không đổi thì changed=false', async () => {
  await withServer({}, async ({ call, get }) => {
    const response = await call('PATCH', `${BASE}/areas/area-2`, { short_label: 'BKHN', display_order: 9 });
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.changed, true);
    assert.equal(data.before.short_label, 'BK');
    assert.equal(data.after.short_label, 'BKHN');
    assert.equal(data.after.name, 'Bách Khoa');
    assert.deepEqual((await (await get('/api/v1/geo/areas')).json()).data.map((area) => area.area_id), ['area-1', 'area-2']);
    assert.equal((await (await get('/api/v1/geo/areas/area-2')).json()).data.display_order, 9);

    const same = await (await call('PATCH', `${BASE}/areas/area-2`, { short_label: 'BKHN' })).json();
    assert.equal(same.data.changed, false);

    assert.equal((await call('PATCH', `${BASE}/areas/area-2`, {})).status, 400);
    assert.equal((await call('PATCH', `${BASE}/areas/area-2`, { area_id: 'x' })).status, 400);
    assert.equal((await call('PATCH', `${BASE}/areas/area-2`, { anchor_latitude: 21 })).status, 400);
    assert.equal((await call('PATCH', `${BASE}/areas/missing`, { name: 'X' })).status, 404);
    const dup = await call('PATCH', `${BASE}/areas/area-2`, { name: 'LÊ VĂN LƯƠNG' });
    assert.equal(dup.status, 409);
    assert.equal((await call('PATCH', `${BASE}/areas/area-2`, { name: 'Bách Khoa' })).status, 200); // giữ nguyên tên của chính nó
  });
});

test('đổi tọa độ thủ công bỏ liên kết mã Goong, kèm mã mới thì giữ', async () => {
  const seed = seedAreas();
  seed.search_area[0].anchor_place_id = 'old-place';
  await withServer({ seed }, async ({ call }) => {
    const moved = await (await call('PATCH', `${BASE}/areas/area-1`, { anchor_latitude: 21.01, anchor_longitude: 105.81 })).json();
    assert.equal(moved.data.after.anchor_place_id, null);
    const named = await (await call('PATCH', `${BASE}/areas/area-1`, { anchor_latitude: 21.02, anchor_longitude: 105.82, anchor_place_id: 'new-place' })).json();
    assert.equal(named.data.after.anchor_place_id, 'new-place');
    const typo = await (await call('PATCH', `${BASE}/areas/area-1`, { anchor_address: 'Sửa lỗi chính tả' })).json();
    assert.equal(typo.data.after.anchor_place_id, 'new-place');
  });
});

test('luôn còn ít nhất một khu vực hoạt động', async () => {
  await withServer({}, async ({ call, get }) => {
    assert.equal((await call('PATCH', `${BASE}/areas/area-1`, { is_active: false })).status, 200);
    const last = await call('PATCH', `${BASE}/areas/area-2`, { is_active: false });
    assert.equal(last.status, 409);
    assert.equal((await last.json()).code, 'LAST_ACTIVE_AREA');
    assert.deepEqual((await (await get('/api/v1/geo/areas')).json()).data.map((area) => area.area_id), ['area-2']);
    assert.equal((await call('PATCH', `${BASE}/areas/area-3`, { is_active: true })).status, 200);
    assert.equal((await call('PATCH', `${BASE}/areas/area-2`, { is_active: false })).status, 200);
  });
});

test('hai lần tắt khu vực khác nhau cùng lúc: chỉ một lần thành công', async () => {
  const { areas, repository } = buildContext({ seed: { search_area: seedAreas().search_area.slice(0, 2) } });
  const results = await Promise.allSettled([
    areas.update('area-1', { is_active: false }),
    areas.update('area-2', { is_active: false })
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'LAST_ACTIVE_AREA');
  assert.equal((await repository.listAreas({ activeOnly: true })).length, 1);
});

test('lỗi giữa giao dịch không để lại thay đổi', async () => {
  const { repository } = buildContext();
  await assert.rejects(repository.transaction(async (tx) => {
    await tx.updateArea('area-1', { name: 'Đã đổi' });
    throw new Error('boom');
  }), /boom/);
  assert.equal((await repository.getArea('area-1')).name, 'Lê Văn Lương');
});

test('tạo khu vực đầu tiên dạng ẩn bị từ chối khi kho trống', async () => {
  await withServer({ seed: { search_area: [] } }, async ({ call }) => {
    const hidden = await call('POST', `${BASE}/areas`, validArea({ is_active: false }));
    assert.equal(hidden.status, 409);
    const first = await call('POST', `${BASE}/areas`, validArea());
    assert.equal(first.status, 201);
    assert.equal((await first.json()).data.area.display_order, 1);
  });
});

test('GET /areas/:id nội bộ trả khu vực đầy đủ cột; 404 khi không có', async () => {
  await withServer({}, async ({ call }) => {
    const { data } = await (await call('GET', `${BASE}/areas/area-3`)).json();
    assert.equal(data.area.anchor_latitude, 21.0312);
    assert.equal(data.area.is_active, false);
    assert.equal((await call('GET', `${BASE}/areas/zzz`)).status, 404);
  });
});

test('không có route xóa khu vực', async () => {
  await withServer({}, async ({ call, repository }) => {
    assert.equal((await call('DELETE', `${BASE}/areas/area-1`)).status, 405);
    assert.equal((await repository.listAreas()).length, 3);
    assert.ok(TOKEN);
  });
});
