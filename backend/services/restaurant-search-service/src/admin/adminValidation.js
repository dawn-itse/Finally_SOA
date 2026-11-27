const { ServiceError } = require('../errors');

const ID_PATTERN = /^[A-Za-z0-9-]{1,36}$/;
const SOURCE_PATTERN = /^[A-Z][A-Z0-9_]{0,29}$/;
const PHONE_PATTERN = /^[0-9+().\s-]{6,30}$/;
// Cho phép \t \n \r; chặn mọi ký tự điều khiển khác.
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const VISIBILITY_STATUSES = ['PENDING', 'PUBLISHED', 'REJECTED', 'SUSPENDED', 'CLOSED'];
const CREATE_STATUSES = ['PENDING', 'PUBLISHED'];
const MENU_ITEM_STATUSES = ['ACTIVE', 'INACTIVE'];
const PROVIDERS = ['GOONG', 'MANUAL', 'OSM'];
const MAX_PRICE_VND = 10_000_000;
const MAX_CUISINES = 10;
const MAX_INITIAL_ITEMS = 20;
const MAX_LIST_LIMIT = 100;

const invalid = (message) => new ServiceError(400, 'INVALID_REQUEST', message);

function parseBody(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid('Nội dung yêu cầu phải là một đối tượng JSON.');
  return raw;
}

function only(body, allowed) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) throw invalid(`Trường không được hỗ trợ: ${key}.`);
  }
}

function str(body, key, { max, required = false, nullable = false } = {}) {
  const value = body[key];
  if (value === undefined) {
    if (required) throw invalid(`Cần ${key}.`);
    return undefined;
  }
  if (value === null) {
    if (nullable) return null;
    throw invalid(`${key} không được để null.`);
  }
  if (typeof value !== 'string') throw invalid(`${key} phải là chuỗi.`);
  if (CONTROL_CHARS.test(value)) throw invalid(`${key} chứa ký tự điều khiển.`);
  const trimmed = value.trim();
  if (trimmed === '') {
    if (nullable) return null;
    throw invalid(`${key} không được để trống.`);
  }
  if (trimmed.length > max) throw invalid(`${key} tối đa ${max} ký tự.`);
  return trimmed;
}

function id(body, key, { required = false } = {}) {
  const value = body[key];
  if (value === undefined) {
    if (required) throw invalid(`Cần ${key}.`);
    return undefined;
  }
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw invalid(`${key} không hợp lệ.`);
  return value;
}

function oneOf(body, key, values, { required = false, fallback } = {}) {
  const value = body[key];
  if (value === undefined) {
    if (required) throw invalid(`Cần ${key}.`);
    return fallback;
  }
  if (!values.includes(value)) throw invalid(`${key} phải là một trong: ${values.join(', ')}.`);
  return value;
}

function coordinate(body, key, limit, required) {
  const value = body[key];
  if (value === undefined) {
    if (required) throw invalid(`Cần ${key}.`);
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) throw invalid(`${key} không hợp lệ.`);
  return value;
}

function timestamp(body, key, { required = false, nullable = false } = {}) {
  const value = body[key];
  if (value === undefined) {
    if (required) throw invalid(`Cần ${key}.`);
    return undefined;
  }
  if (value === null && nullable) return null;
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw invalid(`${key} phải là thời điểm ISO 8601 hợp lệ.`);
  return date;
}

function money(value, key) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_PRICE_VND) {
    throw invalid(`${key} phải là số nguyên đồng từ 0 đến ${MAX_PRICE_VND}.`);
  }
  return value;
}

function priceRange(body) {
  const minPrice = money(body.min_price, 'min_price');
  const maxPrice = money(body.max_price ?? body.min_price, 'max_price');
  if (maxPrice < minPrice) throw invalid('max_price phải lớn hơn hoặc bằng min_price.');
  return { min_price: minPrice, max_price: maxPrice };
}

const actor = (body) => id(body, 'acted_by', { required: true });

const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

function phone(body) {
  const value = str(body, 'phone', { max: 30, nullable: true });
  if (value && !PHONE_PATTERN.test(value)) throw invalid('phone không hợp lệ.');
  return value;
}

