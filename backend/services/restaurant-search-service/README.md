# Restaurant Search Service

Thành viên 2 phụ trách. Cổng mặc định `4003` khi chạy độc lập.

Tìm quán theo tên món, ngân sách và bán kính. Service sở hữu `RESTAURANT`, `RESTAURANT_LOCATION`, `RESTAURANT_DISCOVERY`, `CUISINE`, `RESTAURANT_CUISINE`, `MENU_ITEM`, `PRICE_ASSERTION` ([ERD](../../../docs/ERD.md)).

## Luồng tìm kiếm

Mỗi lượt tìm trả **tối đa 3 quán** (`results` + `suggestions` cộng lại, và không vượt `limit`). Thiếu thì bù theo thứ tự dưới đây, đủ 3 là dừng.

1. **Catalog.** Quán `PUBLISHED` có món `ACTIVE` khớp tên đã chuẩn hóa, giá hiện hành (`is_current = 1`) `min_price <= max_price`. Tên và giá phải thỏa trên **cùng một món**. Mỗi quán chọn chi nhánh gần nhất trong bán kính (đường chim bay). Đủ 3 quán thì trả ngay, không gọi Goong.
2. **Gợi ý đã lưu.** Chưa đủ 3 thì đọc `RESTAURANT_DISCOVERY` theo từ khóa chuẩn hóa (`bún bò` và `bun bo` cùng khóa `bun bo`) và bán kính. Quán `PENDING`/`PUBLISHED` mới được gợi ý; quán đã có trong kết quả catalog thì bỏ qua.
3. **Goong.** Catalog + gợi ý đã lưu vẫn chưa đủ 3 mới gọi Geo Service: Autocomplete `quán <món>` rồi Place Detail cho tối đa 5 kết quả. Lọc lại bán kính bằng tọa độ trả về, loại địa chỉ/tên đường, lưu quán `PENDING` + chi nhánh + từ khóa, dùng lại `restaurant_id` qua `(provider, provider_place_id)` (quán đã `PUBLISHED` trùng mã Goong thì bỏ qua, không ghi vào `RESTAURANT_DISCOVERY`; quán catalog không có mã Goong, ví dụ dữ liệu mẫu `OSM`, không được nhận ra nên có thể bị lưu trùng), rồi đọc lại kho để bù cho đủ 3.

Ví dụ: catalog 2 quán, quét Goong thêm được 1 thì trả 3 (2 `results` + 1 `suggestions`); quét không ra thì trả 2. Goong lỗi hoặc trống không làm lượt tìm lỗi, chỉ không có gợi ý thêm. Lỗi MySQL trả `500` cho client.

Lưu ý hạn mức Goong: khi tổng vẫn dưới 3 quán, **mỗi lượt tìm lặp lại** sẽ gọi Goong lại (1 Autocomplete + tối đa 5 Place Detail), vì kho chưa đủ.

## API

`POST /api/v1/restaurants/search` (`Content-Type: application/json`)

```json
{
  "dish": "phở bò",
  "max_price": 50000,
  "radius_km": 2,
  "sort_by": "recommended",
  "anchor": { "source": "GPS", "lat": 21.0048, "lng": 105.8042 },
  "limit": 3,
  "include_route": false
}
```

| Trường | Ghi chú |
|---|---|
| `dish` | Chỉ tên món. `50k phở bò` trả `422` (giá và bán kính đi qua bộ lọc). Dùng chung `shared/dishText.mjs` với NLP Service. |
| `max_price` | Số nguyên đồng/người, 1 đến 10.000.000. |
| `radius_km` | Lớn hơn 0 và tối đa 50. |
| `anchor` | `{ source: "GPS", lat, lng }` hoặc `{ source: "AREA", area_id }`. |
| `sort_by` | `recommended` (mặc định: đã xác minh → rating → gần), `distance`, `rating`, `price`. |
| `limit` | Tùy chọn, 1 đến 50, mặc định 3. Tổng số quán trả về luôn bị chặn ở 3, nên `limit` chỉ có tác dụng khi nhỏ hơn 3. |
| `include_route` | Tùy chọn. `true` gọi Distance Matrix (xe máy) cho tối đa 10 quán đầu và điền `route`. Mặc định tắt để tiết kiệm hạn mức Goong. |

Phản hồi `200`:

