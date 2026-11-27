/**
 * Browser demo services backed by localStorage
 * Implements the preview's ERD tables and business constraints:
 * - APP_USER.role (USER | ADMIN) controls moderation permissions
 * - RESTAURANT splits visibility_status (PENDING | PUBLISHED | REJECTED | SUSPENDED | CLOSED)
 *   from verification: no is_verified column, "Đã xác minh" = verified_at IS NOT NULL (verified_at and
 *   verified_by are set/cleared together). Verification covers the whole restaurant, prices included.
 * - RESTAURANT_LOCATION enforces <= 1 is_primary=true per restaurant & unique (provider, provider_place_id) for external places
 * - PRICE_ASSERTION uses is_current (<= 1 true per menu_item_id), min_price >= 0, max_price >= min_price, ISO 4217 currency;
 *   clearing a price sets is_current=false (item returns to NO_PRICE while preserving history).
 *   It has no status / verified_at / verified_by / observed_at: created_at is the Admin approval (or import) time.
 * - PRICE_REPORT uses report_type (WRONG_PRICE | MISSING_PRICE), reviewed_by, review_note, reviewed_at
 *   (reviewed_at is the effective date of an approved price; there is no observed_at),
 *   and enforces price_assertion_id belongs to menu_item_id when non-null.
 *   submitted_by is NOT NULL: always the signed-in ACTIVE user's id taken from the session (a client-supplied
 *   value is ignored); Guest, non-ACTIVE users and ADMIN accounts are rejected (same rule for CONTRIBUTION / REVIEW)
 * - CONTRIBUTION uses 4 types (NEW_RESTAURANT | RESTAURANT_CORRECTION | MENU_CORRECTION | CLOSED_REPORT),
 *   jsonb payload (one schema per type, versioned by payload.schema_version), top-level evidence_uri,
 *   and restaurant_id=NULL for NEW_RESTAURANT until Admin approves
 * - REVIEW enforces integer rating 1..5 and unique (restaurant_id, author_user_id)
 * - USER_PREFERENCE (PK=user_id), USER_RESTRICTION, USER_FAVORITE_DISH, FAVORITE_RESTAURANT sync on login;
 *   Guest preferences stay in localStorage without server rows
 * - AUDIT_EVENT is append-only
 */

import { ERD_DATABASE, WEATHER_CONTEXTS } from './mockDatabase.js';
import { formatK, normalizeDishText, readDishName } from './nlpParser.js';

export const DEFAULT_BUDGET = 50000;
export const DEFAULT_RADIUS_KM = 2;

const serviceLogs = [];
let logSubscriber = null;
const GUEST_STORAGE_KEY = 'muagiday_guest_preferences_v1';
const authSessions = { user: null, admin: null };
export const DB_STORAGE_KEY = 'muagiday_erd_db_v2';

const PERSISTED_TABLES = [
  'APP_USER',
  'SEARCH_AREA',
  'RESTAURANT',
  'RESTAURANT_LOCATION',
  'RESTAURANT_DISCOVERY',
  'MENU_ITEM',
  'PRICE_ASSERTION',
  'PRICE_REPORT',
  'REVIEW',
  'USER_PREFERENCE',
  'USER_RESTRICTION',
  'USER_FAVORITE_DISH',
  'FAVORITE_RESTAURANT',
  'CONTRIBUTION',
  'AUDIT_EVENT'
];

const INITIAL_DB_SNAPSHOT = JSON.stringify(
  Object.fromEntries(PERSISTED_TABLES.map((t) => [t, ERD_DATABASE[t]]))
);

const TRANSPORT_SPEED_KMH = {
  MOTORBIKE: 22,
  FLEXIBLE: 22,
  WALKING: 4.8
};

const CONTRIBUTION_TYPES = [
  'NEW_RESTAURANT',
  'RESTAURANT_CORRECTION',
  'MENU_CORRECTION',
  'CLOSED_REPORT'
];

/**
 * CONTRIBUTION.payload (jsonb): one JSON schema per contribution_type, versioned by payload.schema_version.
 * The DB cannot validate inside jsonb, so the service validates before saving (mirrors docs/ERD.md section 4).
 * Fields not listed here are kept as-is; ids written into a payload have no FK and are re-checked at approval time.
 */
const CONTRIBUTION_PAYLOAD_SCHEMA_VERSION = 1;
const CONTRIBUTION_PAYLOAD_RULES = {
  NEW_RESTAURANT: { required: ['name', 'address'], anyOf: [] },
  RESTAURANT_CORRECTION: { required: [], anyOf: ['name', 'address', 'phone', 'openUntil', 'note'] },
  MENU_CORRECTION: { required: [], anyOf: ['dishName', 'dishPrice', 'note'] },
  CLOSED_REPORT: { required: [], anyOf: [] }
};
const CONTRIBUTION_TEXT_FIELDS = ['name', 'address', 'phone', 'openUntil', 'dishName', 'dishDescription', 'note'];

function validateContributionPayload(contributionType, payload) {
  const rules = CONTRIBUTION_PAYLOAD_RULES[contributionType];
  for (const key of rules.required) {
    if (payload[key] === undefined) return `Thiếu trường bắt buộc "${key}" trong nội dung đóng góp.`;
  }
  if (rules.anyOf.length > 0 && !rules.anyOf.some((key) => payload[key] !== undefined)) {
    return 'Vui lòng nhập ít nhất một thông tin cần sửa hoặc ghi chú cho Admin.';
  }
  for (const key of CONTRIBUTION_TEXT_FIELDS) {
    if (payload[key] !== undefined && (typeof payload[key] !== 'string' || payload[key].length > 500)) {
      return `Trường "${key}" phải là chuỗi tối đa 500 ký tự.`;
    }
  }
  if (payload.dishPrice !== undefined && (!Number.isFinite(Number(payload.dishPrice)) || Number(payload.dishPrice) < 0)) {
    return 'Giá món (dishPrice) phải là số lớn hơn hoặc bằng 0.';
  }
  if (payload.latitude !== undefined && !(Number(payload.latitude) >= -90 && Number(payload.latitude) <= 90)) {
    return 'latitude phải nằm trong khoảng -90 đến 90.';
  }
  if (payload.longitude !== undefined && !(Number(payload.longitude) >= -180 && Number(payload.longitude) <= 180)) {
    return 'longitude phải nằm trong khoảng -180 đến 180.';
  }
  if (payload.location !== undefined && (!isGoongLocation(payload.location) || payload.location.address_text !== payload.address)) {
    return 'Vui lòng chọn lại địa chỉ Goong trước khi gửi.';
  }
  return null;
}

const DEFAULT_LEARNED_STATS = {
  searchCount: 17,
  chosenCount: 3,
  topCategory: 'phở, bún, mì'
};

/**
 * Migrate rows saved by older versions of the mock (before verification moved to RESTAURANT.verified_at only):
 * drop RESTAURANT.is_verified and PRICE_ASSERTION.observed_at / verified_at / verified_by.
 */
function normalizeLegacyRows() {
  ERD_DATABASE.RESTAURANT.forEach((r) => {
    if ('is_verified' in r) {
      if (!r.is_verified) {
        r.verified_at = null;
        r.verified_by = null;
      }
      delete r.is_verified;
    }
    if (!r.verified_at) r.verified_by = null;
  });
  ERD_DATABASE.PRICE_ASSERTION.forEach((a) => {
    delete a.observed_at;
    delete a.verified_at;
    delete a.verified_by;
  });
  ERD_DATABASE.RESTAURANT_LOCATION.forEach((location) => {
    if (!location.provider) {
      const hasOsmRef = location.osm_type && location.osm_id;
      location.provider = hasOsmRef ? 'OSM' : 'MANUAL';
      location.provider_place_id = hasOsmRef ? `${location.osm_type}/${location.osm_id}` : null;
    }
    delete location.osm_type;
    delete location.osm_id;
    location.commune ??= null;
    location.province ??= null;
    location.deprecated_address_text ??= null;
    location.geocoded_at ??= null;
  });
  ERD_DATABASE.USER_PREFERENCE.forEach((pref) => {
    if (pref.settings) delete pref.settings.default_radius_km;
  });
}

export function syncDatabaseFromStorage() {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    for (const table of PERSISTED_TABLES) {
      if (Array.isArray(parsed[table])) {
        ERD_DATABASE[table].splice(0, ERD_DATABASE[table].length, ...parsed[table]);
      }
    }
    normalizeLegacyRows();
    return true;
  } catch {
    return false;
  }
}

function persistDatabase() {
  try {
    if (typeof localStorage === 'undefined') return;
    const snapshot = Object.fromEntries(PERSISTED_TABLES.map((t) => [t, ERD_DATABASE[t]]));
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota errors
  }
}

syncDatabaseFromStorage();

function generateUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function onServiceLog(callback) {
  logSubscriber = callback;
}

export function emitServiceTrace(serviceName, endpoint, payloadSummary) {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const entry = {
    id: Date.now() + Math.random(),
    serviceName,
    endpoint,
    payloadSummary,
    timeStr
  };
  serviceLogs.unshift(entry);
  if (logSubscriber) {
    logSubscriber(serviceLogs);
  }
}

/**
 * Guest LocalStorage Helper (Guest has no row in USER_PREFERENCE on server)
 */
function loadGuestState() {
  const fallback = {
    diet_mode: null,
    transport_mode: 'FLEXIBLE',
    restriction_ids: [],
    favorite_dish_category_ids: [],
    favorite_restaurant_ids: ['20000000-0000-4000-8000-000000000001'],
    settings: {
      default_budget: 50000,
      learned_stats: { ...DEFAULT_LEARNED_STATS }
    },
    updated_at: new Date().toISOString()
  };
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed.settings) delete parsed.settings.default_radius_km;
    return {
      ...fallback,
      ...parsed,
      settings: {
        ...fallback.settings,
        ...(parsed.settings || {}),
        learned_stats: {
          ...fallback.settings.learned_stats,
          ...(parsed.settings?.learned_stats || {})
        }
      }
    };
  } catch {
    return fallback;
  }
}

