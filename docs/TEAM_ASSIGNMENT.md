# Bảng Phân Công Nhiệm Vụ Đồ Án SOA (Nhóm 3 Thành Viên)

Dự án: **Mua Gì Đây – Hệ thống gợi ý món ăn sáng theo ngân sách, vị trí & feedback (Kiến trúc hướng dịch vụ - SOA)**

Bản demo dùng catalog mẫu và localStorage. Phần triển khai backend của từng thành viên theo [kiến trúc SOA](SOA_ARCHITECTURE.md) và [ERD MySQL](ERD.md).

---

## 🎯 Nguyên Tắc Chia Việc Cho 3 Người

1. **Không đụng hàng khi code (Zero Git Conflict):** Mỗi thành viên phụ trách các thư mục Service (`backend/services/...`) và module Frontend riêng biệt.
2. **Ai cũng có phần SOA Backend + Frontend khi vấn đáp:** Khi giảng viên hỏi bất kỳ ai trong nhóm, mỗi người đều nắm rõ ít nhất **2 Microservices/SOA Services** + **1 luồng giao diện chính**.
3. **Khối lượng công việc cân bằng (33% - 33% - 34%).**

---

## 👥 Bảng Phân Công Tổng Quan

| Thành Viên | Vai Trò Chính | SOA Services Phụ Trách (Backend) | Bảng ERD Sở Hữu (MySQL) | Phần Giao Diện Phụ Trách (Frontend) |
| :--- | :--- | :--- | :--- | :--- |
| **Thành viên 1 (Nhóm trưởng / System Architect)** | Gateway, Auth, ngữ cảnh thời tiết & NLP | `backend/api-gateway/` (`4000`), `context-weather-service/` (`4001`), `nlp-conversation-service/` (`4002`), `auth-service/` (`4007`) | `APP_USER` *(các service 4000–4002 stateless/cache)* | Màn hình chào, đăng nhập/tài khoản, ô tên món, điều khiển khu vực/ngân sách/bán kính và kết nối API. |
| **Thành viên 2 (Core Search & Geo Engineer)** | Catalog, tra cứu Goong khi DB rỗng và lưu địa điểm để tái sử dụng | `restaurant-search-service/` (`4003`), `routing-geo-service/` (`4004`) | `RESTAURANT`, `RESTAURANT_LOCATION`, `RESTAURANT_DISCOVERY`, `CUISINE`, `RESTAURANT_CUISINE`, `MENU_ITEM`, `PRICE_ASSERTION`, `SEARCH_AREA` | Kết quả catalog, gợi ý địa điểm, sắp xếp, chỉ đường và trang Admin quản lý khu vực/catalog. |
| **Thành viên 3 (Feedback, Moderation & Personalization Engineer)** | Đánh giá, đóng góp, kiểm duyệt & cá nhân hóa | `feedback-review-service/` (`4005`), `user-preference-service/` (`4006`) | `REVIEW`, `PRICE_REPORT`, `CONTRIBUTION`, `AUDIT_EVENT`, `USER_PREFERENCE`, `DIETARY_RESTRICTION`, `USER_RESTRICTION`, `DISH_CATEGORY`, `USER_FAVORITE_DISH`, `FAVORITE_RESTAURANT` | Form báo giá và góp ý, hàng đợi Admin, thực đơn và các mục cá nhân hóa. |

---

## 📋 Chi Tiết Công Việc Từng Thành Viên

### 👤 Thành Viên 1: API Gateway, Auth, Ngữ Cảnh Thời Tiết & Hội Thoại NLP

- **Thư mục làm việc chính:**
  - `backend/api-gateway/`
  - `backend/services/context-weather-service/`
  - `backend/services/nlp-conversation-service/`
  - `backend/services/auth-service/`
  - `frontend/js/demo/nlpParser.js` & `frontend/js/demo/apiClient.js`
