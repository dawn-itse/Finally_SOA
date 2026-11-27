/**
 * Kho SEARCH_AREA in-memory (dùng khi chưa cấu hình MySQL). Cùng giao diện với mysqlAreaRepository.
 * Giao dịch chạy tuần tự trên bản sao và chỉ áp dụng khi thành công, nên lỗi giữa chừng không để lại thay đổi.
 */
const clone = (value) => structuredClone(value);
const nameKey = (name) => name.normalize('NFC').trim().toLowerCase(); // như collation utf8mb4_0900_as_ci: phân biệt dấu, không phân biệt hoa thường

function createMemoryAreaRepository(seed = { search_area: [] }) {
  let rows = clone(seed.search_area ?? []);
  let queue = Promise.resolve();

  const byOrder = (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, 'vi') || a.area_id.localeCompare(b.area_id);

  function view(draft) {
    return {
      async lockActiveAreaIds() { return draft.filter((row) => row.is_active).map((row) => row.area_id); },
      async getArea(id) { return clone(draft.find((row) => row.area_id === id) ?? null); },
      async findByName(name, excludeId = null) {
        const found = draft.find((row) => row.area_id !== excludeId && nameKey(row.name) === nameKey(name));
        return found ? clone(found) : null;
      },
      async maxDisplayOrder() { return draft.reduce((max, row) => Math.max(max, row.display_order), 0); },
      async insertArea(area) { draft.push(clone(area)); },
      async updateArea(id, fields) {
        const row = draft.find((item) => item.area_id === id);
        if (row) Object.assign(row, clone(fields));
      }
    };
  }

  return {
    async ping() {},
    async listAreas({ activeOnly = false } = {}) {
      return clone(rows.filter((row) => !activeOnly || row.is_active).sort(byOrder));
    },
    async getArea(id) { return clone(rows.find((row) => row.area_id === id) ?? null); },
    transaction(fn) {
      const run = queue.then(async () => {
        const draft = clone(rows);
        const result = await fn(view(draft));
        rows = draft;
        return result;
      });
      queue = run.catch(() => {});
      return run;
    }
  };
}

module.exports = { createMemoryAreaRepository };