```json
{
  "success": true,
  "data": {
    "source": "CATALOG",
    "results": [{
      "restaurant_id": "…", "name": "Pho Bo 158 - Quan Nhan", "cuisines": ["Quán phở"],
      "verified": true, "verification_label": "Đã xác minh",
      "location": { "location_id": "…", "address_text": "…", "latitude": 21.0086, "longitude": 105.8095, "commune": null, "province": null },
      "distance_m": 290, "distance_km": 0.29, "distance_basis": "STRAIGHT_LINE", "route": null,
      "starting_price": 45000, "starting_max_price": 45000, "leftover": 5000,
      "matched_items": [{ "menu_item_id": "…", "name": "Phở bò chín", "min_price": 45000, "max_price": 45000, "price_updated_at": "2024-01-15T07:30:00.000Z" }],
      "rating": null, "review_count": null
    }],
    "suggestions": [],
    "meta": { "anchor": { "source": "GPS", "latitude": 21.0048, "longitude": 105.8042 }, "radius_km": 2, "max_price": 50000, "sort_by": "recommended", "total_matched": 4 }
  }
}
```

- `source`: `CATALOG` (có ít nhất 1 quán từ catalog, có thể kèm `suggestions` bù cho đủ 3), `DISCOVERY` (không có catalog, gợi ý đã lưu), `GEO` (không có catalog, vừa tìm thêm qua Goong), `NONE`.
- Mỗi phần tử `suggestions` có `source: "GOONG"`, `verified: false` và `verification_label: "Chưa xác nhận món và giá"`, không có giá.
- Không trả `verified_by` (tên Admin) cho khách. `price_updated_at` là `PRICE_ASSERTION.created_at`.
- Lỗi: `{ "success": false, "code": "…", "error": "…" }` với `400` (`INVALID_REQUEST`), `404` (`AREA_NOT_FOUND`), `413`, `415`, `422` (`INVALID_DISH`), `503` (`GEO_UNAVAILABLE`), `500` (`INTERNAL_ERROR`).

`GET /api/v1/restaurants/health` kiểm tra kết nối kho dữ liệu.

## API nội bộ (Catalog) cho feedback-review-service và trang Admin

Tiền tố `/api/internal/v1/`. Đây là API **giữa các service**: `feedback-review-service` (4005) gọi khi Admin duyệt, trang Admin gọi để quản lý catalog. Service này sở hữu các bảng catalog nên chỉ nó ghi vào đó ([SOA mục 2](../../../docs/SOA_ARCHITECTURE.md)).

**Xác thực.** Mọi request gửi header `X-Internal-Token` bằng giá trị `INTERNAL_API_TOKEN`. Chưa đặt biến này thì toàn bộ API nội bộ tắt (`503 INTERNAL_API_DISABLED`), sai token trả `401`. API Gateway không được chuyển tiếp `/api/internal/*` ra ngoài. Danh tính Admin do **bên gọi** truyền ở `acted_by` (id `APP_USER`, tối đa 36 ký tự); service này không có phiên đăng nhập để tự kiểm tra, nên chỉ nhận request từ mạng nội bộ có token.

| Method | Đường dẫn | Dùng cho |
|---|---|---|
| `GET` | `/restaurants?status=&q=&limit=&offset=` | Hàng đợi Admin (ví dụ `status=PENDING`: các quán quét từ Goong) |
| `GET` | `/restaurants/:id` | Quán đầy đủ: chi nhánh, loại hình, món kèm giá hiện hành, `verified_by` |
| `POST` | `/restaurants` | `NEW_RESTAURANT` được duyệt, hoặc Admin tạo trực tiếp (tùy chọn kèm `menu_items`). Trả `201` |
| `PATCH` | `/restaurants/:id` | `RESTAURANT_CORRECTION`: `name`, `description`, `phone`, `cuisines` |
| `POST` | `/restaurants/:id/status` | Đổi `visibility_status`: công khai quán `PENDING`, từ chối, tạm ngưng, `CLOSED` (sau `CLOSED_REPORT`) |
| `POST` | `/restaurants/:id/verify` | Admin kiểm chứng lại, chỉ làm mới `verified_at`/`verified_by` |
| `POST` | `/restaurants/:id/locations` | Thêm chi nhánh (`201`) |
| `PATCH` | `/restaurants/:id/locations/:locationId` | Sửa địa chỉ, tọa độ, đặt chi nhánh chính |
| `POST` | `/restaurants/:id/menu-items` | `MENU_CORRECTION`: thêm món, kèm giá hiện hành nếu có (`201`) |
| `GET` | `/menu-items/:id` | Món, giá hiện hành, **lịch sử giá**, trạng thái quán. Dùng để kiểm tra `price_assertion_id` khi nhận báo giá |
| `PATCH` | `/menu-items/:id` | Đổi `name`, `description`, `status` (`ACTIVE`/`INACTIVE`) |
| `POST` | `/menu-items/:id/prices` | Duyệt giá mới (`201`) |
| `POST` | `/menu-items/:id/prices/withdraw` | Duyệt gỡ giá: món về `NO_PRICE` |