- **Nhiệm vụ Backend (SOA):**
  1. Xây dựng **API Gateway (`Port 4000`)**: nhận request từ Frontend, thực hiện Auth Guard (kiểm tra phiên/JWT, chặn request chưa đăng nhập tới các endpoint cần `APP_USER`), chuyển tiếp danh tính (`submitted_by` / `role`) và điều phối gọi sang các Service con.
  2. Xây dựng **Auth Service (`Port 4007`)** — sở hữu `APP_USER`:
     - Quản lý đăng ký (`POST /api/v1/auth/register`), đăng nhập, kiểm tra và hủy phiên (`POST/GET/DELETE /api/v1/auth/session`), hash mật khẩu, vai trò (`USER`/`ADMIN`) và trạng thái `account_status` (`ACTIVE`/khóa).
     - Cung cấp endpoint kiểm tra/xác thực danh tính cho Gateway.
  3. Xây dựng **Context & Weather Service (`Port 4001`)**: lấy thời tiết theo tọa độ qua Meteosource và gợi ý món theo điều kiện thời tiết và thời gian. Bản preview gắn nhãn dữ liệu mẫu khi service không phản hồi.
  4. Xây dựng **NLP Conversation Service (`Port 4002`)**: chuẩn hóa từ khóa tên món và xử lý gợi ý có sẵn. Kết nối ô tên món với các bộ lọc riêng cho ngân sách, bán kính và khu vực; Gateway chuyển các điều kiện đã chọn đến `restaurant-search-service` (`4003`) theo hợp đồng API.
- **Nhiệm vụ khi báo cáo / thuyết trình:**
  - Trình bày kiến trúc SOA tổng thể dùng MySQL và chỉ rõ phần đang chạy trên preview. Demo luồng đăng nhập/phân quyền, nhập tên món, chọn bộ lọc và đổi điểm tìm.

---

### 👤 Thành Viên 2: Tìm Kiếm Quán Theo Giá & Định Vị Bản Đồ (Geo-Routing)

- **Thư mục làm việc chính:**
  - `backend/services/restaurant-search-service/`
  - `backend/services/routing-geo-service/`
  - `frontend/js/demo/mockDatabase.js`, `frontend/js/api/geo.js`, `frontend/js/components/addressLookup.js` & `frontend/js/admin.js` (phần quản lý khu vực & catalog)
- **Nhiệm vụ Backend (SOA):**
  1. Xây dựng **Restaurant Search Service (`Port 4003`)** — sở hữu `RESTAURANT`, `RESTAURANT_LOCATION`, `RESTAURANT_DISCOVERY`, `CUISINE`, `RESTAURANT_CUISINE`, `MENU_ITEM`, `PRICE_ASSERTION`:
     - Quản lý catalog và chuẩn hóa `MENU_ITEM.name_normalized` khi tạo hoặc đổi tên món.
     - Lọc theo tên và giá hiện hành (`PRICE_ASSERTION.is_current = 1`) của cùng một món. Hiển thị mức giá từ và khoản dư tối đa nếu giá có khoảng.
     - Xét mọi chi nhánh của quán `PUBLISHED` trong bán kính rồi chọn chi nhánh gần nhất cho mỗi quán. Cờ `is_primary` dùng làm địa chỉ mặc định của hồ sơ quán.
     - Dùng `ST_Distance_Sphere` để kiểm tra bán kính theo mét khi chuyển sang MySQL. Rà khung lọc sơ bộ để tránh loại quán nằm sát rìa bán kính.
     - Hỗ trợ 4 tiêu chí sắp xếp: `recommended`, `distance`, `rating`, `price`.
     - Trả ngay kết quả catalog khi có ít nhất một quán. Khi catalog rỗng, đọc gợi ý đã lưu theo từ khóa và bán kính trước khi gọi Geo Service.
     - Lưu địa điểm mới dưới trạng thái `PENDING`. Dùng `(provider, provider_place_id)` để tái sử dụng `restaurant_id` đã có và lưu từ khóa trong `RESTAURANT_DISCOVERY`. Hiển thị gợi ý với nhãn “Chưa xác nhận món và giá”.
     - Cung cấp API nội bộ để `feedback-review-service` (`4005`) gọi cập nhật `RESTAURANT`, `MENU_ITEM`, `PRICE_ASSERTION` và làm mới `RESTAURANT.verified_at`/`verified_by` khi Admin duyệt.
  2. Xây dựng **Routing & Geo Service (`Port 4004`)** — sở hữu `SEARCH_AREA`:
     - Quản lý bảng `SEARCH_AREA` và luồng cho Admin thêm, sửa, ẩn điểm mốc (luôn giữ ít nhất 1 khu vực `is_active = 1`). Tìm quanh mốc hoặc tọa độ thiết bị.
     - Chuẩn hóa địa chỉ quán qua Goong V2 Autocomplete và Place Detail. Dùng Reverse Geocode để hiển thị tên từ tọa độ thiết bị.
     - Cung cấp tra cứu địa điểm theo từ khóa, tọa độ tâm và bán kính khi Search Service yêu cầu. Trả thông tin chi nhánh cho Search Service lưu vào MySQL.
     - Dùng Distance Matrix sau bước lọc catalog và gọi Directions khi mở “Chỉ đường”. Server giữ khóa Goong.
     - Sau khi Search Service chọn chi nhánh, lấy quãng đường xe máy và thời gian đi từ Goong. Trên thẻ quán, ghi rõ khoảng cách tính từ mốc hay vị trí thiết bị và dùng số đo đường chim bay hay theo tuyến.
