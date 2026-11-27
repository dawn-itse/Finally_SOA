const { ServiceError } = require('./errors');

const ID_PATTERN = /^[A-Za-z0-9-]{1,36}$/;
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const MAX_DESTINATIONS = 10;
const MAX_RADIUS_KM = 50;

const invalid = (message, details) => new ServiceError(400, 'INVALID_REQUEST', message, details);

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** "lat,lng" -> { lat, lng } hoặc null. Thứ tự lat,lng giống Goong. */
function parseCoordinates(value) {
  const pieces = cleanText(value).split(',').map((part) => part.trim());
  if (pieces.length !== 2 || pieces.some((part) => !NUMBER_PATTERN.test(part))) return null;
  const [lat, lng] = pieces.map(Number);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

const formatPoint = ({ lat, lng }) => `${lat},${lng}`;

function parseRadiusKm(value) {
  if (typeof value !== 'string' || !NUMBER_PATTERN.test(value.trim())) return null;
  const radius = Number(value);
  return radius > 0 && radius <= MAX_RADIUS_KM ? radius : null;
}

// ---------- SEARCH_AREA ----------

const AREA_FIELDS = ['name', 'short_label', 'anchor_address', 'anchor_latitude', 'anchor_longitude', 'anchor_place_id', 'display_order', 'is_active'];

function requiredText(body, field, max) {
  const value = body[field];
  if (typeof value !== 'string' || !value.trim()) throw invalid(`${field} là bắt buộc.`, { field });
  const text = value.trim();
  if (text.length > max) throw invalid(`${field} tối đa ${max} ký tự.`, { field });
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) throw invalid(`${field} chứa ký tự điều khiển.`, { field });
  return text;
}

function coordinate(body, field, limit) {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) {
    throw invalid(`${field} phải là số trong khoảng -${limit} đến ${limit}.`, { field });
  }
  return Math.round(value * 1e7) / 1e7; // DECIMAL(10,7)
}

/**
 * Kiểm tra body tạo/sửa khu vực. `partial` (PATCH) chỉ kiểm tra trường có mặt.
 * Trả về object chỉ gồm các trường đã kiểm tra; từ chối trường lạ.
 */
function parseAreaInput(body, { partial }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Nội dung yêu cầu phải là một object JSON.');
  const unknown = Object.keys(body).filter((key) => !AREA_FIELDS.includes(key));
  if (unknown.length > 0) throw invalid(`Trường không được hỗ trợ: ${unknown.join(', ')}.`, { fields: unknown });
  const has = (field) => Object.hasOwn(body, field);
  const out = {};

  if (!partial || has('name')) out.name = requiredText(body, 'name', 100);
  if (!partial || has('short_label')) out.short_label = requiredText(body, 'short_label', 40);

  const hasLat = has('anchor_latitude');
  const hasLng = has('anchor_longitude');
  if (hasLat !== hasLng) throw invalid('anchor_latitude và anchor_longitude phải đi cùng nhau.');
  if (hasLat) {
    out.anchor_latitude = coordinate(body, 'anchor_latitude', 90);
    out.anchor_longitude = coordinate(body, 'anchor_longitude', 180);
  }

  if (has('anchor_place_id')) {
    const placeId = body.anchor_place_id;
    if (placeId !== null && (typeof placeId !== 'string' || !placeId.trim() || placeId.trim().length > 512)) {
      throw invalid('anchor_place_id phải là chuỗi tối đa 512 ký tự hoặc null.', { field: 'anchor_place_id' });
    }
    out.anchor_place_id = placeId === null ? null : placeId.trim();
  }

  // Địa chỉ mốc có thể được điền từ Goong khi có anchor_place_id mà thiếu tọa độ.
  if (has('anchor_address')) out.anchor_address = requiredText(body, 'anchor_address', 500);
  else if (!partial && !(out.anchor_place_id && !hasLat)) throw invalid('anchor_address là bắt buộc.', { field: 'anchor_address' });
  if (!partial && !hasLat && !out.anchor_place_id) {
    throw invalid('Cần anchor_latitude/anchor_longitude hoặc anchor_place_id của Goong.');
  }

  if (has('display_order')) {
    const order = body.display_order;
    if (!Number.isInteger(order) || order < 0 || order > 10000) throw invalid('display_order phải là số nguyên từ 0 đến 10000.', { field: 'display_order' });
    out.display_order = order;
  }
  if (has('is_active')) {
    if (typeof body.is_active !== 'boolean') throw invalid('is_active phải là true hoặc false.', { field: 'is_active' });
    out.is_active = body.is_active;
  }
  if (partial && Object.keys(out).length === 0) throw invalid('Cần ít nhất một trường để cập nhật.');
  return out;
}

module.exports = {
  ID_PATTERN, MAX_DESTINATIONS, MAX_RADIUS_KM,
  cleanText, parseCoordinates, formatPoint, parseRadiusKm, parseAreaInput
};