Mọi `POST`/`PATCH` nhận `Content-Type: application/json` (tối đa 16 KB), từ chối trường lạ và bắt buộc có `acted_by`. Phản hồi `{ success: true, data }`; lỗi `{ success: false, code, error, details? }`.

**Quy tắc áp dụng khi duyệt** (theo `docs/ERD.md` mục 2 và `docs/SOA_ARCHITECTURE.md` mục 2):

- **Giá.** Duyệt giá mới chuyển dòng hiện hành cũ sang `is_current = 0` rồi thêm dòng mới `is_current = 1`, `created_at` là lúc duyệt. Duyệt 49.000 rồi 48.000 thì hiện 48.000, 49.000 còn trong lịch sử. Gỡ giá chỉ đặt `is_current = 0`, không xóa lịch sử.
- **Xác minh.** Mọi thay đổi do Admin duyệt (quán, chi nhánh, món, giá, công khai quán) làm mới `RESTAURANT.verified_at`/`verified_by`. Từ chối, tạm ngưng, đóng cửa và các lần gọi không đổi dữ liệu thì không làm mới. Không trả `verified_by` ra API tìm kiếm cho khách.
- **Lặp lại an toàn.** `POST /prices` có `source_reference` (ví dụ `price_report_id`): gọi lại cùng báo cáo trả `200` với `replayed: true`, không thêm dòng, không đè giá mới hơn. `POST /restaurants` có `source_ref` làm điều tương tự theo `(source_type, source_ref)`.
- **Kiểm tra tham chiếu.** `referenced_price_assertion_id` (báo giá `WRONG_PRICE`) phải thuộc đúng món, `422 PRICE_ASSERTION_MISMATCH`; mức giá đã vào lịch sử vẫn hợp lệ.
- **Chi nhánh.** Địa điểm `(provider, provider_place_id)` trùng trả `409 DUPLICATE_LOCATION` kèm `restaurant_id` đang giữ nó (ví dụ quán `PENDING` đã quét từ Goong: dùng `PATCH`/`status` thay vì tạo mới). Chi nhánh đầu tiên luôn là chính, chỉ có một chi nhánh chính. Đổi địa chỉ phải gửi lại tọa độ (`COORDINATES_REQUIRED`); đổi địa chỉ hoặc tọa độ của chi nhánh GOONG/OSM phải gửi lại nhóm `provider` (hoặc `MANUAL`), `PROVIDER_REQUIRED`. Công khai quán cần chi nhánh chính (`409 NO_PRIMARY_LOCATION`).
- **Món.** Tên được chuẩn hóa lại vào `name_normalized` mỗi lần tạo hoặc đổi tên, và không được trùng món `ACTIVE` khác của quán (`409 DUPLICATE_MENU_ITEM`).
- **Giao dịch.** Mỗi thao tác ghi là một giao dịch (MySQL: `READ COMMITTED`, khóa dòng quán rồi dòng món theo thứ tự cố định; kho in-memory: tuần tự, lỗi thì hoàn tác). Hai lần duyệt cùng món chạy lần lượt, luôn còn đúng một giá `is_current = 1`.
- **Audit.** `AUDIT_EVENT` thuộc service 4005, nên phản hồi luôn có `before`/`after` (và `price`, `restaurant` với thao tác giá) để bên gọi tự ghi.

Ví dụ duyệt giá:

```powershell
curl -X POST http://localhost:3000/api/internal/v1/menu-items/<menu_item_id>/prices `
  -H "Content-Type: application/json" -H "X-Internal-Token: <INTERNAL_API_TOKEN>" `
  -d '{\"min_price\":48000,\"source_reference\":\"<price_report_id>\",\"acted_by\":\"<admin_user_id>\"}'
```

## Chạy

**Cùng server preview** (không cần MySQL): `node backend/server.js`. Route đã được nối vào `backend/server.js`, kho in-memory nạp 6 quán từ `db/seed.json` (lấy từ `frontend/js/demo/mockDatabase.js`). Dữ liệu `PENDING` lưu từ Goong mất khi tắt server.

**Chạy riêng** (cổng 4003): `node backend/services/restaurant-search-service/src/index.js`

**Với MySQL 8.0.16+:**

```powershell
cd backend/services/restaurant-search-service
npm install
mysql -u root -p < db/schema.sql
mysql -u root -p < db/seed.sql      # tùy chọn
```

