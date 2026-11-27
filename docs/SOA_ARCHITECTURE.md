# Đặc Tả Kiến Trúc Dịch Vụ (SOA Architecture) - Mua Gì Đây

Tài liệu này mô tả bản demo A1–A7, B1–B5 và thiết kế backend SOA dùng MySQL. Bản demo chạy giao diện người dùng và Admin từ `backend/server.js`. Tìm quán, tài khoản demo, kiểm duyệt và quản lý mốc hiện dùng dữ liệu mẫu và localStorage. Các cổng và API nghiệp vụ ở mục 1 là hợp đồng cho giai đoạn backend. Proxy Goong ở mục 3 là API đang có trong bản preview.

---

## 1. Danh sách 7 Dịch Vụ Nghiệp Vụ (SOA Services)

| STT | Tên Thư Mục Service | Port Dự Kiến | Bảng ERD Sở Hữu | Trách Nhiệm Chính |
| :--- | :--- | :--- | :--- | :--- |
| **0** | `backend/api-gateway/` | `4000` | *(Stateless)* | Định tuyến request từ Frontend, kiểm tra phiên/JWT (Auth Guard) và tổng hợp dữ liệu (Aggregator/BFF). |
| **1** | `backend/services/context-weather-service/` | `4001` | *(Cache thời tiết)* | Nhận tọa độ + giờ hệ thống, trả về nhiệt độ, trạng thái thời tiết và câu gợi ý món sáng. |
| **2** | `backend/services/nlp-conversation-service/` | `4002` | *(Stateless)* | Chuẩn hóa tên món và xử lý gợi ý có sẵn. Giá tối đa, bán kính và điểm tìm lấy từ các điều khiển trên giao diện. |
| **3** | `backend/services/restaurant-search-service/` | `4003` | `RESTAURANT`, `RESTAURANT_LOCATION`, `CUISINE`, `RESTAURANT_CUISINE`, `MENU_ITEM`, `PRICE_ASSERTION` | Quản lý catalog quán, chi nhánh, loại món, menu và lịch sử giá. Lọc quán `PUBLISHED` theo món, ngân sách, bán kính rồi trả chi nhánh gần nhất của mỗi quán. |
| **4** | `backend/services/routing-geo-service/` | `4004` | `SEARCH_AREA` | Quản lý mốc tìm kiếm (`SEARCH_AREA`) và tích hợp Goong V2 để chuẩn hóa địa chỉ, đặt nhãn vị trí thiết bị và tính tuyến đường. |
| **5** | `backend/services/feedback-review-service/` | `4005` | `REVIEW`, `PRICE_REPORT`, `CONTRIBUTION`, `AUDIT_EVENT` | Quản lý đánh giá (Rating & Comment), chọn câu trích dẫn nổi bật (Featured Quote), nhận báo cáo giá (`PRICE_REPORT`, trạng thái `PENDING`), đóng góp (`CONTRIBUTION`) của người dùng đã đăng nhập, xử lý hàng đợi kiểm duyệt Admin và ghi `AUDIT_EVENT`. Khi duyệt, gọi API sang `restaurant-search-service` (`4003`) để cập nhật dữ liệu và nhãn `Đã xác minh` (xem mục 2). |
| **6** | `backend/services/user-preference-service/` | `4006` | `USER_PREFERENCE`, `DIETARY_RESTRICTION`, `USER_RESTRICTION`, `DISH_CATEGORY`, `USER_FAVORITE_DISH`, `FAVORITE_RESTAURANT` | Quản lý hồ sơ sở thích ăn uống và quán yêu thích của tài khoản. Guest lưu cá nhân hóa cục bộ trong trình duyệt. |
| **7** | `backend/services/auth-service/` | `4007` | `APP_USER` | Quản lý tài khoản, đăng ký/đăng nhập, cấp/hủy phiên/JWT, vai trò (`USER`/`ADMIN`) và trạng thái `account_status`. |

---

## 2. Quy tắc xác minh và kiểm duyệt (áp dụng cho mọi service)

