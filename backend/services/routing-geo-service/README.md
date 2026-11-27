# Routing & Geo Service

Thành viên 2 phụ trách. Cổng mặc định `4004` khi chạy độc lập.

Sở hữu bảng `SEARCH_AREA` ([ERD](../../../docs/ERD.md)) và là nơi duy nhất đọc `GOONG_API_KEY`: chuẩn hóa địa chỉ, tra cứu địa điểm theo từ khóa/tâm/bán kính, đặt nhãn cho tọa độ thiết bị, tính quãng đường và chỉ đường xe máy qua Goong V2. `RESTAURANT_LOCATION` vẫn thuộc `restaurant-search-service` (4003), service này chỉ trả dữ liệu địa điểm để Catalog lưu. Xem [kiến trúc SOA](../../../docs/SOA_ARCHITECTURE.md) mục 3 và 4.

## Chạy

**Cùng server preview** (không cần MySQL): `node backend/server.js`. Geo Service được gắn vào `backend/server.js` và thay proxy cũ ở `backend/routes/geo.js` (file này giờ chỉ còn là lớp tương thích). Kho in-memory nạp 3 khu vực mẫu từ `db/seed.json` và **mất khi khởi động lại**.

**Chạy riêng** (cổng 4004): `node backend/services/routing-geo-service/src/index.js`, rồi đặt `GEO_SERVICE_URL=http://localhost:4004` cho Restaurant Search.

**Với MySQL 8.0.16+:**

```powershell
cd backend/services/routing-geo-service
npm install
mysql -u root -p < db/schema.sql
mysql -u root -p < db/seed.sql      # tùy chọn
```

Rồi đặt `GEO_MYSQL_DATABASE=mua_gi_day_geo` trong `backend/.env`. Service chỉ chuyển sang MySQL khi có biến này (host/user/mật khẩu bỏ trống thì dùng `MYSQL_*` của Catalog), để không vô tình ghi vào CSDL của Catalog.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `GOONG_API_KEY` | trống | Khóa Goong. Trống thì API gọi Goong trả `503 GOONG_NOT_CONFIGURED`, quản lý khu vực vẫn dùng được. |
| `GOONG_MAPTILES_KEY` | trống | Map Key của Goong (khóa công khai, khác API Key) để trình duyệt tải bản đồ. Trống thì frontend dùng nền OpenStreetMap. |
| `GEO_SERVICE_PORT` | `4004` | Cổng khi chạy riêng. |
| `GEO_MYSQL_DATABASE` | trống | Có giá trị thì dùng MySQL, trống thì in-memory. |
| `GEO_INTERNAL_API_TOKEN` | `INTERNAL_API_TOKEN` | Token cho API nội bộ. Cả hai trống thì API nội bộ tắt (`503`). |

## API cho giao diện và Search Service

**Proxy Goong `/api/geo/*`** (`GET`). Hợp đồng giữ nguyên bản preview: `200 { data }`, `404 { error }` khi Goong không có kết quả (autocomplete trống trả `200 { data: [] }`), lỗi `{ error, code }`.

| Đường dẫn | Goong V2 | Ghi chú |
|---|---|---|
| `/api/geo/autocomplete?input=&location=lat,lng&radius=` | `place/autocomplete` | `input` 3–200 ký tự. `radius` (km, tối đa 50) cần đi kèm `location`. Tối đa 5 gợi ý. |
| `/api/geo/place-detail?place_id=` | `place/detail` | Trả địa điểm theo cột `RESTAURANT_LOCATION` (`provider: "GOONG"`, `address_text`, `latitude`, `longitude`, `commune`, `province`, `deprecated_address_text`, `geocoded_at`). |
| `/api/geo/reverse?latlng=lat,lng` | `geocode` | Nhãn địa chỉ cho tọa độ thiết bị. |
| `/api/geo/distance-matrix?origin=&destinations=a\|b\|…` | `distancematrix` | Xe máy, tối đa 10 điểm đến; phần tử `null` nếu không có tuyến. |
| `/api/geo/directions?origin=&destination=` | `direction` | Tuyến ô tô (`vehicle=car`, vì Directions V2 chỉ nhận car/bike): `distance_m`, `duration_s`, `steps` (văn bản thuần) và `polyline` (mã hóa độ chính xác 1e-5 để vẽ bản đồ, có thể `null`). Frontend giải mã bằng `frontend/js/utils/polyline.mjs`. |
| `/api/geo/map-config` (hoặc `/api/v1/geo/map-config`) | không gọi Goong | `{ style_url }`: URL style bản đồ Goong kèm Map Key, hoặc `null` khi chưa đặt `GOONG_MAPTILES_KEY`. |

Tọa độ luôn theo thứ tự `lat,lng`. Các lượt gọi giống hệt nhau cùng lúc dùng chung một yêu cầu tới Goong; service **không lưu kết quả Goong** để tuân điều khoản gói API.

**Tra cứu địa điểm cho Search Service** (`GET /api/v1/geo/places/search?keyword=&lat=&lng=&radius_km=&limit=`): Autocomplete theo từ khóa quanh tâm, Place Detail cho tối đa `limit` gợi ý (1–10, mặc định 5), lọc lại bán kính đường chim bay bằng tọa độ Goong trả về, loại trùng `provider_place_id`, sắp theo khoảng cách. Phản hồi `{ success: true, data: { center, radius_km, places: [{ …như place-detail, distance_m }], meta } }`. Một Place Detail lỗi thì bỏ qua; tất cả đều lỗi thì trả lỗi để bên gọi không hiểu nhầm là "không có quán". Từ khóa dùng nguyên văn (bên gọi tự thêm "quán …"). *Search Service hiện vẫn tự ghép Autocomplete + Place Detail qua `/api/geo/*`; endpoint này dành cho khi muốn gộp thành một lượt gọi.*