function saveGuestState(nextState) {
  try {
    const payload = { ...nextState, updated_at: new Date().toISOString() };
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Auth Session Helpers (User session separated from Admin Portal session)
 */
function loadSessionUser() {
  const session = authSessions.user;
  return session && Date.parse(session.expires_at) > Date.now() ? session.user : null;
}

function loadAdminSessionUser() {
  const session = authSessions.admin;
  return session && Date.parse(session.expires_at) > Date.now() ? session.user : null;
}

function toPublicUser(user) {
  if (!user) return null;
  return {
    user_id: user.user_id,
    email: user.email,
    display_name: user.display_name,
    account_status: user.account_status,
    role: user.role || 'USER'
  };
}

function requireActiveUser(actionLabel) {
  const user = loadSessionUser();
  if (!user) {
    return {
      ok: false,
      error: `Bạn cần đăng nhập để ${actionLabel}. Khách (Guest) không có bản ghi APP_USER trên server.`
    };
  }
  if (user.account_status !== 'ACTIVE') {
    return {
      ok: false,
      error: `Tài khoản đang ở trạng thái ${user.account_status}, không thể ${actionLabel}.`
    };
  }
  return { ok: true, user };
}

function requireAdmin(actionLabel) {
  const adminUser = loadAdminSessionUser();
  if (!adminUser) {
    return { ok: false, error: `Bạn cần đăng nhập tài khoản Admin để ${actionLabel}.` };
  }
  return { ok: true, user: adminUser };
}

function fail(error) {
  emitServiceTrace('auth-guard', 'REJECTED', error);
  return { ok: false, error };
}

/**
 * Append-only AUDIT_EVENT helper
 */
function appendAuditEvent({ actorUserId, entityType, entityId, action, beforeData, afterData }) {
  const event = {
    audit_event_id: generateUuid(),
    actor_user_id: actorUserId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    before_data: beforeData,
    after_data: afterData,
    occurred_at: new Date().toISOString()
  };
  ERD_DATABASE.AUDIT_EVENT.unshift(event);
  persistDatabase();
  emitServiceTrace(
    'audit-moderation-service',
    'POST /api/v1/audit-events',
    `[${action}] ${entityType}(${String(entityId).slice(-6)}) bởi User(${String(actorUserId).slice(-4)})`
  );
  return event;
}

function hasCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}

function isGoongLocation(location) {
  return location?.provider === 'GOONG' && typeof location.provider_place_id === 'string' &&
    Boolean(location.provider_place_id.trim()) && typeof location.address_text === 'string' &&
    Boolean(location.address_text.trim()) && Number.isFinite(Date.parse(location.geocoded_at)) &&
    hasCoordinates(location.latitude, location.longitude);
}

function manualCoordinate(value) {
  return value === undefined || value === null || String(value).trim() === '' ? NaN : Number(value);
}

function approvedLocation(address, payload, editedData) {
  const manualOverride = editedData.latitude !== undefined || editedData.longitude !== undefined;
  const location = manualOverride ? null : (editedData.location ?? payload.location);
  if (isGoongLocation(location) && location.address_text === address) return location;

  const sameAddress = address === payload.address;
  const coords = manualOverride ? editedData : (sameAddress ? payload : {});
  const latitude = manualCoordinate(coords.latitude);
  const longitude = manualCoordinate(coords.longitude);
  return { address_text: address, latitude, longitude, provider: 'MANUAL' };
}

function addOrUpdateRestaurantLocation(restaurantId, location, existing = null) {
  if (!location.address_text || !hasCoordinates(location.latitude, location.longitude)) {
    return fail('Hãy chọn địa chỉ Goong hoặc nhập đủ vĩ độ và kinh độ đã kiểm tra trước khi duyệt.');
  }
  if (location.provider_place_id && ERD_DATABASE.RESTAURANT_LOCATION.some((row) =>
    row.location_id !== existing?.location_id && row.provider === location.provider && row.provider_place_id === location.provider_place_id
  )) {
    return fail('Mã địa điểm này đã có trong danh mục quán. Hãy kiểm tra quán hoặc chi nhánh trùng.');
  }

  const values = {
    address_text: location.address_text,
    latitude: location.latitude,
    longitude: location.longitude,
    provider: location.provider,
    provider_place_id: location.provider_place_id ?? null,
    commune: location.commune ?? null,
    province: location.province ?? null,
    deprecated_address_text: location.deprecated_address_text ?? null,
    geocoded_at: location.geocoded_at ?? null,
    is_primary: true
  };
  ERD_DATABASE.RESTAURANT_LOCATION.forEach((row) => {
    if (row.restaurant_id === restaurantId && row !== existing) row.is_primary = false;
  });
  if (existing) return { ok: true, data: Object.assign(existing, values) };

  const created = { location_id: generateUuid(), restaurant_id: restaurantId, ...values };
  ERD_DATABASE.RESTAURANT_LOCATION.push(created);
  return { ok: true, data: created };
}

/**
 * PRICE_ASSERTION Helpers:
 * - At most 1 row per menu_item_id has is_current = true
 * - No row with is_current = true -> NO_PRICE
 * - Enforces min_price >= 0, max_price >= min_price, currency ISO 4217 (3 chars)
 */
export function resolveMenuItemPrice(menuItemId) {
  const assertions = ERD_DATABASE.PRICE_ASSERTION.filter((a) => a.menu_item_id === menuItemId);
  const sortedHistory = [...assertions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const current = assertions.find((a) => a.is_current === true) || null;
  const reports = ERD_DATABASE.PRICE_REPORT.filter((r) => r.menu_item_id === menuItemId);

  if (!current) {
    return {
      hasPrice: false,
      minPrice: null,
      maxPrice: null,
      price: null,
      currency: 'VND',
      currentAssertion: null,
      assertionHistory: sortedHistory,
      reports
    };
  }

  return {
    hasPrice: true,
    minPrice: Number(current.min_price),
    maxPrice: Number(current.max_price),
    price: Number(current.min_price),
    currency: current.currency || 'VND',
    currentAssertion: current,
    assertionHistory: sortedHistory,
    reports
  };
}

function setCurrentMenuItemPrice({
  menuItemId,
  minPrice,
  maxPrice = minPrice,
  currency = 'VND',
  sourceType = 'ADMIN_VERIFICATION',
  sourceReference = null
}) {
  const minVal = Number(minPrice);
  const maxVal = Number(maxPrice ?? minPrice);
  const cur = String(currency || 'VND').trim().toUpperCase();

  if (!Number.isFinite(minVal) || minVal < 0) {
    return { ok: false, error: 'min_price phải là số lớn hơn hoặc bằng 0.' };
  }
  if (!Number.isFinite(maxVal) || maxVal < minVal) {
    return { ok: false, error: 'max_price phải lớn hơn hoặc bằng min_price.' };
  }
  if (!/^[A-Z]{3}$/.test(cur)) {
    return { ok: false, error: 'currency phải là mã ISO 4217 gồm 3 ký tự (VD: VND).' };
  }

  const nowIso = new Date().toISOString();
  const previousCurrent = ERD_DATABASE.PRICE_ASSERTION.find(
    (a) => a.menu_item_id === menuItemId && a.is_current === true
  ) || null;

  // Preserve history: mark all previous rows is_current = false (partial unique index invariant)
  ERD_DATABASE.PRICE_ASSERTION.forEach((a) => {
    if (a.menu_item_id === menuItemId && a.is_current) {
      a.is_current = false;
    }
  });

  const nextAssertion = {
    price_assertion_id: generateUuid(),
    menu_item_id: menuItemId,
    min_price: minVal,
    max_price: maxVal,
    currency: cur,
    is_current: true,
    source_type: sourceType,
    source_reference: sourceReference,
    created_at: nowIso
  };
  ERD_DATABASE.PRICE_ASSERTION.unshift(nextAssertion);
  persistDatabase();
  return { ok: true, data: nextAssertion, previousCurrent };
}

function clearCurrentMenuItemPrice(menuItemId) {
  const previousCurrent = ERD_DATABASE.PRICE_ASSERTION.find(
    (a) => a.menu_item_id === menuItemId && a.is_current === true
  ) || null;
  if (!previousCurrent) {
    return { ok: true, previousCurrent: null };
  }
  previousCurrent.is_current = false;
  persistDatabase();
  return { ok: true, previousCurrent };
}

/**
 * Verification belongs to the restaurant (its prices included), not to a single price row.
 * Every Admin approval that changes a restaurant's info, menu or price refreshes
 * RESTAURANT.verified_at / verified_by, so the "Đã xác minh" label never outlives an unchecked change.
 */
function refreshRestaurantVerification(restaurantId, adminUser, via = {}) {
  const rest = ERD_DATABASE.RESTAURANT.find((r) => r.restaurant_id === restaurantId);
  if (!rest) return null;
  const nowIso = new Date().toISOString();
  const before = { verified_at: rest.verified_at || null, verified_by: rest.verified_by || null };
  rest.verified_at = nowIso;
  rest.verified_by = adminUser.user_id;
  rest.updated_at = nowIso;
  persistDatabase();
  appendAuditEvent({
    actorUserId: adminUser.user_id,
    entityType: 'RESTAURANT',
    entityId: rest.restaurant_id,
    action: 'ADMIN_REFRESH_RESTAURANT_VERIFICATION',
    beforeData: before,
    afterData: { verified_at: rest.verified_at, verified_by: rest.verified_by, ...via }
  });
  return rest;
}

/**
 * Sync Guest localStorage preferences into normalized user preference tables upon first login
 */
function ensureUserPreferenceSynced(userId) {
  let pref = ERD_DATABASE.USER_PREFERENCE.find((p) => p.user_id === userId);
  if (pref) return pref;

  const guest = loadGuestState();
  const nowIso = new Date().toISOString();
  pref = {
    user_id: userId,
    diet_mode: guest.diet_mode ?? null,
    transport_mode: guest.transport_mode || 'FLEXIBLE',
    settings: {
      default_budget: guest.settings?.default_budget || 50000,
      learned_stats: { ...(guest.settings?.learned_stats || DEFAULT_LEARNED_STATS) }
    },
    updated_at: nowIso
  };
  ERD_DATABASE.USER_PREFERENCE.push(pref);

  (guest.restriction_ids || []).forEach((restriction_id) => {
    ERD_DATABASE.USER_RESTRICTION.push({ user_id: userId, restriction_id });
  });
  (guest.favorite_dish_category_ids || []).slice(0, 3).forEach((dish_category_id) => {
    ERD_DATABASE.USER_FAVORITE_DISH.push({ user_id: userId, dish_category_id });
  });
  (guest.favorite_restaurant_ids || []).forEach((restaurant_id) => {
    ERD_DATABASE.FAVORITE_RESTAURANT.push({ user_id: userId, restaurant_id, created_at: nowIso });
  });
  persistDatabase();
  return pref;
}

function parseContributionPayload(contrib) {
  if (!contrib || !contrib.payload) return {};
  if (typeof contrib.payload === 'object') return contrib.payload;
  try {
    return JSON.parse(contrib.payload) || {};
  } catch {
    return {};
  }
}

function findMenuItemByName(restaurantId, name) {
  const needle = (name || '').trim().toLowerCase();
  if (!needle) return null;
  return (
    ERD_DATABASE.MENU_ITEM.find(
      (m) => m.restaurant_id === restaurantId && m.name.trim().toLowerCase() === needle
    ) || null
  );
}

/**
 * Haversine distance in km between two coordinates
 */
function computeDistanceKm(lat1, lon1, lat2, lon2) {
  if (!hasCoordinates(lat1, lon1) || !hasCoordinates(lat2, lon2)) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function findGoongLocation(placeId) {
  if (!placeId) return undefined;
  return ERD_DATABASE.RESTAURANT_LOCATION.find((row) => row.provider === 'GOONG' && row.provider_place_id === placeId);
}

function canSuggestRestaurant(restaurant) {
  return ['PENDING', 'PUBLISHED'].includes(restaurant?.visibility_status);
}

function readDiscoverySuggestions(keyword, anchor, radiusKm) {
  const nearestByRestaurant = new Map();
  if (!anchor || !keyword) return [];

  for (const discovery of ERD_DATABASE.RESTAURANT_DISCOVERY) {
    if (discovery.dish_keyword !== keyword) continue;
    const location = ERD_DATABASE.RESTAURANT_LOCATION.find((row) => row.location_id === discovery.location_id);
    if (!location || location.provider !== 'GOONG') continue;
    const restaurant = ERD_DATABASE.RESTAURANT.find((row) => row.restaurant_id === location.restaurant_id);
    if (!canSuggestRestaurant(restaurant)) continue;
    const distanceKm = computeDistanceKm(anchor.latitude, anchor.longitude, location.latitude, location.longitude);
    if (distanceKm === null || distanceKm > radiusKm) continue;
    if (distanceKm >= (nearestByRestaurant.get(restaurant.restaurant_id)?.distanceKm ?? Infinity)) continue;
    nearestByRestaurant.set(restaurant.restaurant_id, {
      id: restaurant.restaurant_id,
      name: restaurant.name,
      address: location.address_text,
      latitude: location.latitude,
      longitude: location.longitude,
      distanceKm
    });
  }
  return [...nearestByRestaurant.values()].sort((a, b) => a.distanceKm - b.distanceKm);
}

function looksLikeFoodPlace(place, name, keyword) {
  const types = Array.isArray(place.types) ? place.types : [];
  if (types.some((type) => /^(restaurant|food|cafe|bakery|meal_takeaway|meal_delivery)$/.test(type))) return true;
  if (types.some((type) => /^(house_number|street|route|administrative_area(?:_level_\d+)?)$/.test(type))) return false;
  return name !== normalizeDishText(place.address_text) &&
    (` ${name} `.includes(` ${keyword} `) || /\b(quan|nha hang|tiem an)\b/.test(name));
}

/**
 * Hydrate a RESTAURANT row with its related ERD entities into a view-model
 */
function hydrateRestaurant(restaurantRow, anchor, transportMode = 'MOTORBIKE') {
  const restaurantId = restaurantRow.restaurant_id;

  const locations = ERD_DATABASE.RESTAURANT_LOCATION.filter((l) => l.restaurant_id === restaurantId);
  const primaryLocation = locations.find((l) => l.is_primary) ?? locations[0] ?? null;

  const cuisineIds = ERD_DATABASE.RESTAURANT_CUISINE
    .filter((rc) => rc.restaurant_id === restaurantId)
    .map((rc) => rc.cuisine_id);
  const cuisines = ERD_DATABASE.CUISINE.filter((c) => cuisineIds.includes(c.cuisine_id));
  const categoryLabel = cuisines.map((c) => c.name).join(' · ') || 'Quán ăn sáng';

  const rawMenuItems = ERD_DATABASE.MENU_ITEM.filter(
    (m) => m.restaurant_id === restaurantId && m.status === 'ACTIVE'
  );
  const menu = rawMenuItems.map((m) => {
    const priceInfo = resolveMenuItemPrice(m.menu_item_id);
    return {
      id: m.menu_item_id,
      menu_item_id: m.menu_item_id,
      restaurant_id: m.restaurant_id,
      name: m.name,
      description: m.description,
      status: m.status,
      diet_tags: m.diet_tags || [],
      ...priceInfo
    };
  });

  const pricedItems = menu.filter((m) => m.hasPrice && m.minPrice !== null);
  const minPrice = pricedItems.length > 0 ? Math.min(...pricedItems.map((m) => m.minPrice)) : null;
  const maxPrice = pricedItems.length > 0 ? Math.max(...pricedItems.map((m) => m.maxPrice)) : null;

  const rawReviews = ERD_DATABASE.REVIEW.filter(
    (rev) => rev.restaurant_id === restaurantId && rev.status === 'PUBLISHED'
  ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const reviews = rawReviews.map((rev) => {
    const authorUser = ERD_DATABASE.APP_USER.find((u) => u.user_id === rev.author_user_id);
    const createdDate = new Date(rev.created_at);
    const dateStr = `${createdDate.getMonth() + 1}/${createdDate.getFullYear()}`;
    return {
      review_id: rev.review_id,
      restaurant_id: rev.restaurant_id,
      author_user_id: rev.author_user_id,
      author: authorUser ? authorUser.display_name : 'Khách ẩn danh',
      rating: rev.rating,
      body: rev.body,
      comment: rev.body,
      status: rev.status,
      date: dateStr,
      created_at: rev.created_at
    };
  });

  const reviewCount = reviews.length;
  const rating =
    reviewCount > 0
      ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount).toFixed(1))
      : 0;

  const featuredReview = reviews[0]
    ? {
        quote: reviews[0].body,
        rating: reviews[0].rating,
        date: reviews[0].date,
        author: reviews[0].author
      }
    : {
        quote: restaurantRow.description || 'Quán ăn sáng phục vụ nhanh, nguyên liệu tươi mới mỗi ngày.',
        rating: 5,
        date: 'Mới cập nhật',
        author: 'Hệ thống'
      };

  let nearestLocation = primaryLocation;
  let distanceKm = null;
  locations.forEach((loc) => {
    const candidateDistance = computeDistanceKm(anchor?.latitude, anchor?.longitude, loc.latitude, loc.longitude);
    if (candidateDistance !== null && (distanceKm === null || candidateDistance < distanceKm)) {
      distanceKm = candidateDistance;
      nearestLocation = loc;
    }
  });
  const speedKmh = TRANSPORT_SPEED_KMH[transportMode] || TRANSPORT_SPEED_KMH.MOTORBIKE;
  const travelMinutes = distanceKm === null ? null : Math.max(2, Math.round((distanceKm * 1.35 / speedKmh) * 60 + 2));

  return {
    id: restaurantRow.restaurant_id,
    restaurant_id: restaurantRow.restaurant_id,
    slug: restaurantRow.slug,
    name: restaurantRow.name,
    description: restaurantRow.description,
    phone: restaurantRow.phone,
    visibility_status: restaurantRow.visibility_status,
    isVerified: Boolean(restaurantRow.verified_at),
    verifiedAt: restaurantRow.verified_at || null,
    verifiedBy: restaurantRow.verified_by || null,
    source_type: restaurantRow.source_type,
    source_ref: restaurantRow.source_ref,
    cuisines,
    categoryLabel,
    dishKeywords: restaurantRow.dish_keywords || [],
    primaryLocation,
    nearestLocation,
    locations,
    address: nearestLocation?.address_text ?? 'Chưa rõ địa chỉ',
    latitude: nearestLocation?.latitude ?? null,
    longitude: nearestLocation?.longitude ?? null,
    distanceKm,
    travelMinutes,
    transportMode,
    searchAnchor: anchor,
    openUntil: restaurantRow.open_until || '21:00',
    hasPrice: minPrice !== null,
    minPrice,
    maxPrice,
    rating,
    reviewCount,
    mapPos: restaurantRow.map_pos || { x: 50, y: 50 },
    featuredReview,
    menu,
    reviews
  };
}

/**
 * Apply domain side-effects of an APPROVED correction contribution (admin decision).
 */
function applyApprovedCorrection(contrib, targetRest, adminUser, setVisibilityStatus, editedData = {}) {
  const payload = parseContributionPayload(contrib);
  const nowIso = new Date().toISOString();

  if (contrib.contribution_type === 'CLOSED_REPORT') {
    setVisibilityStatus('CLOSED');
    return { ok: true };
  }

  if (contrib.contribution_type === 'RESTAURANT_CORRECTION') {
    const primaryLoc =
      ERD_DATABASE.RESTAURANT_LOCATION.find(
        (l) => l.restaurant_id === targetRest.restaurant_id && l.is_primary
      ) || ERD_DATABASE.RESTAURANT_LOCATION.find((l) => l.restaurant_id === targetRest.restaurant_id);
    const before = {
      name: targetRest.name,
      phone: targetRest.phone,
      verified_at: targetRest.verified_at || null,
      verified_by: targetRest.verified_by || null,
      location: primaryLoc ? { ...primaryLoc } : null
    };

    const nextName = (editedData.name !== undefined ? editedData.name : payload.name || '').trim();
    const nextAddress = (editedData.address !== undefined ? editedData.address : payload.address || '').trim();
    const nextPhone = (editedData.phone !== undefined ? editedData.phone : payload.phone || '').trim();
    const nextOpenUntil = (editedData.openUntil !== undefined ? editedData.openUntil : payload.openUntil || '').trim();

    let location = primaryLoc;
    if (nextAddress && (nextAddress !== primaryLoc?.address_text || editedData.location || payload.location ||
      editedData.latitude !== undefined || editedData.longitude !== undefined)) {
      const locRes = addOrUpdateRestaurantLocation(targetRest.restaurant_id, approvedLocation(nextAddress, payload, editedData), primaryLoc);
      if (!locRes.ok) return locRes;
      location = locRes.data;
    }

    if (nextName) targetRest.name = nextName;
    if (nextPhone) targetRest.phone = nextPhone;
    if (nextOpenUntil) targetRest.open_until = nextOpenUntil;
    targetRest.verified_at = nowIso;
    targetRest.verified_by = adminUser.user_id;
    targetRest.updated_at = nowIso;

    persistDatabase();
    appendAuditEvent({
      actorUserId: adminUser.user_id,
      entityType: 'RESTAURANT',
      entityId: targetRest.restaurant_id,
      action: 'APPLY_RESTAURANT_CORRECTION',
      beforeData: before,
      afterData: {
        name: targetRest.name,
        phone: targetRest.phone,
        verified_at: targetRest.verified_at,
        verified_by: targetRest.verified_by,
        location: location ? { ...location } : null,
        via_contribution_id: contrib.contribution_id
      }
    });
    return { ok: true };
  }

  if (contrib.contribution_type === 'MENU_CORRECTION') {
    const nextDishName = (editedData.dishName !== undefined ? editedData.dishName : payload.dishName || '').trim();
    const nextDishDesc = (editedData.dishDescription !== undefined ? editedData.dishDescription : payload.note || '').trim();
    const rawDishPrice = editedData.dishPrice !== undefined ? editedData.dishPrice : payload.dishPrice;
    const hasEditedPrice = rawDishPrice !== '' && rawDishPrice !== null && rawDishPrice !== undefined;
    const nextDishPrice = hasEditedPrice ? Number(rawDishPrice) : null;

    let menuItem = findMenuItemByName(targetRest.restaurant_id, payload.dishName || nextDishName);

    if (!menuItem && nextDishName) {
      menuItem = {
        menu_item_id: generateUuid(),
        restaurant_id: targetRest.restaurant_id,
        name: nextDishName,
        description: nextDishDesc || 'Món được Admin xác minh từ đóng góp cộng đồng',
        status: 'ACTIVE',
        diet_tags: [],
        created_at: nowIso,
        updated_at: nowIso
      };
      ERD_DATABASE.MENU_ITEM.push(menuItem);
      persistDatabase();
      appendAuditEvent({
        actorUserId: adminUser.user_id,
        entityType: 'MENU_ITEM',
        entityId: menuItem.menu_item_id,
        action: 'CREATE_MENU_ITEM_FROM_CONTRIBUTION',
        beforeData: null,
        afterData: { name: menuItem.name, description: menuItem.description, via_contribution_id: contrib.contribution_id }
      });
    } else if (menuItem) {
      const beforeItem = { name: menuItem.name, description: menuItem.description };
      if (nextDishName) menuItem.name = nextDishName;
      if (nextDishDesc) menuItem.description = nextDishDesc;
      menuItem.updated_at = nowIso;
      persistDatabase();
      appendAuditEvent({
        actorUserId: adminUser.user_id,
        entityType: 'MENU_ITEM',
        entityId: menuItem.menu_item_id,
        action: 'UPDATE_MENU_ITEM_FROM_CONTRIBUTION',
        beforeData: beforeItem,
        afterData: { name: menuItem.name, description: menuItem.description, via_contribution_id: contrib.contribution_id }
      });
    }

    if (menuItem && nextDishPrice !== null) {
      const priceRes = setCurrentMenuItemPrice({
        menuItemId: menuItem.menu_item_id,
        minPrice: nextDishPrice,
        maxPrice: nextDishPrice,
        currency: 'VND',
        sourceType: 'COMMUNITY_CONTRIBUTION',
        sourceReference: contrib.evidence_uri || `contribution:${contrib.contribution_id}`
      });
      if (!priceRes.ok) return priceRes;
      appendAuditEvent({
        actorUserId: adminUser.user_id,
        entityType: 'PRICE_ASSERTION',
        entityId: priceRes.data.price_assertion_id,
        action: 'ADMIN_SET_PRICE_FROM_CONTRIBUTION',
        beforeData: priceRes.previousCurrent
          ? { price_assertion_id: priceRes.previousCurrent.price_assertion_id, is_current: false, min_price: priceRes.previousCurrent.min_price }
          : { min_price: null },
        afterData: { is_current: true, min_price: priceRes.data.min_price, currency: priceRes.data.currency, via_contribution_id: contrib.contribution_id }
      });
    }

    if (menuItem) {
      refreshRestaurantVerification(targetRest.restaurant_id, adminUser, { via_contribution_id: contrib.contribution_id });
    }
  }
  return { ok: true };
}

export const SOAApiClient = {
  /**
   * 1. Context & Weather Service
   */
  async getWeatherForCoordinates({ latitude, longitude }) {
    try {
      const params = new URLSearchParams({ q: `${latitude},${longitude}` });
      const response = await fetch(`/api/v1/context/morning-greeting?${params}`, { signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      if (!payload.success || !payload.data) throw new Error('Invalid weather response');

      emitServiceTrace(
        'context-weather-service',
        'GET /api/v1/context/morning-greeting?q=device-coordinates',
        `Thời tiết tại điểm tìm: ${payload.data.temp}°C (${payload.data.condition})`
      );
      return { ...payload.data, weatherSource: payload.source };
    } catch {
      emitServiceTrace(
        'context-weather-service',
        'GET /api/v1/context/morning-greeting?q=device-coordinates',
        'Không kết nối được service thời tiết; dùng dữ liệu mẫu'
      );
      return { ...this.getWeatherGreeting(0), weatherSource: 'service-unavailable-fallback' };
    }
  },

  getWeatherGreeting(contextIndex = 0) {
    const ctx = WEATHER_CONTEXTS[contextIndex % WEATHER_CONTEXTS.length];
    emitServiceTrace(
      'context-weather-service',
      'GET /api/v1/context/morning-greeting',
      `Temp: ${ctx.temp}°C (${ctx.condition}) -> Gợi ý: "${ctx.suggestedQuery}"`
    );
    return ctx;
  },

  setAuthSession(portal, session) {
    const expectedRole = portal === 'admin' ? 'ADMIN' : 'USER';
    const user = session?.user;
    authSessions[portal] = user?.role === expectedRole && user.account_status === 'ACTIVE' &&
      Date.parse(session.expires_at) > Date.now() ? session : null;
    if (!authSessions[portal]) return;

    syncDatabaseFromStorage();
    const existing = ERD_DATABASE.APP_USER.find((row) => row.user_id === user.user_id);
    if (!existing || existing.display_name !== user.display_name || existing.account_status !== user.account_status) {
      if (existing) Object.assign(existing, toPublicUser(user));
      else ERD_DATABASE.APP_USER.push(toPublicUser(user));
      persistDatabase();
    }
  },

  getSession() {
    return { currentUser: toPublicUser(loadSessionUser()) };
  },

  getAdminSession() {
    const admin = loadAdminSessionUser();
    return { currentAdmin: toPublicUser(admin), isAuthenticated: Boolean(admin) };
  },

  getAllRestaurantsForAdmin() {
    syncDatabaseFromStorage();
    return ERD_DATABASE.RESTAURANT.map((row) => hydrateRestaurant(row, null, 'MOTORBIKE'));
  },

  adminSetRestaurantVerified(restaurantId, isVerified) {
    syncDatabaseFromStorage();
    const auth = requireAdmin('cập nhật trạng thái xác minh quán');
    if (!auth.ok) return fail(auth.error);
    const rest = ERD_DATABASE.RESTAURANT.find((r) => r.restaurant_id === restaurantId);
    if (!rest) return fail('Không tìm thấy quán ăn.');
    const nowIso = new Date().toISOString();
    const before = {
      verified_at: rest.verified_at || null,
      verified_by: rest.verified_by || null
    };
    const nextVerified = Boolean(isVerified);
    rest.verified_at = nextVerified ? nowIso : null;
    rest.verified_by = nextVerified ? auth.user.user_id : null;
    rest.updated_at = nowIso;
    persistDatabase();
    appendAuditEvent({
      actorUserId: auth.user.user_id,
      entityType: 'RESTAURANT',
      entityId: rest.restaurant_id,
      action: nextVerified ? 'ADMIN_VERIFY_RESTAURANT' : 'ADMIN_UNVERIFY_RESTAURANT',
      beforeData: before,
      afterData: {
        verified_at: rest.verified_at,
        verified_by: rest.verified_by
      }
    });
    return { ok: true, data: rest };
  },

  adminClearMenuItemPrice(menuItemId, reviewNote = 'Admin gỡ giá sai về NO_PRICE') {
    syncDatabaseFromStorage();
    const auth = requireAdmin('gỡ giá món ăn');
    if (!auth.ok) return fail(auth.error);
    const menuItem = ERD_DATABASE.MENU_ITEM.find((m) => m.menu_item_id === menuItemId);
    if (!menuItem) return fail('Không tìm thấy món ăn.');
    const res = clearCurrentMenuItemPrice(menuItemId);
    if (!res.previousCurrent) {
      return fail('Món này hiện đang ở trạng thái No price.');
    }
    appendAuditEvent({
      actorUserId: auth.user.user_id,
      entityType: 'PRICE_ASSERTION',
      entityId: res.previousCurrent.price_assertion_id,
      action: 'ADMIN_CLEAR_PRICE_TO_NO_PRICE',
      beforeData: { is_current: true, min_price: res.previousCurrent.min_price },
      afterData: { is_current: false, result: 'NO_PRICE', review_note: reviewNote }
    });
    return { ok: true, data: res.previousCurrent };
  },

  resetDemoDatabase() {
    try {
      const initial = JSON.parse(INITIAL_DB_SNAPSHOT);
      for (const table of PERSISTED_TABLES) {
        if (Array.isArray(initial[table])) {
          ERD_DATABASE[table].splice(0, ERD_DATABASE[table].length, ...initial[table]);
        }
      }
      localStorage.removeItem(DB_STORAGE_KEY);
    } catch {
      // ignore
    }
    return { ok: true };
  },

  /**
   * 2. Personalization & Preference Service
   * - Guest: localStorage only (no server rows)
   * - Authenticated APP_USER: normalized USER_PREFERENCE (PK=user_id), USER_RESTRICTION,
   *   USER_FAVORITE_DISH, FAVORITE_RESTAURANT
   */
  getDietaryCatalog() {
    return ERD_DATABASE.DIETARY_RESTRICTION;
  },

  getDishCategoryCatalog() {
    return ERD_DATABASE.DISH_CATEGORY;
  },

  getUserPreferences() {
    syncDatabaseFromStorage();
    const user = loadSessionUser();

    if (user) {
      const pref = ensureUserPreferenceSynced(user.user_id);
      const restriction_ids = ERD_DATABASE.USER_RESTRICTION
        .filter((r) => r.user_id === user.user_id)
        .map((r) => r.restriction_id);
      const favorite_dish_category_ids = ERD_DATABASE.USER_FAVORITE_DISH
        .filter((d) => d.user_id === user.user_id)
        .map((d) => d.dish_category_id)
        .slice(0, 3);
      const favIds = ERD_DATABASE.FAVORITE_RESTAURANT
        .filter((f) => f.user_id === user.user_id)
        .map((f) => f.restaurant_id);
      const saved_restaurants = favIds
        .map((id) => ERD_DATABASE.RESTAURANT.find((r) => r.restaurant_id === id && r.visibility_status === 'PUBLISHED'))
        .filter(Boolean)
        .map((r) => ({ restaurant_id: r.restaurant_id, name: r.name }));

      return {
        isGuest: false,
        storageSource: `USER_PREFERENCE (${user.display_name})`,
        diet_mode: pref.diet_mode ?? null,
        transport_mode: pref.transport_mode || 'FLEXIBLE',
        restriction_ids,
        favorite_dish_category_ids,
        favorite_restaurant_ids: favIds,
        saved_restaurants,
        settings: pref.settings || {
          default_budget: 50000,
          learned_stats: { ...DEFAULT_LEARNED_STATS }
        }
      };
    }

    const guest = loadGuestState();
    const favIds = guest.favorite_restaurant_ids || [];
    const saved_restaurants = favIds
      .map((id) => ERD_DATABASE.RESTAURANT.find((r) => r.restaurant_id === id && r.visibility_status === 'PUBLISHED'))
      .filter(Boolean)
      .map((r) => ({ restaurant_id: r.restaurant_id, name: r.name }));

    return {
      isGuest: true,
      storageSource: 'localStorage (Guest)',
      diet_mode: guest.diet_mode ?? null,
      transport_mode: guest.transport_mode || 'FLEXIBLE',
      restriction_ids: guest.restriction_ids || [],
      favorite_dish_category_ids: (guest.favorite_dish_category_ids || []).slice(0, 3),
      favorite_restaurant_ids: favIds,
      saved_restaurants,
      settings: guest.settings || {
        default_budget: 50000,
        learned_stats: { ...DEFAULT_LEARNED_STATS }
      }
    };
  },

  updateUserPreferences({ diet_mode, transport_mode, restriction_ids, favorite_dish_category_ids, settings }) {
    syncDatabaseFromStorage();
    const user = loadSessionUser();

    if (user) {
      const pref = ensureUserPreferenceSynced(user.user_id);
      if (diet_mode !== undefined) pref.diet_mode = diet_mode;
      if (transport_mode !== undefined) pref.transport_mode = transport_mode;
      if (settings !== undefined) pref.settings = { ...(pref.settings || {}), ...settings };
      pref.updated_at = new Date().toISOString();

      if (Array.isArray(restriction_ids)) {
        for (let i = ERD_DATABASE.USER_RESTRICTION.length - 1; i >= 0; i--) {
          if (ERD_DATABASE.USER_RESTRICTION[i].user_id === user.user_id) {
            ERD_DATABASE.USER_RESTRICTION.splice(i, 1);
          }
        }
        [...new Set(restriction_ids)].forEach((restriction_id) => {
          ERD_DATABASE.USER_RESTRICTION.push({ user_id: user.user_id, restriction_id });
        });
      }

      if (Array.isArray(favorite_dish_category_ids)) {
        for (let i = ERD_DATABASE.USER_FAVORITE_DISH.length - 1; i >= 0; i--) {
          if (ERD_DATABASE.USER_FAVORITE_DISH[i].user_id === user.user_id) {
            ERD_DATABASE.USER_FAVORITE_DISH.splice(i, 1);
          }
        }
        [...new Set(favorite_dish_category_ids)].slice(0, 3).forEach((dish_category_id) => {
          ERD_DATABASE.USER_FAVORITE_DISH.push({ user_id: user.user_id, dish_category_id });
        });
      }

      persistDatabase();
      emitServiceTrace(
        'user-preference-service',
        'PUT /api/v1/user/preferences',
        `Đồng bộ USER_PREFERENCE cho ${user.display_name} (diet=${pref.diet_mode || 'NONE'}, transport=${pref.transport_mode})`
      );
      return this.getUserPreferences();
    }

    const guest = loadGuestState();
    const cappedDishes = Array.isArray(favorite_dish_category_ids)
      ? favorite_dish_category_ids.slice(0, 3)
      : guest.favorite_dish_category_ids;

    const updated = {
      ...guest,
      diet_mode: diet_mode !== undefined ? diet_mode : guest.diet_mode,
      transport_mode: transport_mode ?? guest.transport_mode,
      restriction_ids: restriction_ids ?? guest.restriction_ids,
      favorite_dish_category_ids: cappedDishes,
      settings: { ...(guest.settings || {}), ...(settings || {}) }
    };
    saveGuestState(updated);
    emitServiceTrace(
      'user-preference-service',
      'LOCALSTORAGE /guest/preferences',
      `Lưu cá nhân hóa trên máy này (diet=${updated.diet_mode || 'NONE'}, transport=${updated.transport_mode}, kiêng=${updated.restriction_ids.length}, thích=${updated.favorite_dish_category_ids.length})`
    );
    return this.getUserPreferences();
  },

  clearAllPersonalization() {
    syncDatabaseFromStorage();
    const user = loadSessionUser();
    if (user) {
      for (let i = ERD_DATABASE.FAVORITE_RESTAURANT.length - 1; i >= 0; i--) {
        if (ERD_DATABASE.FAVORITE_RESTAURANT[i].user_id === user.user_id) {
          ERD_DATABASE.FAVORITE_RESTAURANT.splice(i, 1);
        }
      }
      persistDatabase();
      return this.updateUserPreferences({
        diet_mode: null,
        transport_mode: 'FLEXIBLE',
        restriction_ids: [],
        favorite_dish_category_ids: []
      });
    }

    const guest = loadGuestState();
    saveGuestState({
      ...guest,
      diet_mode: null,
      transport_mode: 'FLEXIBLE',
      restriction_ids: [],
      favorite_dish_category_ids: [],
      favorite_restaurant_ids: []
    });
    emitServiceTrace(
      'user-preference-service',
      'LOCALSTORAGE /guest/preferences/clear',
      'Đã xoá thông tin cá nhân hóa trên máy này'
    );
    return this.getUserPreferences();
  },

  clearLearnedHistory() {
    const prefs = this.getUserPreferences();
    const nextSettings = {
      ...(prefs.settings || {}),
      learned_stats: {
        searchCount: 0,
        chosenCount: 0,
        topCategory: 'chưa có dữ liệu'
      }
    };
    emitServiceTrace(
      'user-preference-service',
      'DELETE /api/v1/user/learned-history',
      'Đã xoá lịch sử học từ lựa chọn của người dùng'
    );
    return this.updateUserPreferences({ settings: nextSettings });
  },

  toggleFavoriteRestaurant(restaurantId) {
    syncDatabaseFromStorage();
    const user = loadSessionUser();
    if (user) {
      const idx = ERD_DATABASE.FAVORITE_RESTAURANT.findIndex(
        (f) => f.user_id === user.user_id && f.restaurant_id === restaurantId
      );
      const added = idx === -1;
      if (added) {
        ERD_DATABASE.FAVORITE_RESTAURANT.push({
          user_id: user.user_id,
          restaurant_id: restaurantId,
          created_at: new Date().toISOString()
        });
      } else {
        ERD_DATABASE.FAVORITE_RESTAURANT.splice(idx, 1);
      }
      persistDatabase();
      emitServiceTrace(
        'user-preference-service',
        added ? 'POST /api/v1/user/favorites' : 'DELETE /api/v1/user/favorites',
        `${added ? 'Lưu' : 'Bỏ lưu'} FAVORITE_RESTAURANT cho ${user.display_name}`
      );
      return this.getUserPreferences().favorite_restaurant_ids;
    }

    const guest = loadGuestState();
    const set = new Set(guest.favorite_restaurant_ids || []);
    const added = !set.has(restaurantId);
    if (added) set.add(restaurantId);
    else set.delete(restaurantId);
    guest.favorite_restaurant_ids = Array.from(set);
    saveGuestState(guest);
    emitServiceTrace(
      'user-preference-service',
      'LOCALSTORAGE /guest/favorites',
      `${added ? 'Lưu' : 'Bỏ lưu'} quán yêu thích (localStorage): ${restaurantId.slice(-6)}`
    );
    return this.getUserPreferences().favorite_restaurant_ids;
  },

  /**
   * 3. Geo-Spatial & Menu Search Service (Enforces RESTAURANT.visibility_status === 'PUBLISHED')
   */
  searchRestaurants({
    dish,
    budget = DEFAULT_BUDGET,
    radiusKm = DEFAULT_RADIUS_KM,
    sortBy = 'recommended',
    partySize = 1,
    anchor
  }) {
    syncDatabaseFromStorage();
    const emptyResult = { totalMatchedCount: 0, heroRestaurant: null, nearbyOthers: [], searchAnchor: anchor };
    const name = readDishName(dish);
    if (!name || !hasCoordinates(anchor?.latitude, anchor?.longitude) ||
      !Number.isSafeInteger(budget) || budget < 1 ||
      !Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) return emptyResult;

    const normalizedDish = ` ${normalizeDishText(name)} `;
    const prefs = this.getUserPreferences();
    const transportMode = prefs.transport_mode || 'MOTORBIKE';

    const publishedRows = ERD_DATABASE.RESTAURANT.filter((r) => r.visibility_status === 'PUBLISHED');
    const excludedCount = ERD_DATABASE.RESTAURANT.length - publishedRows.length;

    emitServiceTrace(
      'restaurant-search-service',
      'POST /api/v1/restaurants/search',
      `Món: "${name}", Ngân sách tối đa: ${formatK(budget)}, Bán kính: ${radiusKm}km (Lọc ${publishedRows.length} quán PUBLISHED, ẩn ${excludedCount} quán khác)`
    );

    const enriched = [];
    for (const row of publishedRows) {
      const restaurant = hydrateRestaurant(row, anchor, transportMode);
      if (restaurant.distanceKm === null || restaurant.distanceKm > radiusKm) continue;

      const matchedMenu = restaurant.menu.filter((item) =>
        item.hasPrice && Number.isFinite(item.minPrice) && item.minPrice >= 0 && item.minPrice <= budget &&
        ` ${normalizeDishText(item.name)} `.includes(normalizedDish)
      ).sort((a, b) => a.minPrice - b.minPrice || a.maxPrice - b.maxPrice);
      const startingItem = matchedMenu[0];
      if (!startingItem) continue;
      enriched.push({
        ...restaurant,
        matchedMenu,
        effectiveMinPrice: startingItem.minPrice,
        effectiveMaxPrice: startingItem.maxPrice,
        leftoverAmount: budget - startingItem.minPrice,
        partyTotalEstimate: startingItem.minPrice * (partySize || 1)
      });
    }

    if (sortBy === 'distance') {
      enriched.sort((a, b) => a.distanceKm - b.distanceKm);
    } else if (sortBy === 'rating') {
      enriched.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    } else if (sortBy === 'price') {
      enriched.sort((a, b) => a.effectiveMinPrice - b.effectiveMinPrice || a.distanceKm - b.distanceKm);
    } else {
      enriched.sort((a, b) => {
        const verifiedDiff = (b.isVerified ? 1 : 0) - (a.isVerified ? 1 : 0);
        if (verifiedDiff !== 0) return verifiedDiff;
        return b.rating - a.rating || a.distanceKm - b.distanceKm;
      });
    }

    const hero = enriched[0];
    if (hero) {
      emitServiceTrace(
        'routing-geo-service',
        'GET /api/v1/routing/estimate',
        `Tới "${hero.name}": ${hero.distanceKm.toFixed(2)} km đường chim bay (~${hero.travelMinutes} phút bằng ${hero.transportMode})`
      );
      emitServiceTrace(
        'feedback-review-service',
        'GET /api/v1/reviews',
        `${hero.reviewCount} REVIEW (${hero.rating}★) · Trạng thái quán: ${hero.isVerified ? 'Đã xác minh' : 'Chưa xác minh'}`
      );
    }

    return {
      totalMatchedCount: enriched.length,
      heroRestaurant: enriched[0] || null,
      nearbyOthers: enriched.slice(1),
      searchAnchor: anchor
    };
  },

  getDiscoverySuggestions({ dish, anchor, radiusKm }) {
    syncDatabaseFromStorage();
    return readDiscoverySuggestions(normalizeDishText(dish), anchor, radiusKm);
  },

  saveDiscoverySuggestions({ dish, anchor, radiusKm }, places) {
    syncDatabaseFromStorage();
    const keyword = normalizeDishText(dish);
    if (!anchor || !keyword) return [];

    let changed = false;
    for (const place of places) {
      if (!isGoongLocation(place) || place.provider_place_id.length > 512 || place.address_text.length > 500) continue;
      const name = typeof place.name === 'string' ? place.name.trim() : '';
      if (!name || name.length > 200 || !looksLikeFoodPlace(place, normalizeDishText(name), keyword)) continue;
      let location = findGoongLocation(place.provider_place_id);
      const point = location ?? place;
      const distanceKm = computeDistanceKm(anchor.latitude, anchor.longitude, point.latitude, point.longitude);
      if (distanceKm === null || distanceKm > radiusKm) continue;

      const now = new Date().toISOString();
      if (location) {
        const restaurant = ERD_DATABASE.RESTAURANT.find((row) => row.restaurant_id === location.restaurant_id);
        if (!canSuggestRestaurant(restaurant)) continue;
      } else {
        const id = generateUuid();
        const created = addOrUpdateRestaurantLocation(id, place);
        if (!created.ok) continue;
        location = created.data;
        ERD_DATABASE.RESTAURANT.push({
          restaurant_id: id,
          name,
          visibility_status: 'PENDING',
          verified_at: null,
          verified_by: null,
          source_type: 'GOONG_DISCOVERY',
          created_at: now,
          updated_at: now
        });
      }

      if (!ERD_DATABASE.RESTAURANT_DISCOVERY.some((row) =>
        row.location_id === location.location_id && row.dish_keyword === keyword
      )) {
        ERD_DATABASE.RESTAURANT_DISCOVERY.push({ location_id: location.location_id, dish_keyword: keyword, discovered_at: now });
        changed = true;
      }
    }
    if (changed) persistDatabase();
    return readDiscoverySuggestions(keyword, anchor, radiusKm);
  },

  /**
   * 4A. Submit Restaurant REVIEW
   * Enforces: rating integer 1..5, unique (restaurant_id, author_user_id), restaurant PUBLISHED
   */
  submitReview(restaurantId, { rating, body }) {
    syncDatabaseFromStorage();
    const auth = requireActiveUser('gửi đánh giá');
    if (!auth.ok) return fail(auth.error);

    const restaurant = ERD_DATABASE.RESTAURANT.find(
      (r) => r.restaurant_id === restaurantId || r.slug === restaurantId
    );
    if (!restaurant || restaurant.visibility_status !== 'PUBLISHED') {
      return fail('Chỉ có thể đánh giá quán đang ở trạng thái PUBLISHED.');
    }

    const duplicate = ERD_DATABASE.REVIEW.find(
      (r) => r.restaurant_id === restaurant.restaurant_id && r.author_user_id === auth.user.user_id
    );
    if (duplicate) {
      return fail('Bạn đã đánh giá quán này rồi (mỗi tài khoản chỉ được viết 1 đánh giá cho mỗi quán).');
    }

    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return fail('Số sao đánh giá phải là số nguyên từ 1 đến 5.');
    }

    const cleanBody = (body || '').trim();
    if (!cleanBody) return fail('Nội dung đánh giá không được để trống.');

    const nowIso = new Date().toISOString();
    const newReview = {
      review_id: generateUuid(),
      restaurant_id: restaurant.restaurant_id,
      author_user_id: auth.user.user_id,
      rating: numericRating,
      body: cleanBody,
      status: 'PUBLISHED',
      created_at: nowIso,
      updated_at: nowIso
    };

    ERD_DATABASE.REVIEW.unshift(newReview);
    persistDatabase();

    emitServiceTrace(
      'feedback-review-service',
      'POST /api/v1/reviews',
      `Tạo REVIEW (${newReview.rating}★) cho quán "${restaurant.name}" bởi ${auth.user.display_name}`
    );

    return { ok: true, data: newReview };
  },

  /**
   * 4B. Submit Price Report (PRICE_REPORT: WRONG_PRICE | MISSING_PRICE)
   * Integrity: if price_assertion_id != null, it MUST belong to menu_item_id.
   * Does NOT change displayed price until Admin verifies.
   */
  submitPriceReport(
    restaurantId,
    { menuItemId, observedPrice, comment, evidenceUri }
  ) {
    syncDatabaseFromStorage();
    const auth = requireActiveUser('gửi báo cáo sai/thiếu giá');
    if (!auth.ok) return fail(auth.error);

    const menuItem = ERD_DATABASE.MENU_ITEM.find((m) => m.menu_item_id === menuItemId);
    if (!menuItem) return fail('Không tìm thấy món (MENU_ITEM).');
    if (restaurantId && menuItem.restaurant_id !== restaurantId) {
      return fail('Món không thuộc quán đang chọn.');
    }

    const priceResolution = resolveMenuItemPrice(menuItemId);
    const currentAssertion = priceResolution.currentAssertion;

    if (currentAssertion && currentAssertion.menu_item_id !== menuItemId) {
      return fail('Lỗi toàn vẹn: price_assertion_id không thuộc đúng menu_item_id.');
    }

    const reportType = currentAssertion ? 'WRONG_PRICE' : 'MISSING_PRICE';
    const hasObserved = observedPrice !== undefined && observedPrice !== '' && observedPrice !== null;
    const numericObserved = hasObserved ? Number(observedPrice) : null;
    if (numericObserved !== null && (!Number.isFinite(numericObserved) || numericObserved < 0)) {
      return fail('Giá đề xuất (observed_price) phải lớn hơn hoặc bằng 0.');
    }

    const nowIso = new Date().toISOString();
    const newReport = {
      price_report_id: generateUuid(),
      price_assertion_id: currentAssertion ? currentAssertion.price_assertion_id : null,
      menu_item_id: menuItemId,
      submitted_by: auth.user.user_id,
      report_type: reportType,
      observed_price: numericObserved,
      comment:
        (comment || '').trim() ||
        (reportType === 'WRONG_PRICE'
          ? `Báo sai giá món "${menuItem.name}" (đang hiển thị: ${formatK(currentAssertion.min_price)})`
          : `Bổ sung giá cho món "${menuItem.name}" (đang No price)`),
      evidence_uri: (evidenceUri || '').trim() || null,
      moderation_status: 'PENDING',
      reviewed_by: null,
      review_note: null,
      submitted_at: nowIso,
      reviewed_at: null
    };

    ERD_DATABASE.PRICE_REPORT.unshift(newReport);
    persistDatabase();

    emitServiceTrace(
      'feedback-review-service',
      'POST /api/v1/price-reports',
      `[${reportType}] món "${menuItem.name}" (assertion=${newReport.price_assertion_id ? newReport.price_assertion_id.slice(-6) : 'NULL'})${newReport.evidence_uri ? ' · Có minh chứng' : ''} -> Chờ Admin xác minh`
    );

    return { ok: true, data: newReport };
  },

  /**
   * 4B-2. List all price reports across all restaurants (for Admin moderation queue)
   * Original reported wrong price is resolved directly from the immutable PRICE_ASSERTION via price_assertion_id.
   */
  getAllPriceReports() {
    syncDatabaseFromStorage();
    return ERD_DATABASE.PRICE_REPORT
      .slice()
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
      .map((pr) => {
        const menuItem = ERD_DATABASE.MENU_ITEM.find((m) => m.menu_item_id === pr.menu_item_id);
        const restaurant = menuItem
          ? ERD_DATABASE.RESTAURANT.find((r) => r.restaurant_id === menuItem.restaurant_id)
          : null;
        const submitter = ERD_DATABASE.APP_USER.find((u) => u.user_id === pr.submitted_by);
        const reviewer = pr.reviewed_by
          ? ERD_DATABASE.APP_USER.find((u) => u.user_id === pr.reviewed_by)
          : null;
        const reportedAssertion = pr.price_assertion_id
          ? ERD_DATABASE.PRICE_ASSERTION.find((a) => a.price_assertion_id === pr.price_assertion_id)
          : null;
        const currentPriceInfo = menuItem ? resolveMenuItemPrice(menuItem.menu_item_id) : null;

        return {
          ...pr,
          restaurant_id: restaurant ? restaurant.restaurant_id : null,
          restaurant_name: restaurant ? restaurant.name : 'Quán ăn',
          menu_item_name: menuItem ? menuItem.name : 'Món ăn',
          reported_wrong_price: reportedAssertion ? Number(reportedAssertion.min_price) : null,
          current_price: currentPriceInfo ? currentPriceInfo.minPrice : null,
          submitted_by_name: submitter ? submitter.display_name : 'Người dùng',
          reviewed_by_name: reviewer ? reviewer.display_name : null
        };
      });
  },

  /**
   * 4C. Admin Verification of a Price Report:
   * - Updates current PRICE_ASSERTION (old is_current=false, new is_current=true) OR clears to NO_PRICE
   * - Records reviewed_by, review_note, reviewed_at on PRICE_REPORT
   * - Appends AUDIT_EVENT
   */
  adminVerifyPriceReport(
    priceReportId,
    verifiedPriceInput = null,
    { reviewNote = '', clearToNoPrice = false } = {}
  ) {
    syncDatabaseFromStorage();
    const auth = requireAdmin('xác minh báo cáo giá');
    if (!auth.ok) return fail(auth.error);
    const adminUser = auth.user;

    const report = ERD_DATABASE.PRICE_REPORT.find((r) => r.price_report_id === priceReportId);
    if (!report) return fail('Không tìm thấy báo cáo giá.');
    if (report.moderation_status !== 'PENDING') {
      return fail(`Báo cáo đã được xử lý (${report.moderation_status}).`);
    }

    if (report.price_assertion_id) {
      const refAssertion = ERD_DATABASE.PRICE_ASSERTION.find(
        (a) => a.price_assertion_id === report.price_assertion_id
      );
      if (!refAssertion || refAssertion.menu_item_id !== report.menu_item_id) {
        return fail('Lỗi toàn vẹn: price_assertion_id không thuộc đúng menu_item_id của báo cáo.');
      }
    }

    const nowIso = new Date().toISOString();
    const reportedMenuItem = ERD_DATABASE.MENU_ITEM.find((m) => m.menu_item_id === report.menu_item_id);

    if (clearToNoPrice) {
      const cleared = clearCurrentMenuItemPrice(report.menu_item_id);
      report.moderation_status = 'APPROVED';
      report.reviewed_by = adminUser.user_id;
      report.review_note = (reviewNote || '').trim() || 'Admin đã gỡ giá sai về No price';
      report.reviewed_at = nowIso;
      persistDatabase();

      appendAuditEvent({
        actorUserId: adminUser.user_id,
        entityType: 'PRICE_REPORT',
        entityId: report.price_report_id,
        action: 'MODERATE_PRICE_REPORT_APPROVED_CLEAR',
        beforeData: { moderation_status: 'PENDING' },
        afterData: {
          moderation_status: 'APPROVED',
          reviewed_by: adminUser.user_id,
          review_note: report.review_note,
          reviewed_at: nowIso
        }
      });
      if (cleared.previousCurrent) {
        appendAuditEvent({
          actorUserId: adminUser.user_id,
          entityType: 'PRICE_ASSERTION',
          entityId: cleared.previousCurrent.price_assertion_id,
          action: 'ADMIN_CLEAR_PRICE_TO_NO_PRICE',
          beforeData: { is_current: true, min_price: cleared.previousCurrent.min_price },
          afterData: { is_current: false, result: 'NO_PRICE' }
        });
      }
      if (reportedMenuItem) {
        refreshRestaurantVerification(reportedMenuItem.restaurant_id, adminUser, { via_price_report_id: report.price_report_id });
      }
      return { ok: true, data: null, cleared: true };
    }

    const rawPrice =
      verifiedPriceInput !== null && verifiedPriceInput !== ''
        ? Number(verifiedPriceInput)
        : report.observed_price !== null && report.observed_price !== undefined
          ? Number(report.observed_price)
          : NaN;

    if (!Number.isFinite(rawPrice) || rawPrice < 0) {
      return fail('Vui lòng nhập giá tiền hợp lệ (>= 0) sau khi xác minh.');
    }

    const priceRes = setCurrentMenuItemPrice({
      menuItemId: report.menu_item_id,
      minPrice: rawPrice,
      maxPrice: rawPrice,
      currency: 'VND',
      sourceType: report.evidence_uri ? 'COMMUNITY_EVIDENCE' : 'ADMIN_VERIFICATION',
      sourceReference: report.evidence_uri || `price_report:${report.price_report_id}`
    });
    if (!priceRes.ok) return fail(priceRes.error);

    report.moderation_status = 'APPROVED';
    report.reviewed_by = adminUser.user_id;
    report.review_note = (reviewNote || '').trim() || `Đã xác minh & cập nhật giá hiển thị: ${formatK(rawPrice)}`;
    report.reviewed_at = nowIso;
    persistDatabase();

    appendAuditEvent({
      actorUserId: adminUser.user_id,
      entityType: 'PRICE_REPORT',
      entityId: report.price_report_id,
      action: 'MODERATE_PRICE_REPORT_APPROVED',
      beforeData: { moderation_status: 'PENDING' },
      afterData: {
        moderation_status: 'APPROVED',
        reviewed_by: adminUser.user_id,
        review_note: report.review_note,
        reviewed_at: nowIso
      }
    });
    appendAuditEvent({
      actorUserId: adminUser.user_id,
      entityType: 'PRICE_ASSERTION',
      entityId: priceRes.data.price_assertion_id,
      action: 'ADMIN_UPDATE_PRICE',
      beforeData: priceRes.previousCurrent
        ? { price_assertion_id: priceRes.previousCurrent.price_assertion_id, is_current: false, min_price: priceRes.previousCurrent.min_price }
        : { min_price: null },
      afterData: {
        is_current: true,
        min_price: priceRes.data.min_price,
        max_price: priceRes.data.max_price,
        currency: priceRes.data.currency,
        via_price_report_id: report.price_report_id
      }
    });
    if (reportedMenuItem) {
      refreshRestaurantVerification(reportedMenuItem.restaurant_id, adminUser, { via_price_report_id: report.price_report_id });
    }

    return { ok: true, data: priceRes.data };
  },

  /**
   * 4D. Admin rejects a Price Report (sets reviewed_by, review_note, reviewed_at, logs AUDIT_EVENT)
   */
  adminRejectPriceReport(priceReportId, reviewNote = 'Bằng chứng chưa đủ tin cậy') {
    syncDatabaseFromStorage();
    const auth = requireAdmin('từ chối báo cáo giá');
    if (!auth.ok) return fail(auth.error);

    const report = ERD_DATABASE.PRICE_REPORT.find((r) => r.price_report_id === priceReportId);
    if (!report) return fail('Không tìm thấy báo cáo giá.');
    if (report.moderation_status !== 'PENDING') {
      return fail(`Báo cáo đã được xử lý (${report.moderation_status}).`);
    }

    const nowIso = new Date().toISOString();
    report.moderation_status = 'REJECTED';
    report.reviewed_by = auth.user.user_id;
    report.review_note = (reviewNote || '').trim() || 'Bằng chứng chưa đủ tin cậy';
    report.reviewed_at = nowIso;
    persistDatabase();

    appendAuditEvent({
      actorUserId: auth.user.user_id,
      entityType: 'PRICE_REPORT',
      entityId: report.price_report_id,
      action: 'MODERATE_PRICE_REPORT_REJECTED',
      beforeData: { moderation_status: 'PENDING' },
      afterData: {
        moderation_status: 'REJECTED',
        reviewed_by: auth.user.user_id,
        review_note: report.review_note,
        reviewed_at: nowIso
      }
    });

    return { ok: true, data: report };
  },

  /**
   * 5. Community Contribution & Moderation Service (ERD table: CONTRIBUTION)
   * Strictly 4 types: NEW_RESTAURANT, RESTAURANT_CORRECTION, MENU_CORRECTION, CLOSED_REPORT.
   * All proposed fields live in payload (jsonb, validated per type, versioned by schema_version);
   * evidence_uri is top-level; restaurant_id = NULL for NEW_RESTAURANT until Admin approves.
   * Price proposals for an existing dish go through PRICE_REPORT, not through a contribution type.
   */
  getContributions() {
    syncDatabaseFromStorage();
    return ERD_DATABASE.CONTRIBUTION.map((c) => {
      const submitter = ERD_DATABASE.APP_USER.find((u) => u.user_id === c.submitted_by);
      const reviewer = c.reviewed_by
        ? ERD_DATABASE.APP_USER.find((u) => u.user_id === c.reviewed_by)
        : null;
      const targetRest = c.restaurant_id
        ? ERD_DATABASE.RESTAURANT.find((r) => r.restaurant_id === c.restaurant_id)
        : null;
      const payload = parseContributionPayload(c);
      return {
        ...c,
        payload,
        submitted_by_name: submitter ? submitter.display_name : 'Tài khoản không xác định',
        reviewed_by_name: reviewer ? reviewer.display_name : null,
        restaurant_name: targetRest ? targetRest.name : payload.name || null
      };
    });
  },

  submitContribution({
    contributionType,
    restaurantId = null,
    payloadObj = {},
    evidenceUri = null
  }) {
    syncDatabaseFromStorage();
    const auth = requireActiveUser('gửi đóng góp');
    if (!auth.ok) return fail(auth.error);

    if (!CONTRIBUTION_TYPES.includes(contributionType)) {
      return fail(`contribution_type không hợp lệ: ${contributionType}`);
    }

    const cleanPayload = Object.fromEntries(
      Object.entries(payloadObj || {})
        .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
    );

    let targetRestaurant = null;
    if (contributionType === 'NEW_RESTAURANT') {
      if (!cleanPayload.name || !cleanPayload.address) {
        return fail('Đề xuất quán mới cần có tên quán và địa chỉ.');
      }
    }
    const payloadError = validateContributionPayload(contributionType, cleanPayload);
    if (payloadError) return fail(payloadError);
    if (contributionType !== 'NEW_RESTAURANT') {
      targetRestaurant = ERD_DATABASE.RESTAURANT.find(
        (r) => r.restaurant_id === restaurantId && r.visibility_status === 'PUBLISHED'
      );
      if (!targetRestaurant) {
        return fail('Loại đóng góp này cần chọn một quán đang PUBLISHED.');
      }
    }

    const newContribution = {
      contribution_id: generateUuid(),
      submitted_by: auth.user.user_id,
      // NULL for NEW_RESTAURANT until Admin approves and creates RESTAURANT row
      restaurant_id: targetRestaurant ? targetRestaurant.restaurant_id : null,
      contribution_type: contributionType,
      payload: { schema_version: CONTRIBUTION_PAYLOAD_SCHEMA_VERSION, ...cleanPayload },
      evidence_uri: (evidenceUri || '').trim() || null,
      status: 'PENDING',
      reviewed_by: null,
      review_note: null,
      submitted_at: new Date().toISOString(),
      reviewed_at: null
    };

    ERD_DATABASE.CONTRIBUTION.unshift(newContribution);
    persistDatabase();

    emitServiceTrace(
      'contribution-service',
      'POST /api/v1/contributions',
      `Đã gửi CONTRIBUTION [${contributionType}] bởi ${auth.user.display_name} (status=PENDING)`
    );

    return { ok: true, data: newContribution };
  },

  reviewContribution(
    contributionId,
    { decision = 'APPROVED', reviewNote = 'Đã xác minh thực tế & áp dụng hiển thị', editedData = {} } = {}
  ) {
    syncDatabaseFromStorage();
    const auth = requireAdmin('kiểm duyệt đóng góp');
    if (!auth.ok) return fail(auth.error);
    const adminUser = auth.user;

    if (!['APPROVED', 'REJECTED'].includes(decision)) return fail(`Quyết định không hợp lệ: ${decision}`);

    const contrib = ERD_DATABASE.CONTRIBUTION.find((c) => c.contribution_id === contributionId);
    if (!contrib) return fail('Không tìm thấy CONTRIBUTION.');
    if (contrib.status !== 'PENDING') return fail(`Đóng góp đã được xử lý (${contrib.status}).`);

    const nowIso = new Date().toISOString();
    const payload = parseContributionPayload(contrib);
    const beforeStatus = contrib.status;

    let targetRest = contrib.restaurant_id
      ? ERD_DATABASE.RESTAURANT.find((r) => r.restaurant_id === contrib.restaurant_id)
      : null;

    const setVisibilityStatus = (nextStatus) => {
      if (!targetRest || targetRest.visibility_status === nextStatus) return;
      const before = {
        visibility_status: targetRest.visibility_status,
        verified_at: targetRest.verified_at || null,
        verified_by: targetRest.verified_by || null
      };
      targetRest.visibility_status = nextStatus;
      if (nextStatus === 'PUBLISHED') {
        targetRest.verified_at = nowIso;
        targetRest.verified_by = adminUser.user_id;
      }
      targetRest.updated_at = nowIso;
      persistDatabase();
      appendAuditEvent({
        actorUserId: adminUser.user_id,
        entityType: 'RESTAURANT',
        entityId: targetRest.restaurant_id,
        action: `RESTAURANT_VISIBILITY_${nextStatus}`,
        beforeData: before,
        afterData: {
          visibility_status: nextStatus,
          verified_at: targetRest.verified_at,
          verified_by: targetRest.verified_by,
          via_contribution_id: contrib.contribution_id
        }
      });
    };

    if (contrib.contribution_type === 'NEW_RESTAURANT' && decision === 'APPROVED') {
      const finalName = (editedData.name !== undefined ? editedData.name : payload.name || '').trim();
      const finalAddress = (editedData.address !== undefined ? editedData.address : payload.address || '').trim();
      if (!finalName || !finalAddress) {
        return fail('Quán mới cần có tên quán và địa chỉ trước khi duyệt hiển thị.');
      }

      const approvedPoint = approvedLocation(finalAddress, payload, editedData);
      const matchedLocation = approvedPoint.provider === 'GOONG' ? findGoongLocation(approvedPoint.provider_place_id) : null;
      const matchedRestaurant = matchedLocation && ERD_DATABASE.RESTAURANT.find((row) =>
        row.restaurant_id === matchedLocation.restaurant_id
      );
      const pendingDiscovery = matchedRestaurant?.source_type === 'GOONG_DISCOVERY' &&
        matchedRestaurant.visibility_status === 'PENDING' ? matchedRestaurant : null;
      const newRestId = pendingDiscovery?.restaurant_id ?? generateUuid();
      const dishName = (editedData.dishName !== undefined ? editedData.dishName : payload.dishName || '').trim();
      const rawDishPrice = editedData.dishPrice !== undefined ? editedData.dishPrice : payload.dishPrice;
      const hasDishPrice = rawDishPrice !== '' && rawDishPrice !== null && rawDishPrice !== undefined;
      const dishPrice = hasDishPrice ? Number(rawDishPrice) : null;
      if (dishName && dishPrice !== null && (!Number.isFinite(dishPrice) || dishPrice < 0)) {
        return fail('Giá món phải là số lớn hơn hoặc bằng 0.');
      }

      targetRest = {
        restaurant_id: newRestId,
        slug: 'contrib-' + Date.now(),
        name: finalName,
        description: payload.note || 'Quán mới do cộng đồng đóng góp và đã được Admin xác minh.',
        phone: (editedData.phone || payload.phone || '').trim(),
        visibility_status: 'PUBLISHED',
        verified_at: nowIso,
        verified_by: adminUser.user_id,
        source_type: 'COMMUNITY',
        source_ref: `contribution:${contrib.contribution_id}`,
        open_until: (editedData.openUntil || payload.openUntil || '21:00').trim(),
        dish_keywords: [(dishName || finalName).toLowerCase(), 'ăn sáng'],
        map_pos: { x: 52, y: 48 },
        created_at: pendingDiscovery?.created_at ?? nowIso,
        updated_at: nowIso
      };

      const locRes = addOrUpdateRestaurantLocation(newRestId, approvedPoint, pendingDiscovery ? matchedLocation : null);
      if (!locRes.ok) return fail(locRes.error);

      if (pendingDiscovery) Object.assign(pendingDiscovery, targetRest);
      else ERD_DATABASE.RESTAURANT.push(targetRest);
      contrib.restaurant_id = newRestId;

      if (dishName) {
        const newItemId = generateUuid();
        ERD_DATABASE.MENU_ITEM.push({
          menu_item_id: newItemId,
          restaurant_id: newRestId,
          name: dishName,
          description: 'Món chính của quán',
          status: 'ACTIVE',
          diet_tags: [],
          created_at: nowIso,
          updated_at: nowIso
        });
        if (dishPrice !== null) {
          const priceRes = setCurrentMenuItemPrice({
            menuItemId: newItemId,
            minPrice: dishPrice,
            maxPrice: dishPrice,
            currency: 'VND',
            sourceType: 'COMMUNITY_CONTRIBUTION',
            sourceReference: contrib.evidence_uri || `contribution:${contrib.contribution_id}`
          });
          if (!priceRes.ok) return fail(priceRes.error);
        }
      }

      appendAuditEvent({
        actorUserId: adminUser.user_id,
        entityType: 'RESTAURANT',
        entityId: newRestId,
        action: pendingDiscovery ? 'PUBLISH_DISCOVERY_FROM_CONTRIBUTION' : 'CREATE_PUBLISHED_RESTAURANT_FROM_CONTRIBUTION',
        beforeData: pendingDiscovery ? { visibility_status: 'PENDING' } : null,
        afterData: {
          name: targetRest.name,
          location: { ...locRes.data },
          visibility_status: 'PUBLISHED',
          verified_at: nowIso,
          verified_by: adminUser.user_id,
          via_contribution_id: contrib.contribution_id
        }
      });
    } else if (decision === 'APPROVED' && targetRest) {
      const applyRes = applyApprovedCorrection(contrib, targetRest, adminUser, setVisibilityStatus, editedData);
      if (applyRes && !applyRes.ok) return fail(applyRes.error);
    }

    contrib.status = decision;
    contrib.reviewed_by = adminUser.user_id;
    contrib.review_note = (reviewNote || '').trim() || (decision === 'APPROVED' ? 'Admin đã xác minh & chỉnh sửa hiển thị' : 'Từ chối');
    contrib.reviewed_at = nowIso;
    persistDatabase();

    appendAuditEvent({
      actorUserId: adminUser.user_id,
      entityType: 'CONTRIBUTION',
      entityId: contrib.contribution_id,
      action: `MODERATE_${contrib.contribution_type}_${decision}`,
      beforeData: { status: beforeStatus },
      afterData: {
        status: contrib.status,
        restaurant_id: contrib.restaurant_id,
        reviewed_by: adminUser.user_id,
        review_note: contrib.review_note,
        reviewed_at: nowIso,
        edited_data: Object.keys(editedData).length > 0 ? editedData : undefined
      }
    });

    return { ok: true, data: contrib };
  },

  getAuditEvents() {
    syncDatabaseFromStorage();
    return ERD_DATABASE.AUDIT_EVENT.map((ev) => {
      const actor = ERD_DATABASE.APP_USER.find((u) => u.user_id === ev.actor_user_id);
      return {
        ...ev,
        actor_name: actor ? actor.display_name : 'Hệ thống'
      };
    });
  },

  getAllRestaurantsList() {
    syncDatabaseFromStorage();
    return ERD_DATABASE.RESTAURANT.filter((r) => r.visibility_status === 'PUBLISHED');
  },

  getSearchAreas() {
    syncDatabaseFromStorage();
    return ERD_DATABASE.SEARCH_AREA.filter((area) => area.is_active)
      .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, 'vi'));
  },

  getSearchAreasForAdmin() {
    syncDatabaseFromStorage();
    if (!requireAdmin('xem điểm tìm kiếm').ok) return [];
    return [...ERD_DATABASE.SEARCH_AREA].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, 'vi'));
  },

  saveSearchArea({ areaId, name, shortLabel, address, displayOrder, active, location, latitude, longitude }) {
    syncDatabaseFromStorage();
    const auth = requireAdmin('lưu điểm tìm kiếm');
    if (!auth.ok) return fail(auth.error);
    const existing = ERD_DATABASE.SEARCH_AREA.find((area) => area.area_id === areaId);
    if (areaId && !existing) return fail('Không tìm thấy khu vực tìm kiếm.');

    const label = String(name ?? '').trim();
    const short = String(shortLabel ?? '').trim();
    const anchorAddress = String(address ?? '').trim();
    const order = manualCoordinate(displayOrder);
    if (!label || label.length > 100 || !short || short.length > 40 || !anchorAddress || anchorAddress.length > 500) {
      return fail('Nhập tên khu vực, tên ngắn và địa chỉ điểm mốc hợp lệ.');
    }
    if (!Number.isInteger(order) || order < 0 || order > 10000) return fail('Thứ tự phải là số nguyên từ 0 đến 10000.');
    if (ERD_DATABASE.SEARCH_AREA.some((area) => area !== existing && normalizeDishText(area.name) === normalizeDishText(label))) {
      return fail('Tên khu vực đã được sử dụng.');
    }
    if (!active && !ERD_DATABASE.SEARCH_AREA.some((area) => area !== existing && area.is_active)) {
      return fail('Cần giữ ít nhất một khu vực đang hoạt động.');
    }

    const submittedPoint = isGoongLocation(location) && location.address_text === anchorAddress ? location : null;
    let lat = manualCoordinate(latitude);
    let lng = manualCoordinate(longitude);
    let placeId = null;
    if (submittedPoint) {
      lat = submittedPoint.latitude;
      lng = submittedPoint.longitude;
      placeId = submittedPoint.provider_place_id;
    } else if (!String(latitude ?? '').trim() && !String(longitude ?? '').trim() && anchorAddress === existing?.anchor_address) {
      lat = existing.anchor_latitude;
      lng = existing.anchor_longitude;
      placeId = existing.anchor_place_id;
    }
    if (!hasCoordinates(lat, lng)) return fail('Chọn địa chỉ Goong hoặc nhập đủ vĩ độ và kinh độ cho điểm mốc.');

    const saved = {
      area_id: existing?.area_id ?? generateUuid(),
      name: label,
      short_label: short,
      anchor_address: anchorAddress,
      anchor_latitude: lat,
      anchor_longitude: lng,
      anchor_place_id: placeId,
      display_order: order,
      is_active: Boolean(active)
    };
    const before = existing ? { ...existing } : null;
    if (existing) Object.assign(existing, saved);
    else ERD_DATABASE.SEARCH_AREA.push(saved);
    appendAuditEvent({
      actorUserId: auth.user.user_id,
      entityType: 'SEARCH_AREA',
      entityId: saved.area_id,
      action: existing ? 'UPDATE_SEARCH_AREA' : 'CREATE_SEARCH_AREA',
      beforeData: before,
      afterData: saved
    });
    return { ok: true, data: saved };
  }
};
