# Bảng Phân Công Nhiệm Vụ Đồ Án SOA (Nhóm 3 Thành Viên)

Dự án: **Mua Gì Đây – Hệ thống gợi ý món ăn sáng theo ngân sách, vị trí & feedback (Kiến trúc hướng dịch vụ - SOA)**

---

## 🎯 Nguyên Tắc Chia Việc Cho 3 Người
1. **Không đụng hàng khi code (Zero Git Conflict):** Mỗi thành viên phụ trách các thư mục Service (`services/...`) và module Frontend riêng biệt.
2. **Ai cũng có phần SOA Backend + Frontend khi vấn đáp:** Khi giảng viên hỏi bất kỳ ai trong nhóm, mỗi người đều nắm rõ ít nhất **2 Microservices/SOA Services** + **1 luồng giao diện chính**.
3. **Khối lượng công việc cân bằng (33% - 33% - 34%).**

---

## 👥 Bảng Phân Công Tổng Quan

| Thành Viên | Vai Trò Chính | SOA Services Phụ Trách (Backend) | Phần Giao Diện Phụ Trách (Frontend) |
| :--- | :--- | :--- | :--- |
| **Thành viên 1 (Nhóm trưởng / System Architect)** | Điều phối API Gateway, Xử lý Ngôn ngữ Tự nhiên (NLP) & Ngữ cảnh Thời tiết | 1. `api-gateway/` (Port 4000)<br>2. `context-weather-service/` (Port 4001)<br>3. `nlp-conversation-service/` (Port 4002) | - Màn hình chào & Thời tiết (Hình 1)<br>- Luồng Chat hội thoại & Hỏi lại ngân sách (Hình 2, 4)<br>- Lớp kết nối `apiClient.js` & `nlpParser.js` |
| **Thành viên 2 (Core Search & Geo Engineer)** | Tìm kiếm Thực đơn theo Ngân sách, Tính tiền dư & Bản đồ Lộ trình | 1. `restaurant-search-service/` (Port 4003)<br>2. `routing-geo-service/` (Port 4004)<br>3. `shared/` (Schemas & Seed Data) | - Hiệu ứng Radar quét vị trí (Hình 3, 5)<br>- Bộ lọc Sắp xếp (`Đề xuất`, `Gần → xa`, `Giá`)<br>- Chế độ xem `Bản đồ`, Mini-Map & Chỉ đường (Hình 7, 8) |
| **Thành viên 3 (Feedback, Verification & Personalization Engineer)** | Hệ thống Đánh giá (Feedback), Xác minh Giá & Cá nhân hóa | 1. `feedback-review-service/` (Port 4005)<br>2. `user-preference-service/` (Port 4006) | - Thẻ Quán ăn chi tiết & Câu trích dẫn Review (Hình 6)<br>- Modal Thực đơn, Gửi Feedback & Xác minh giá<br>- Modal `Cá nhân hóa` & Lưu quán yêu thích (`♡`) |

---

## 📋 Chi Tiết Công Việc Từng Thành Viên

### 👤 Thành Viên 1: API Gateway, Ngữ Cảnh Thời Tiết & Hội Thoại NLP
- **Thư mục làm việc chính:**
  - `api-gateway/`
  - `services/context-weather-service/`
  - `services/nlp-conversation-service/`
  - `frontend/js/services/nlpParser.js` & `frontend/js/services/apiClient.js`
- **Nhiệm vụ Backend (SOA):**
  1. Xây dựng **API Gateway (`Port 4000`)** nhận request từ Frontend và điều phối gọi sang các Service con.
  2. Xây dựng **Context & Weather Service (`Port 4001`)**: Dựa vào giờ hệ thống và thời tiết (tích hợp OpenWeatherMap API hoặc Mock Weather) để trả về nhiệt độ (`28° · trời quang`) và câu gợi ý món ăn sáng phù hợp.
  3. Xây dựng **NLP Conversation Service (`Port 4002`)**: Phân tích câu nhập tự nhiên của người dùng (`"30k cà phê sữa"`, `"phở bò"`, `"rẻ hơn"`, `"gần hơn"`, `"đi 2 người"`). Nếu thiếu mức giá thì trả về trạng thái `ASK_BUDGET` để bot hỏi lại.
- **Nhiệm vụ khi báo cáo / thuyết trình:**
  - Trình bày tổng quan kiến trúc SOA, sơ đồ luồng gọi qua API Gateway và demo luồng Chat thông minh (Hình 1 $\rightarrow$ Hình 4).

---

### 👤 Thành Viên 2: Tìm Kiếm Quán Theo Giá & Định Vị Bản Đồ (Geo-Routing)
- **Thư mục làm việc chính:**
  - `services/restaurant-search-service/`
  - `services/routing-geo-service/`
  - `shared/` & `frontend/js/data/mockDatabase.js`
- **Nhiệm vụ Backend (SOA):**
  1. Xây dựng **Restaurant Search Service (`Port 4003`)**:
     - Lọc quán theo từ khóa món ăn (`"phở bò"`, `"bún riêu"`, `"bánh mì"`).
     - Lọc các món trong menu có `price <= budget`, tính toán số tiền tiết kiệm được (`dư 5k`) và chi phí ước tính khi đi nhiều người (`đi 2 người`).
     - Hỗ trợ 4 tiêu chí sắp xếp: `recommended`, `distance`, `rating`, `price`.
  2. Xây dựng **Routing & Geo Service (`Port 4004`)**:
     - Tính khoảng cách Haversine / lộ trình từ vị trí người dùng (`68 Lê Văn Lương`) tới các quán ăn trong bán kính `1km / 2km / 5km`.
     - Tính thời gian di chuyển bằng xe máy (`9 phút đi xe · 1,4km`) và tạo nhãn so sánh khoảng cách (`Gần hơn 340m`).
- **Nhiệm vụ khi báo cáo / thuyết trình:**
  - Giải thích thuật toán lọc món theo ngân sách, công thức tính khoảng cách địa lý và demo hiệu ứng Radar + Bản đồ lộ trình (Hình 5, 7, 8).

---

### 👤 Thành Viên 3: Đánh Giá (Feedback), Xác Minh Giá & Cá Nhân Hóa
- **Thư mục làm việc chính:**
  - `services/feedback-review-service/`
  - `services/user-preference-service/`
  - `frontend/js/components/renderers.js` (Phần Modal Feedback, Yêu thích & Cá nhân hóa)
- **Nhiệm vụ Backend (SOA):**
  1. Xây dựng **Feedback & Review Service (`Port 4005`)**:
     - Quản lý danh sách đánh giá (số sao, nội dung bình luận, thời gian đánh giá).
     - Tự động chọn **Featured Review Quote** (câu trích dẫn nổi bật nhất hiển thị ngoài thẻ quán).
     - Xử lý nghiệp vụ **Xác minh giá (`✓ Đã xác minh` vs `Đang ước giá...`)**: Khi người dùng gửi feedback xác nhận giá thực tế tại quán, tự động cập nhật điểm sao trung bình và chuyển trạng thái quán sang `Đã xác minh`.
  2. Xây dựng **User Preference Service (`Port 4006`)**:
     - Lưu danh sách quán yêu thích (`♡`), vị trí mặc định và cấu hình cá nhân hóa khẩu vị của người dùng.
- **Nhiệm vụ khi báo cáo / thuyết trình:**
  - Trình bày cơ chế Crowd-sourced Price Verification (xác thực giá từ cộng đồng), tổng hợp Feedback và demo tính năng thêm đánh giá mới + lưu quán yêu thích (Hình 6 & Modal).