- Nhãn `Đã xác minh` / `Chưa xác minh` thuộc về **quán** (gồm cả giá của quán), được suy ra từ `RESTAURANT.verified_at IS NOT NULL`. Giá không có trạng thái xác minh riêng.
- Người dùng đã đăng nhập chỉ có thể **gửi** báo cáo giá (`PRICE_REPORT`) hoặc đóng góp (`CONTRIBUTION`); cả hai nằm ở trạng thái `PENDING`. Guest không gửi được vì không có bản ghi `APP_USER`: API Gateway chặn request không có phiên hợp lệ, và `submitted_by` do service lấy từ danh tính đã xác thực, không nhận từ body request. Tài khoản không `ACTIVE` cũng bị từ chối.
- Khi Admin duyệt giá, lần cập nhật thành công sau cùng quyết định giá hiện hành của món. Ví dụ, duyệt 49.000 đồng rồi duyệt 48.000 đồng thì 48.000 đồng được hiển thị và 49.000 đồng vẫn còn trong lịch sử.
- `PRICE_REPORT.price_assertion_id` lưu tham chiếu đến mức giá tại thời điểm gửi báo cáo. Khi duyệt, kiểm tra mức giá được tham chiếu thuộc đúng món. Báo cáo còn `PENDING` có thể được duyệt dù mức giá được tham chiếu đã chuyển sang lịch sử.
- Catalog áp dụng kết quả duyệt cho từng món. Duyệt giá mới chuyển dòng hiện hành cũ sang `is_current = 0` rồi thêm dòng mới với `is_current = 1`. Duyệt gỡ giá chuyển dòng hiện hành sang 0 để món về `NO_PRICE`. Từ chối chỉ lưu quyết định kiểm duyệt. Lần cập nhật giá làm mới `RESTAURANT.verified_at`/`verified_by` và có `AUDIT_EVENT`. Ngày áp dụng giá mới là ngày Admin duyệt.
- Các service khác không ghi trực tiếp vào bảng của Catalog; họ gọi API của Catalog Service (xem `docs/ERD.md`, mục 3).
- Dữ liệu hiển thị cho khách chỉ gồm nhãn xác minh, không trả về `verified_by` (tên Admin).

### Lưu dữ liệu trong backend MySQL

