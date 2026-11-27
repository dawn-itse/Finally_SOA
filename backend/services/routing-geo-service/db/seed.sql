-- Dữ liệu mẫu khớp frontend/js/demo/mockDatabase.js (SEARCH_AREA). Chạy sau schema.sql.
USE mua_gi_day_geo;

INSERT IGNORE INTO search_area
  (area_id, name, short_label, anchor_address, anchor_latitude, anchor_longitude, anchor_place_id, display_order, is_active)
VALUES
  ('18000000-0000-4000-8000-000000000001', 'Lê Văn Lương, Hà Nội',      'Lê Văn Lương', '68 Lê Văn Lương, Hà Nội',   21.0048000, 105.8042000, NULL, 1, 1),
  ('18000000-0000-4000-8000-000000000002', 'Đại học Bách Khoa, Hà Nội', 'ĐH Bách Khoa', '1 Đại Cồ Việt, Hà Nội',     21.0051000, 105.8432000, NULL, 2, 1),
  ('18000000-0000-4000-8000-000000000003', 'Duy Tân, Hà Nội',           'Duy Tân',      '78 Duy Tân, Hà Nội',        21.0312000, 105.7829000, NULL, 3, 1);
