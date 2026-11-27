# Đặc Tả Kiến Trúc Dịch Vụ (SOA Architecture) - Mua Gì Đây

Tài liệu này mô tả bản demo A1–A7, B1–B5 và thiết kế backend SOA dùng MySQL. Bản demo chạy giao diện người dùng và Admin từ `backend/server.js`. Tìm quán, tài khoản demo, kiểm duyệt và quản lý mốc hiện dùng dữ liệu mẫu và localStorage. Bản preview phục vụ [API thời tiết qua Meteosource](../backend/services/context-weather-service/README.md) và proxy Goong ở mục 3. Context & Weather Service cũng có thể chạy độc lập trên cổng 4001.

---

## 1. Danh sách 7 Dịch Vụ Nghiệp Vụ (SOA Services)

| STT | Tên Thư Mục Service | Port Dự Kiến | Bảng ERD Sở Hữu | Trách Nhiệm Chính |
| :--- | :--- | :--- | :--- | :--- |
| **0** | `backend/api-gateway/` | `4000` | *(Stateless)* | Định tuyến request từ Frontend, kiểm tra phiên/JWT (Auth Guard) và tổng hợp dữ liệu (Aggregator/BFF). |
| **1** | `backend/services/context-weather-service/` | `4001` | *(Cache thời tiết)* | Nhận tọa độ + giờ hệ thống, trả về nhiệt độ, trạng thái thời tiết và câu gợi ý món sáng. |
| **2** | `backend/services/nlp-conversation-service/` | `4002` | *(Stateless)* | Chuẩn hóa tên món và xử lý gợi ý có sẵn. Giá tối đa, bán kính và điểm tìm lấy từ các điều khiển trên giao diện. |
| **3** | `backend/services/restaurant-search-service/` | `4003` | `RESTAURANT`, `RESTAURANT_LOCATION`, `RESTAURANT_DISCOVERY`, `CUISINE`, `RESTAURANT_CUISINE`, `MENU_ITEM`, `PRICE_ASSERTION` | Truy vấn catalog và gợi ý đã lưu. Khi cả hai rỗng, gọi Geo Service tìm địa điểm và lưu kết quả hợp lệ vào MySQL. |
| **4** | `backend/services/routing-geo-service/` | `4004` | `SEARCH_AREA` | Quản lý mốc, tìm địa điểm Goong khi Catalog yêu cầu, chuẩn hóa địa chỉ, đặt nhãn vị trí thiết bị và tính tuyến đường. |
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
- Phân vùng sở hữu dữ liệu theo bảng ở mục 1 và [ERD mục 3](ERD.md#3-ph%C3%A2n-v%C3%B9ng-d%E1%BB%AF-li%E1%BB%87u-theo-service-logic-ownership). Catalog sở hữu `RESTAURANT_DISCOVERY`. Geo Service trả dữ liệu địa điểm qua API nội bộ để Catalog lưu.
- Khi áp dụng giá trong MySQL, khóa dòng `MENU_ITEM` trong transaction để hai lần duyệt cùng món được xử lý lần lượt, kể cả món chưa có giá. Cột sinh `current_menu_item_id` dùng với `UNIQUE` để bảo đảm mỗi món có tối đa một dòng giá hiện hành.

## 3. Tích hợp vị trí và lộ trình (A7)

Trên bản demo, trình duyệt gọi proxy cùng origin trong `backend/server.js`. Mã xử lý proxy nằm ở `backend/routes/geo.js`. Proxy giới hạn các endpoint được gọi, chuẩn hóa phản hồi và chỉ đọc `GOONG_API_KEY` ở phía Node. Khi tách service, chuyển adapter này sang Geo Service sau API Gateway. Catalog quản lý `RESTAURANT_LOCATION` và quyền duyệt quán.

| Endpoint preview | Goong V2 | Sử dụng trong app |
|---|---|---|
| `GET /api/geo/autocomplete?input=…&location=lat,lng&radius=…` | `/v2/place/autocomplete` | Tối đa 5 gợi ý. Nhập địa chỉ có thể bỏ qua tọa độ và bán kính. Tìm thêm địa điểm gửi cả hai tham số. |
| `GET /api/geo/place-detail?place_id=…` | `/v2/place/detail` | Chuẩn hóa địa chỉ đã chọn. Yêu cầu dữ liệu địa giới cũ để lưu tham chiếu nếu có. |
| `GET /api/geo/reverse?latlng=lat,lng` | `/v2/geocode` | Lấy nhãn cho tọa độ thiết bị. Giữ nguyên tọa độ tìm kiếm do trình duyệt trả về. |
| `GET /api/geo/distance-matrix?origin=…&destinations=…` | `/v2/distancematrix` | Xem quãng đường xe máy cho tối đa 10 kết quả đang hiển thị, theo thứ tự điểm đến trong request. |
| `GET /api/geo/directions?origin=…&destination=…` | `/v2/direction` | Xem hướng dẫn xe máy khi người dùng bấm “Chỉ đường”. |

Tọa độ dùng thứ tự `lat,lng` với Goong. Ma trận trả mét và giây. App giữ riêng số đo theo đường đi với khoảng cách dùng để tìm kiếm. Nếu thiếu key, hết hạn chờ hoặc điểm đến không có tuyến, bản demo vẫn hiển thị ước tính hiện có. Chế độ đi bộ giữ ước tính và cung cấp liên kết bản đồ khi mở chỉ đường.

Với backend chính thức, client gửi `place_id` khi chọn gợi ý. Service lấy dữ liệu vị trí qua Geo Service và lưu vào đề xuất để Admin đối chiếu. Khi duyệt, Catalog ghi địa chỉ, tọa độ và nguồn vào `RESTAURANT_LOCATION`, kiểm tra trùng theo cặp `provider` và `provider_place_id`, rồi lưu lịch sử. Địa chỉ nhập thủ công cần một cặp tọa độ đã kiểm tra trước khi công khai. Xem [Goong REST API V2](https://help.goong.io/kb/rest-api-v2/).

## 4. Tìm theo tên món và điểm mốc (B1–B5)

1. Giao diện nhận tên món và ba lựa chọn riêng gồm khu vực, ngân sách tối đa và bán kính. Bản preview gọi `POST /api/v1/nlp/parse` để chuẩn hóa tên món hoặc lấy tên món từ gợi ý thời tiết. Người dùng có thể thay điểm mốc bằng tọa độ thiết bị đã cấp quyền. [Hợp đồng NLP Service](../backend/services/nlp-conversation-service/README.md)
2. Geo Service quản lý `SEARCH_AREA`. Admin có thể tạo/sửa địa chỉ mốc và cho phép hoặc ẩn từng khu vực. Với backend tách service, Gateway/Restaurant Search giải mốc AREA từ `area_id` đang hoạt động qua Geo Service. Tọa độ GPS dùng cho lượt tìm và các yêu cầu thời tiết, tra cứu địa điểm hoặc đường đi liên quan.
3. Hợp đồng dự kiến của `POST /api/v1/restaurants/search` nhận `dish`, `max_price` (đồng/người), `radius_km`, `sort_by` và một trong hai dạng `anchor`: `{ source: "AREA", area_id }` hoặc `{ source: "GPS", lat, lng }`. Kiểm tra tọa độ, giới hạn ngân sách và bán kính trước khi truy vấn.
4. Restaurant Search xét mọi địa điểm của quán `PUBLISHED`. Chọn chi nhánh gần nhất trong bán kính đường chim bay và trả một kết quả cho mỗi `restaurant_id`. Cờ `is_primary` dùng cho địa chỉ mặc định của hồ sơ quán. Với mô hình hiện tại, menu và giá được lưu theo quán nên các chi nhánh của cùng quán dùng chung menu.
5. Món phải ở trạng thái `ACTIVE`, khớp tên đã chuẩn hóa, có giá hiện hành và thỏa `PRICE_ASSERTION.min_price <= max_price` của request. Điều kiện tên và giá áp dụng trên cùng một món. Khi triển khai MySQL, dùng `MENU_ITEM.name_normalized` như trong ERD.
6. Có kết quả catalog thì trả ngay. Với ngưỡng minh họa 5 quán, từ 5 quán là đủ và 1–4 quán vẫn được trả ngay. Cả hai trường hợp bỏ qua tra cứu địa điểm bên ngoài.
7. Khi catalog trả 0 quán, Search Service tìm trong `RESTAURANT_DISCOVERY` theo từ khóa đã chuẩn hóa và lọc tọa độ chi nhánh theo tâm, bán kính của lượt tìm (ví dụ GPS và 3 km). Có gợi ý hợp lệ đã lưu thì trả trực tiếp từ MySQL. Quán bị từ chối, tạm ngưng hoặc đã đóng cửa bị loại.
8. Chỉ khi cả hai truy vấn nội bộ rỗng (có thể biểu diễn bằng `null` trong lớp nghiệp vụ), Search Service gọi Geo Service. Geo Service dùng Goong Autocomplete V2 với từ khóa như “quán bún bò”, tọa độ tâm và bán kính, rồi gọi Place Detail V2 bằng `place_id` để lấy tên, địa chỉ và tọa độ. Kiểm tra lại bán kính đường chim bay bằng tọa độ trả về. [Autocomplete V2](https://help.goong.io/kb/rest-api-v2/autocomplete-rest-api-v2/autocomplete-v2/) · [Place Detail V2](https://help.goong.io/kb/rest-api-v2/place-detail-rest-api-v2/place-detail-place-detail-v2/)
9. Với mỗi địa điểm hợp lệ, Catalog lưu quán mới ở trạng thái `PENDING` cùng `restaurant_id`, chi nhánh và liên kết từ khóa trong một giao dịch. Nếu đã có cặp `(provider, provider_place_id)` thì dùng lại `location_id` và `restaurant_id` hiện có. Từ khóa chỉ phục vụ tìm lại địa điểm. Món, giá và trạng thái xác minh được cập nhật qua luồng kiểm duyệt catalog.
10. Phản hồi có hai danh sách `results` và `suggestions`. Kết quả catalog có giá và trạng thái xác minh theo DB. Gợi ý địa điểm có nguồn Goong và nhãn “Chưa xác nhận món và giá”. Khử trùng theo `restaurant_id` và chọn chi nhánh gần nhất trong mỗi danh sách. Nếu tra cứu Goong lỗi hoặc trống, trả hai danh sách rỗng. Lỗi truy vấn MySQL trả lỗi cho client. Distance Matrix và Directions phục vụ tính đường riêng.

Bản preview lọc catalog và gợi ý bằng Haversine, rồi dùng proxy Goong khi kho demo rỗng. Quán, chi nhánh và liên kết từ khóa được lưu trong `localStorage` của trình duyệt. Backend MySQL sẽ chia sẻ dữ liệu giữa người dùng. Khi chọn nguồn ngoài, phạm vi lưu và thời hạn tái sử dụng cần phù hợp với điều khoản gói API.