- Dùng InnoDB và `utf8mb4` theo [ERD](ERD.md). ID dùng `CHAR(36)`, thời điểm dùng `DATETIME(3)` theo UTC và `CONTRIBUTION.payload` dùng kiểu `JSON`. Service kiểm tra các trường của payload theo loại đóng góp và `schema_version`.
- Phân vùng sở hữu dữ liệu theo đúng [ERD mục 3](ERD.md#3-ph%C3%A2n-v%C3%B9ng-d%E1%BB%AF-li%E1%BB%87u-theo-service-logic-ownership): `restaurant-search-service` (`4003`) sở hữu `RESTAURANT`, `RESTAURANT_LOCATION`, `CUISINE`, `RESTAURANT_CUISINE`, `MENU_ITEM` và `PRICE_ASSERTION`; `routing-geo-service` (`4004`) sở hữu `SEARCH_AREA`; `feedback-review-service` (`4005`) sở hữu `REVIEW`, `PRICE_REPORT`, `CONTRIBUTION` và `AUDIT_EVENT`; `user-preference-service` (`4006`) sở hữu `USER_PREFERENCE`, `DIETARY_RESTRICTION`, `USER_RESTRICTION`, `DISH_CATEGORY`, `USER_FAVORITE_DISH` và `FAVORITE_RESTAURANT`; `auth-service` (`4007`) sở hữu `APP_USER`. Các service gọi API của service sở hữu dữ liệu khi cần thao tác.
- Khi áp dụng giá trong MySQL, khóa dòng `MENU_ITEM` trong transaction để hai lần duyệt cùng món được xử lý lần lượt, kể cả món chưa có giá. Cột sinh `current_menu_item_id` dùng với `UNIQUE` để bảo đảm mỗi món có tối đa một dòng giá hiện hành.

## 3. Tích hợp vị trí và lộ trình (A7)

Trên bản demo, trình duyệt gọi proxy cùng origin trong `backend/server.js`. Mã xử lý proxy nằm ở `backend/routes/geo.js`. Proxy giới hạn các endpoint được gọi, chuẩn hóa phản hồi và chỉ đọc `GOONG_API_KEY` ở phía Node. Khi tách service, chuyển adapter này sang Geo Service sau API Gateway. Catalog quản lý `RESTAURANT_LOCATION` và quyền duyệt quán.

| Endpoint preview | Goong V2 | Sử dụng trong app |
|---|---|---|
| `GET /api/geo/autocomplete?input=…&location=lat,lng` | `/v2/place/autocomplete` | Tối đa 5 gợi ý khi nhập địa chỉ quán. `location` là tọa độ ưu tiên tùy chọn. |
| `GET /api/geo/place-detail?place_id=…` | `/v2/place/detail` | Chuẩn hóa địa chỉ đã chọn. Yêu cầu dữ liệu địa giới cũ để lưu tham chiếu nếu có. |
| `GET /api/geo/reverse?latlng=lat,lng` | `/v2/geocode` | Lấy nhãn cho tọa độ thiết bị. Giữ nguyên tọa độ tìm kiếm do trình duyệt trả về. |
| `GET /api/geo/distance-matrix?origin=…&destinations=…` | `/v2/distancematrix` | Xem quãng đường xe máy cho tối đa 10 kết quả đang hiển thị, theo thứ tự điểm đến trong request. |
| `GET /api/geo/directions?origin=…&destination=…` | `/v2/direction` | Xem hướng dẫn xe máy khi người dùng bấm “Chỉ đường”. |

Tọa độ dùng thứ tự `lat,lng` với Goong. Ma trận trả mét và giây. App giữ riêng số đo theo đường đi với khoảng cách dùng để tìm kiếm. Nếu thiếu key, hết hạn chờ hoặc điểm đến không có tuyến, bản demo vẫn hiển thị ước tính hiện có. Chế độ đi bộ giữ ước tính và cung cấp liên kết bản đồ khi mở chỉ đường.

Với backend chính thức, client gửi `place_id` khi chọn gợi ý. Service lấy dữ liệu vị trí qua Geo Service và lưu vào đề xuất để Admin đối chiếu. Khi duyệt, Catalog ghi địa chỉ, tọa độ và nguồn vào `RESTAURANT_LOCATION`, kiểm tra trùng theo cặp `provider` và `provider_place_id`, rồi lưu lịch sử. Địa chỉ nhập thủ công cần một cặp tọa độ đã kiểm tra trước khi công khai. Xem [Goong REST API V2](https://help.goong.io/kb/rest-api-v2/).

## 4. Tìm theo tên món và điểm mốc (B1–B5)

1. Giao diện nhận tên món và ba lựa chọn riêng gồm khu vực, ngân sách tối đa và bán kính. Người dùng có thể thay điểm mốc bằng tọa độ thiết bị đã cấp quyền.
2. Geo Service quản lý `SEARCH_AREA`. Admin có thể tạo/sửa địa chỉ mốc và cho phép hoặc ẩn từng khu vực. Với backend tách service, Gateway/Restaurant Search giải mốc AREA từ `area_id` đang hoạt động qua Geo Service. Tọa độ GPS chỉ cần cho lượt tìm và các yêu cầu thời tiết/đường đi liên quan.
3. Hợp đồng dự kiến của `POST /api/v1/restaurants/search` nhận `dish`, `max_price` (đồng/người), `radius_km`, `sort_by` và một trong hai dạng `anchor`: `{ source: "AREA", area_id }` hoặc `{ source: "GPS", lat, lng }`. Kiểm tra tọa độ, giới hạn ngân sách và bán kính trước khi truy vấn.
4. Restaurant Search xét mọi địa điểm của quán `PUBLISHED`. Chọn chi nhánh gần nhất trong bán kính đường chim bay và trả một kết quả cho mỗi `restaurant_id`. Cờ `is_primary` dùng cho địa chỉ mặc định của hồ sơ quán. Với mô hình hiện tại, menu và giá được lưu theo quán nên các chi nhánh của cùng quán dùng chung menu.
5. Món phải ở trạng thái `ACTIVE`, khớp tên đã chuẩn hóa, có giá hiện hành và thỏa `PRICE_ASSERTION.min_price <= max_price` của request. Điều kiện tên và giá áp dụng trên cùng một món. Khi triển khai MySQL, dùng `MENU_ITEM.name_normalized` như trong ERD.
6. Phản hồi gồm số quán thực, nhãn điểm mốc, địa chỉ chi nhánh đã chọn và giá bắt đầu của món khớp. Nếu rỗng, trả danh sách rỗng. Goong Distance Matrix bổ sung tuyến đường xe máy cho tối đa 10 điểm sau khi lọc. UI ghi rõ quãng đường đi hoặc khoảng cách đường chim bay và điểm xuất phát.

Bản demo thực hiện luồng này bằng `SEARCH_AREA` trong mock và Haversine trên frontend. Với MySQL, dùng `ST_Distance_Sphere` để kiểm tra theo mét rồi lấy chi nhánh gần nhất của từng quán. Nếu thêm khung lọc sơ bộ để tối ưu, khung phải bao trọn vùng tìm kiếm. Đoạn SQL trong ERD hiện minh họa với điều kiện chi nhánh chính. Truy vấn triển khai cần áp dụng quy tắc xét mọi chi nhánh ở bước 4.
