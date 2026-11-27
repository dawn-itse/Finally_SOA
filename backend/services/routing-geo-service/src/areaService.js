/**
 * Nghiệp vụ SEARCH_AREA: danh sách mốc cho giao diện/Search Service và quản lý cho Admin.
 * Quy tắc: tên khu vực không trùng, và luôn còn ít nhất một khu vực is_active (kiểm tra trong giao dịch).
 */
const { randomUUID } = require('node:crypto');
const { ServiceError } = require('./errors');
const { parseAreaInput } = require('./validation');

const FIELDS = ['name', 'short_label', 'anchor_address', 'anchor_latitude', 'anchor_longitude', 'anchor_place_id', 'display_order', 'is_active'];

/** Dạng công khai: có latitude/longitude theo hợp đồng của geoClient.getArea. */
const publicView = (area) => ({
  area_id: area.area_id,
  name: area.name,
  short_label: area.short_label,
  anchor_address: area.anchor_address,
  anchor_place_id: area.anchor_place_id,
  latitude: area.anchor_latitude,
  longitude: area.anchor_longitude,
  display_order: area.display_order,
  is_active: area.is_active
});

const duplicateName = () => new ServiceError(409, 'DUPLICATE_AREA_NAME', 'Đã có khu vực trùng tên.');
const lastActive = () => new ServiceError(409, 'LAST_ACTIVE_AREA', 'Phải còn ít nhất một khu vực đang hoạt động.');

function createAreaService({ repository, goong = null, randomId = randomUUID }) {
  /** Có anchor_place_id mà thiếu tọa độ: lấy tọa độ (và địa chỉ nếu chưa có) từ Goong Place Detail. */
  async function resolveAnchor(input) {
    if (!input.anchor_place_id || input.anchor_latitude !== undefined) return input;
    if (!goong) throw new ServiceError(503, 'GOONG_NOT_CONFIGURED', 'Goong chưa được cấu hình.');
    const place = await goong.placeDetail(input.anchor_place_id);
    if (!place) throw new ServiceError(422, 'PLACE_NOT_FOUND', 'Goong không có địa điểm với anchor_place_id này.');
    return {
      ...input,
      anchor_address: input.anchor_address ?? place.address_text.slice(0, 500),
      anchor_latitude: Math.round(place.latitude * 1e7) / 1e7,
      anchor_longitude: Math.round(place.longitude * 1e7) / 1e7,
      anchor_place_id: place.provider_place_id.slice(0, 512)
    };
  }

  const pick = (area) => Object.fromEntries(FIELDS.map((field) => [field, area[field]]));

  async function mapDuplicate(promise) {
    try {
      return await promise;
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') throw duplicateName(); // hai request tạo cùng tên cùng lúc
      throw error;
    }
  }

  return {
    /** Khu vực đang hoạt động theo thứ tự hiển thị, cho giao diện chọn mốc. */
    async listPublic() {
      return (await repository.listAreas({ activeOnly: true })).map(publicView);
    },

    /** Mốc theo id; null nếu không tồn tại. Khu vực đã ẩn vẫn trả về với is_active = false. */
    async getPublic(id) {
      const area = await repository.getArea(id);
      return area ? publicView(area) : null;
    },

    async listAdmin() {
      return repository.listAreas();
    },

    async getAdmin(id) {
      const area = await repository.getArea(id);
      if (!area) throw new ServiceError(404, 'AREA_NOT_FOUND', 'Không tìm thấy khu vực.');
      return { area };
    },

    async create(body) {
      const input = await resolveAnchor(parseAreaInput(body, { partial: false }));
      return mapDuplicate(repository.transaction(async (tx) => {
        const activeIds = await tx.lockActiveAreaIds();
        if (await tx.findByName(input.name)) throw duplicateName();
        const area = {
          area_id: randomId(),
          name: input.name,
          short_label: input.short_label,
          anchor_address: input.anchor_address,
          anchor_latitude: input.anchor_latitude,
          anchor_longitude: input.anchor_longitude,
          anchor_place_id: input.anchor_place_id ?? null,
          display_order: input.display_order ?? Math.min(10000, (await tx.maxDisplayOrder()) + 1),
          is_active: input.is_active ?? true
        };
        if (!area.is_active && activeIds.length === 0) throw lastActive();
        await tx.insertArea(area);
        return { changed: true, area, before: null, after: area };
      }));
    },

    async update(id, body) {
      let patch = parseAreaInput(body, { partial: true });
      patch = await resolveAnchor(patch);
      return mapDuplicate(repository.transaction(async (tx) => {
        const activeIds = await tx.lockActiveAreaIds();
        const before = await tx.getArea(id);
        if (!before) throw new ServiceError(404, 'AREA_NOT_FOUND', 'Không tìm thấy khu vực.');

        const next = { ...before, ...patch };
        // Đổi tọa độ thủ công mà không kèm mã Goong thì mã cũ không còn ứng với mốc: bỏ liên kết.
        const movedAnchor = next.anchor_latitude !== before.anchor_latitude || next.anchor_longitude !== before.anchor_longitude;
        if (movedAnchor && patch.anchor_place_id === undefined) next.anchor_place_id = null;

        if (patch.name !== undefined && await tx.findByName(next.name, id)) throw duplicateName();
        if (before.is_active && !next.is_active && !activeIds.some((activeId) => activeId !== id)) throw lastActive();

        const changedFields = Object.fromEntries(FIELDS.filter((field) => next[field] !== before[field]).map((field) => [field, next[field]]));
        if (Object.keys(changedFields).length === 0) return { changed: false, area: before, before, after: before };
        await tx.updateArea(id, changedFields);
        const after = pick(next);
        return { changed: true, area: { area_id: id, ...after }, before, after: { area_id: id, ...after } };
      }));
    },

    ping: () => repository.ping()
  };
}

module.exports = { createAreaService, publicView };