Rồi điền `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` trong `backend/.env` (mẫu ở `backend/.env.example`). Có `MYSQL_HOST` và `MYSQL_DATABASE` thì service tự chuyển từ in-memory sang MySQL.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `RESTAURANT_SEARCH_PORT` | `4003` | Cổng khi chạy riêng. |
| `GEO_SERVICE_URL` | `http://localhost:$PORT` | Nơi có `/api/geo/*` và `/api/v1/geo/areas/:id`. Mặc định là [Routing & Geo Service](../routing-geo-service/README.md) chạy trong server preview (cần `GOONG_API_KEY`). Chạy riêng service 4004 thì đặt `http://localhost:4004`. |
| `REVIEW_SERVICE_URL` | trống | Feedback & Review Service (4005), dùng cho sắp xếp theo rating. Trống thì `rating` là `null`. |
| `INTERNAL_API_TOKEN` | trống | Token cho API nội bộ `/api/internal/v1/*`. Trống thì API này tắt. |

Thử nhanh:

```powershell
curl -X POST http://localhost:3000/api/v1/restaurants/search -H "Content-Type: application/json" `
  -d '{\"dish\":\"pho bo\",\"max_price\":50000,\"radius_km\":2,\"anchor\":{\"source\":\"GPS\",\"lat\":21.0048,\"lng\":105.8042}}'
```

## Kiểm thử

```powershell
cd backend/services/restaurant-search-service
npm test        # node --test, không cần cài thêm gói nào
```

Test bao phủ API nội bộ (xác thực, áp dụng/gỡ giá, lịch sử, lặp lại an toàn, song song, hoàn tác, chi nhánh, đổi trạng thái, quán `PENDING` đi từ gợi ý sang catalog) cùng lọc tên/giá trên cùng món, giá lịch sử, trạng thái quán, bán kính và chi nhánh gần nhất, bốn kiểu sắp xếp, luồng DISCOVERY/Goong (lưu `PENDING`, tái sử dụng `restaurant_id`, loại địa chỉ, lỗi từng phần, request song song), validation và HTTP. Lớp MySQL được kiểm tra bằng pool giả (số `?` khớp tham số, thứ tự `POINT(kinh độ, vĩ độ)`, giao dịch, đụng khóa trùng).

## Cần biết trước khi dùng

- **Chưa chạy trên MySQL thật.** `schema.sql` và các câu truy vấn bám theo ERD nhưng chưa được thực thi trên MySQL 8. Chạy `db/schema.sql`, `db/seed.sql` rồi gọi API một lần để xác nhận trước khi demo.
- **Một hợp đồng dự kiến** vì service tương ứng chưa có source: `POST /api/v1/reviews/stats` (Review Service, xem `src/clients/reviewClient.js`); chỉnh client khi hợp đồng thật được chốt. `GET /api/v1/geo/areas/:id` (cho `anchor.source = "AREA"`) đã do [Routing & Geo Service](../routing-geo-service/README.md) cài đặt. Dùng `anchor` kiểu `GPS` thì không phụ thuộc cả hai.
- **API nội bộ đã có** (mục trên) nhưng `feedback-review-service` (4005) chưa có source, nên chưa được gọi từ bên đó. Hợp đồng do service này định nghĩa; bên 4005 cần gọi đúng đường dẫn, `acted_by` và `source_reference`.
- **Công khai quán không bắt buộc có món.** Chỉ cần chi nhánh chính; quán chưa có món và giá hợp lệ vẫn không xuất hiện trong `results` vì tìm kiếm yêu cầu món khớp có giá hiện hành.
- **Chưa có** xóa quán/món/chi nhánh (ERD dùng `ON DELETE RESTRICT`; dùng `status` hoặc `INACTIVE` thay thế).
- Khi dùng dữ liệu Goong để lưu lâu dài, kiểm tra điều khoản gói API về phạm vi lưu và thời hạn tái sử dụng.

## Cấu trúc

```text
src/
  index.js                  Chọn kho dữ liệu theo biến môi trường, dựng context, chạy riêng cổng 4003 (Express)
  app.js                    createRestaurantSearchApp: ứng dụng Express, gắn router công khai + nội bộ
  routes/searchRoutes.js    Router /api/v1/restaurants (search, health)
  searchService.js          Luồng catalog → gợi ý đã lưu → Goong, sắp xếp, khoảng cách theo tuyến
  validation.js             Kiểm tra body của /search
  http.js                   Middleware dùng chung: send, requireJson, jsonBody, methodNotAllowed, error handler
  admin/                    API nội bộ: catalogAdminService (nghiệp vụ), adminValidation, internalRoutes (Router Express + token)
  geoMath.js                Haversine, khung bao quanh bán kính
  clients/                  geoClient (Routing & Geo), reviewClient (Feedback & Review)
  repositories/             mysqlRepository, memoryRepository (cùng hợp đồng, có transaction(fn) cho API nội bộ)
db/                         schema.sql, seed.sql, seed.json
test/                       node --test
```

Xem [bảng phân công](../../../docs/TEAM_ASSIGNMENT.md) và [kiến trúc SOA](../../../docs/SOA_ARCHITECTURE.md).