function cuisines(body) {
  const value = body.cuisines;
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_CUISINES) throw invalid(`cuisines phải là mảng tối đa ${MAX_CUISINES} tên.`);
  const names = value.map((name) => str({ name }, 'name', { max: 100, required: true }));
  const unique = new Map();
  for (const name of names) if (!unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), name); // giữ cách viết đầu tiên
  return [...unique.values()];
}

const LOCATION_KEYS = [
  'provider', 'provider_place_id', 'address_text', 'latitude', 'longitude', 'commune', 'province',
  'deprecated_address_text', 'geocoded_at', 'is_primary'
];

/**
 * Kiểm tra chi nhánh theo CHECK của schema:
 *   GOONG: có provider_place_id và geocoded_at | MANUAL: provider_place_id rỗng | OSM: có provider_place_id.
 * Khi partial = true (sửa), nhóm provider/provider_place_id/geocoded_at chỉ được kiểm tra nếu có gửi bất kỳ trường nào trong nhóm.
 */
function parseLocation(raw, { partial = false, withActor = false } = {}) {
  const body = parseBody(raw);
  only(body, withActor ? [...LOCATION_KEYS, 'acted_by'] : LOCATION_KEYS);
  const fields = {
    address_text: str(body, 'address_text', { max: 500, required: !partial }),
    latitude: coordinate(body, 'latitude', 90, !partial),
    longitude: coordinate(body, 'longitude', 180, !partial),
    commune: str(body, 'commune', { max: 100, nullable: true }),
    province: str(body, 'province', { max: 100, nullable: true }),
    deprecated_address_text: str(body, 'deprecated_address_text', { max: 500, nullable: true })
  };

  if (body.is_primary !== undefined) {
    if (typeof body.is_primary !== 'boolean') throw invalid('is_primary phải là true hoặc false.');
    fields.is_primary = body.is_primary;
  }

  const providerGroup = ['provider', 'provider_place_id', 'geocoded_at'].some((key) => body[key] !== undefined);
  if (!partial || providerGroup) {
    const provider = oneOf(body, 'provider', PROVIDERS, { required: true });
    const placeId = str(body, 'provider_place_id', { max: 512, nullable: true }) ?? null;
    const geocodedAt = timestamp(body, 'geocoded_at', { nullable: true }) ?? null;
    if (provider === 'MANUAL' && placeId !== null) throw invalid('Địa chỉ MANUAL không có provider_place_id.');
    if (provider !== 'MANUAL' && placeId === null) throw invalid(`Địa chỉ ${provider} cần provider_place_id.`);
    if (provider === 'GOONG' && geocodedAt === null) throw invalid('Địa chỉ GOONG cần geocoded_at.');
    Object.assign(fields, { provider, provider_place_id: placeId, geocoded_at: geocodedAt });
  }
  return { fields: compact(fields), providerGroup, acted_by: withActor ? actor(body) : undefined };
}

function parseInitialItem(raw) {
  const body = parseBody(raw);
  only(body, ['name', 'description', 'price']);
  return {
    name: str(body, 'name', { max: 200, required: true }),
    description: str(body, 'description', { max: 500, nullable: true }) ?? null,
    price: body.price === undefined ? null : parsePriceObject(body.price)
  };
}

function parsePriceObject(raw) {
  const body = parseBody(raw);
  only(body, ['min_price', 'max_price']);
  return priceRange(body);
}

function parseCreateRestaurant(raw) {
  const body = parseBody(raw);
  only(body, ['name', 'description', 'phone', 'cuisines', 'visibility_status', 'source_type', 'source_ref', 'location', 'menu_items', 'acted_by']);
  const items = body.menu_items ?? [];
  if (!Array.isArray(items) || items.length > MAX_INITIAL_ITEMS) throw invalid(`menu_items phải là mảng tối đa ${MAX_INITIAL_ITEMS} món.`);
  return {
    name: str(body, 'name', { max: 200, required: true }),
    description: str(body, 'description', { max: 500, nullable: true }) ?? null,
    phone: phone(body) ?? null,
    cuisines: cuisines(body) ?? [],
    visibility_status: oneOf(body, 'visibility_status', CREATE_STATUSES, { fallback: 'PUBLISHED' }),
    source_type: sourceType(body, 'COMMUNITY'),
    source_ref: str(body, 'source_ref', { max: 512, nullable: true }) ?? null,
    location: parseLocation(body.location).fields,
    menu_items: items.map(parseInitialItem),
    acted_by: actor(body)
  };
}