- **Nhiệm vụ khi báo cáo / thuyết trình:**
  - Giải thích ca chi nhánh chính ngoài bán kính nhưng chi nhánh khác đủ gần, và demo tìm quán theo mốc hoặc GPS.
  - Demo lượt đầu tìm “bún bò” với GPS và bán kính 3 km khi DB rỗng, sau đó tìm lại để lấy gợi ý đã lưu mà không gọi lại API tìm địa điểm.
  - Giải thích cách nối Goong với Admin khi thêm/sửa địa chỉ quán và cách dùng tọa độ thủ công đã xác nhận khi cần.

---

### 👤 Thành Viên 3: Đánh Giá (Feedback), Báo Giá, Kiểm Duyệt & Cá Nhân Hóa

- **Thư mục làm việc chính:**
  - `backend/services/feedback-review-service/`
  - `backend/services/user-preference-service/`
  - `frontend/js/components/renderers.js` (Phần Modal Feedback, Hàng đợi Admin, Yêu thích & Cá nhân hóa)
- **Nhiệm vụ Backend (SOA):**
  1. Xây dựng **Feedback & Review Service (`Port 4005`)** — sở hữu `REVIEW`, `PRICE_REPORT`, `CONTRIBUTION`, `AUDIT_EVENT`:
     - Quản lý danh sách đánh giá `REVIEW` (số sao, nội dung bình luận, thời gian đánh giá) và tự động chọn **Featured Review Quote** hiển thị ngoài thẻ quán.
     - Tiếp nhận `PRICE_REPORT` và `CONTRIBUTION` ở trạng thái `PENDING` từ tài khoản `ACTIVE`. Lấy `submitted_by` từ danh tính đã xác thực (không nhận từ body) và lưu nội dung đóng góp trong `payload` kiểu JSON có `schema_version`.
     - Xử lý duyệt, gỡ giá hoặc từ chối trên trang Admin. Khi duyệt, gọi API sang `restaurant-search-service` (`4003`) để tạo/cập nhật `RESTAURANT`, `MENU_ITEM`, `PRICE_ASSERTION` (bảo đảm tối đa 1 giá `is_current = 1` mỗi món và làm mới `verified_at`/`verified_by`).
     - Ghi `AUDIT_EVENT` (tác nhân, thời điểm, `before_data`/`after_data`) cho mọi quyết định kiểm duyệt.
  2. Xây dựng **User Preference Service (`Port 4006`)** — sở hữu `USER_PREFERENCE`, `DIETARY_RESTRICTION`, `USER_RESTRICTION`, `DISH_CATEGORY`, `USER_FAVORITE_DISH`, `FAVORITE_RESTAURANT`:
     - Lưu hồ sơ sở thích ăn uống (`USER_PREFERENCE`, `USER_RESTRICTION`, `USER_FAVORITE_DISH`) và quán yêu thích (`FAVORITE_RESTAURANT`) cho tài khoản đã đăng nhập.
     - Hỗ trợ đồng bộ sở thích cục bộ từ trình duyệt vào tài khoản khi Guest đăng nhập qua `auth-service` (`4007`).
- **Nhiệm vụ khi báo cáo / thuyết trình:**
  - Demo hai báo cáo cùng một món. Khi Admin duyệt 49k rồi 48k, giá hiện hành là 48k, mức 49k còn trong lịch sử. Demo thêm một đánh giá và lưu quán yêu thích.
