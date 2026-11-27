const { createServer } = require('node:http');
const { createGeoHandler } = require('../src/index');
const { createGoongClient } = require('../src/goongClient');
const { createGeoService } = require('../src/geoService');
const { createAreaService } = require('../src/areaService');
const { createMemoryAreaRepository } = require('../src/repositories/memoryAreaRepository');

const silentLogger = { log() {}, warn() {}, error() {} };
const TOKEN = 'test-internal-token';
const CENTER = { lat: 21.0048, lng: 105.8042 };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Goong giả: `handler(url)` trả Response hoặc object JSON; ghi lại mọi lượt gọi (endpoint + tham số, bỏ api_key). */
function fakeGoong(handler) {
  const calls = [];
  const fetchImpl = async (url) => {
    const params = Object.fromEntries(url.searchParams);
    const apiKey = params.api_key;
    delete params.api_key;
    calls.push({ endpoint: url.pathname, params, apiKey });
    const result = await handler(url.pathname, params);
    return result instanceof Response ? result : json(result);
  };
  return { calls, fetchImpl };
}

const detailPayload = ({ id, name = 'Quán', address = '1 Phố', lat = CENTER.lat, lng = CENTER.lng, ...rest }) => ({
  status: 'OK',
  result: {
    place_id: id, name, formatted_address: address, geometry: { location: { lat, lng } },
    types: ['restaurant'], compound: { commune: 'Phường A', province: 'Hà Nội' }, deprecated_description: 'Địa chỉ cũ', ...rest
  }
});

const seedAreas = () => ({
  search_area: [
    { area_id: 'area-1', name: 'Lê Văn Lương', short_label: 'LVL', anchor_address: '68 Lê Văn Lương', anchor_latitude: 21.0048, anchor_longitude: 105.8042, anchor_place_id: null, display_order: 1, is_active: true },
    { area_id: 'area-2', name: 'Bách Khoa', short_label: 'BK', anchor_address: '1 Đại Cồ Việt', anchor_latitude: 21.0051, anchor_longitude: 105.8432, anchor_place_id: null, display_order: 2, is_active: true },
    { area_id: 'area-3', name: 'Duy Tân', short_label: 'DT', anchor_address: '78 Duy Tân', anchor_latitude: 21.0312, anchor_longitude: 105.7829, anchor_place_id: null, display_order: 3, is_active: false }
  ]
});

function buildContext({ goongHandler = () => ({ status: 'ZERO_RESULTS' }), apiKey = 'test-key', seed = seedAreas(), token = TOKEN, randomId, mapStyleUrl = null } = {}) {
  const goongFake = fakeGoong(goongHandler);
  const goong = createGoongClient({ apiKey, fetchImpl: goongFake.fetchImpl, now: () => new Date('2026-11-27T05:00:00Z'), logger: silentLogger });
  const repository = createMemoryAreaRepository(seed);
  const areas = createAreaService({ repository, goong, ...(randomId && { randomId }) });
  return { context: { geo: createGeoService({ goong, mapStyleUrl }), areas, internalToken: token }, goongFake, repository, goong, areas };
}

async function withServer(options, fn) {
  const built = buildContext(options);
  const handle = createGeoHandler(async () => built.context, silentLogger);
  const server = createServer((req, res) => void handle(req, res, new URL(req.url, 'http://localhost')));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path, headers = {}) => fetch(base + path, { headers });
  const call = (method, path, body, headers = {}) => fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Internal-Token': TOKEN, ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  });
  try {
    await fn({ base, get, call, ...built });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

module.exports = { silentLogger, TOKEN, CENTER, json, fakeGoong, detailPayload, seedAreas, buildContext, withServer };