function sourceType(body, fallback) {
  const value = body.source_type ?? fallback;
  if (typeof value !== 'string' || !SOURCE_PATTERN.test(value)) throw invalid('source_type không hợp lệ (chữ HOA, số, gạch dưới, tối đa 30 ký tự).');
  return value;
}

function parseUpdateRestaurant(raw) {
  const body = parseBody(raw);
  only(body, ['name', 'description', 'phone', 'cuisines', 'acted_by']);
  const fields = compact({
    name: str(body, 'name', { max: 200 }),
    description: str(body, 'description', { max: 500, nullable: true }),
    phone: phone(body),
    cuisines: cuisines(body)
  });
  if (Object.keys(fields).length === 0) throw invalid('Cần ít nhất một trong name, description, phone, cuisines.');
  return { fields, acted_by: actor(body) };
}

function parseVisibility(raw) {
  const body = parseBody(raw);
  only(body, ['visibility_status', 'acted_by']);
  return { visibility_status: oneOf(body, 'visibility_status', VISIBILITY_STATUSES, { required: true }), acted_by: actor(body) };
}

function parseActorOnly(raw) {
  const body = parseBody(raw);
  only(body, ['acted_by']);
  return { acted_by: actor(body) };
}

function parseCreateMenuItem(raw) {
  const body = parseBody(raw);
  only(body, ['name', 'description', 'status', 'price', 'source_type', 'source_reference', 'acted_by']);
  return {
    name: str(body, 'name', { max: 200, required: true }),
    description: str(body, 'description', { max: 500, nullable: true }) ?? null,
    status: oneOf(body, 'status', MENU_ITEM_STATUSES, { fallback: 'ACTIVE' }),
    price: body.price === undefined ? null : parsePriceObject(body.price),
    source_type: sourceType(body, 'CONTRIBUTION'),
    source_reference: str(body, 'source_reference', { max: 255, nullable: true }) ?? null,
    acted_by: actor(body)
  };
}

function parseUpdateMenuItem(raw) {
  const body = parseBody(raw);
  only(body, ['name', 'description', 'status', 'acted_by']);
  const fields = compact({
    name: str(body, 'name', { max: 200 }),
    description: str(body, 'description', { max: 500, nullable: true }),
    status: oneOf(body, 'status', MENU_ITEM_STATUSES)
  });
  if (Object.keys(fields).length === 0) throw invalid('Cần ít nhất một trong name, description, status.');
  return { fields, acted_by: actor(body) };
}

function parseApplyPrice(raw) {
  const body = parseBody(raw);
  only(body, ['min_price', 'max_price', 'source_type', 'source_reference', 'referenced_price_assertion_id', 'acted_by']);
  return {
    ...priceRange(body),
    source_type: sourceType(body, 'PRICE_REPORT'),
    source_reference: str(body, 'source_reference', { max: 255, nullable: true }) ?? null,
    referenced_price_assertion_id: id(body, 'referenced_price_assertion_id') ?? null,
    acted_by: actor(body)
  };
}

function parseList(searchParams) {
  const status = searchParams.get('status');
  if (status !== null && !VISIBILITY_STATUSES.includes(status)) throw invalid(`status phải là một trong: ${VISIBILITY_STATUSES.join(', ')}.`);
  const q = searchParams.get('q')?.trim() || null;
  if (q && (q.length > 100 || CONTROL_CHARS.test(q))) throw invalid('q không hợp lệ (tối đa 100 ký tự).');
  const number = (name, fallback, min, max) => {
    const raw = searchParams.get(name);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) throw invalid(`${name} phải là số nguyên từ ${min} đến ${max}.`);
    return value;
  };
  return { status, q, limit: number('limit', 20, 1, MAX_LIST_LIMIT), offset: number('offset', 0, 0, 100_000) };
}

module.exports = {
  ID_PATTERN,
  VISIBILITY_STATUSES,
  parseLocation,
  parseCreateRestaurant,
  parseUpdateRestaurant,
  parseVisibility,
  parseActorOnly,
  parseCreateMenuItem,
  parseUpdateMenuItem,
  parseApplyPrice,
  parseList
};
