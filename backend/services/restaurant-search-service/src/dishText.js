// Dùng chung quy tắc chuẩn hóa tên món của NLP Service (shared/dishText.mjs là ES module).
let loading;

function loadDishText() {
  loading ??= import('../../../../shared/dishText.mjs');
  return loading;
}

module.exports = { loadDishText };