**Khu vực tìm kiếm** (`GET`):

- `/api/v1/geo/areas`: khu vực đang hoạt động theo `display_order`, cho giao diện chọn mốc. Mỗi phần tử có `latitude`/`longitude`.
- `/api/v1/geo/areas/:id`: hợp đồng `geoClient.getArea` của Search Service. `404 AREA_NOT_FOUND` nếu không có; khu vực đã ẩn vẫn trả về với `is_active: false` (Search Service đổi thành `404 AREA_NOT_FOUND` cho khách).
- `/api/v1/geo/health`: kiểm tra kho dữ liệu.

## API nội bộ quản lý khu vực cho trang Admin

Tiền tố `/api/internal/v1/geo/`, header `X-Internal-Token` (xem bảng biến). Chưa có token thì `503 INTERNAL_API_DISABLED`, sai token `401`. **API Gateway không được chuyển tiếp `/api/internal/*` ra ngoài.** Nhận `Content-Type: application/json` (tối đa 8 KB), từ chối trường lạ.

| Method | Đường dẫn | Dùng cho |
|---|---|---|
| `GET` | `/areas` | Mọi khu vực, kể cả đã ẩn |
| `POST` | `/areas` | Thêm khu vực (`201`) |
| `GET` | `/areas/:id` | Một khu vực |
| `PATCH` | `/areas/:id` | Sửa từng phần, ẩn/hiện bằng `is_active` |

Trường: `name` (≤100, không trùng, không phân biệt hoa thường nhưng phân biệt dấu như collation `utf8mb4_0900_as_ci`), `short_label` (≤40), `anchor_address` (≤500), `anchor_latitude`/`anchor_longitude` (đi cùng nhau), `anchor_place_id` (Goong, tùy chọn), `display_order` (0–10000, mặc định = lớn nhất + 1), `is_active` (mặc định `true`).

- **Chọn mốc từ Goong:** gửi `anchor_place_id` mà không kèm tọa độ thì service gọi Place Detail để lấy tọa độ (và địa chỉ nếu chưa gửi). Goong không có mã đó: `422 PLACE_NOT_FOUND`.
- **Đổi tọa độ thủ công** mà không kèm `anchor_place_id` mới thì mã Goong cũ bị bỏ liên kết (`null`); sửa riêng địa chỉ thì giữ nguyên.
- **Luôn còn một khu vực hoạt động:** tắt khu vực hoạt động cuối cùng (hoặc tạo khu vực đầu tiên ở dạng ẩn) trả `409 LAST_ACTIVE_AREA`. Kiểm tra trong giao dịch (MySQL: `READ COMMITTED`, khóa tập khu vực đang hoạt động rồi mới khóa dòng đích, theo thứ tự cố định), nên hai lần tắt khác nhau cùng lúc chỉ một lần thành công.
- **Không có xóa.** Dùng `is_active: false` để ẩn.
- Phản hồi `{ success: true, data: { changed, area, before, after } }`, `changed: false` khi không có gì đổi. `AUDIT_EVENT` thuộc 4005 nên `before`/`after` để bên gọi tự ghi.
- Lỗi: `400 INVALID_REQUEST`, `404 AREA_NOT_FOUND`, `409 DUPLICATE_AREA_NAME` / `LAST_ACTIVE_AREA`, `413`, `415`, `503 GOONG_NOT_CONFIGURED`.

## Mã lỗi Goong

`503 GOONG_NOT_CONFIGURED` (thiếu khóa), `503 GOONG_RATE_LIMITED` (Goong trả 429 hoặc `OVER_QUERY_LIMIT`), `502 GOONG_UNAVAILABLE` (lỗi mạng, quá 5 giây, HTTP lỗi), `502 GOONG_BAD_RESPONSE` (dữ liệu thiếu tọa độ/địa chỉ hoặc số liệu không hợp lệ). Khóa API không xuất hiện trong phản hồi hay log.

## Kiểm thử

`npm test` (hoặc `node --test`): 47 test, không cần mạng hay MySQL. Goong được thay bằng `fetch` giả; lớp MySQL được kiểm tra bằng pool giả (số `?`, thứ tự khóa dòng, vòng đời giao dịch). `contract.searchService.test.js` chạy chính `geoClient` và `searchService` của 4003 với Geo Service thật để bảo đảm hai bên khớp hợp đồng.

**Chưa kiểm chứng:** lớp MySQL trên MySQL thật (cú pháp `FOR UPDATE`, `READ COMMITTED`) và các lượt gọi tới Goong thật. Trước khi demo hãy chạy `schema.sql`, `seed.sql`, đặt `GOONG_API_KEY` rồi thử vài API ở trên.

## Chưa nằm trong service này

Trang Admin trong `frontend/` vẫn quản lý khu vực bằng `localStorage` (mock) và chưa gọi API nội bộ; Gateway (4000) chưa có source nên chưa có lớp kiểm tra quyền `ADMIN` phía trước API nội bộ.
