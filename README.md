# Mua Gì Đây - Hệ Thống Gợi Ý Món Ăn Sáng Theo Ngân Sách, Vị Trí & Feedback (SOA Architecture)

Dự án xây dựng ứng dụng **Mua Gì Đây** — gợi ý món ăn theo ngữ cảnh thời tiết/thời gian, tìm kiếm hội thoại tự nhiên (món ăn + giá tiền mong muốn), định vị quán xung quanh theo bán kính kèm lộ trình di chuyển và tổng hợp đánh giá (feedback) thực tế.

---

## Cấu trúc dự án

```text
Finally_SOA/
├── frontend/                      # Mã chạy trong trình duyệt
│   ├── index.html                 # Trang người dùng
│   ├── admin.html                 # Trang quản trị
│   ├── css/                       # Giao diện và bố cục
│   └── js/
│       ├── app.js                 # Điểm vào trang người dùng
│       ├── admin.js               # Điểm vào trang quản trị
│       ├── api/geo.js             # Client gọi /api/geo/*
│       ├── components/            # Hiển thị và tương tác, gồm ô gợi ý địa chỉ
│       └── demo/                  # Nghiệp vụ mô phỏng, NLP và dữ liệu mẫu
├── backend/                       # Mã chạy trên Node.js
│   ├── server.js                  # Phục vụ frontend và chuyển tiếp yêu cầu vị trí
│   ├── routes/geo.js              # Lớp tương thích cho Routing & Geo Service
│   ├── .env.example               # Mẫu cấu hình riêng của backend
│   ├── api-gateway/               # Khung API Gateway
│   └── services/                  # Khung 7 service theo bảng phân công
├── shared/                        # Quy tắc chuẩn hóa tên món dùng chung
└── docs/                          # Kiến trúc SOA, ERD, use case và phân công
```

Frontend gọi API vị trí qua cùng địa chỉ với trang đang mở. Bản demo lưu tài khoản, dữ liệu quán và kết quả kiểm duyệt trong `localStorage`. Mỗi thư mục API Gateway và service có sẵn `src/` và README ghi người phụ trách, cổng dự kiến và nhiệm vụ. Xem [bảng phân công](docs/TEAM_ASSIGNMENT.md) và [thiết kế SOA và MySQL](docs/SOA_ARCHITECTURE.md).

## Chạy dự án

Dùng Node.js 22 trở lên. Từ thư mục gốc dự án, chạy:

```powershell
npm install --prefix backend/services/routing-geo-service
npm install --prefix backend/services/restaurant-search-service
node backend/server.js
```

- Trang người dùng: http://localhost:3000/
- Trang quản trị: http://localhost:3000/admin.html

Nếu cổng 3000 đang được dùng, mở địa chỉ được in trong terminal.

Để bật gợi ý địa chỉ và chỉ đường qua Goong, tạo file cấu hình bằng PowerShell:

```powershell
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

Điền Goong REST API key vào `GOONG_API_KEY` trong `backend/.env`, rồi khởi động lại server.

Nút **Chỉ đường** mở bản đồ (MapLibre GL, nạp từ CDN khi bấm lần đầu) và vẽ tuyến đường (ô tô) từ `polyline` của Goong Directions. Muốn dùng nền bản đồ Goong, điền thêm **Map Key** (khóa công khai, khác API Key) vào `GOONG_MAPTILES_KEY`; bỏ trống thì dùng nền OpenStreetMap. Cần Internet để tải thư viện và ô bản đồ.

Để dùng thời tiết trực tiếp, điền `METEOSOURCE_API_KEY` trong cùng file cấu hình. Server preview phục vụ sẵn endpoint thời tiết. [Tài liệu Context & Weather Service](backend/services/context-weather-service/README.md)

Ô tìm món gọi NLP Service qua server preview. [Hướng dẫn chạy riêng và test NLP bằng Postman](backend/services/nlp-conversation-service/README.md)

### Dùng phần A7

1. Trong “Thêm quán” hoặc “Đóng góp / Sửa quán”, nhập địa chỉ và chọn một gợi ý Goong. App tải tọa độ và địa chỉ chuẩn. Gửi đề xuất để Admin kiểm tra.
2. Ở trang Admin, có thể dùng địa chỉ Goong người gửi đã chọn, chọn địa chỉ khác hoặc nhập đủ vĩ độ và kinh độ thủ công. Một địa chỉ gõ tay có thể được gửi để chờ duyệt. Admin cần xác nhận tọa độ trước khi công khai.
3. “Vị trí hiện tại” lấy tọa độ từ trình duyệt. Goong hỗ trợ lấy tên địa chỉ. Kết quả tìm quán có thể hiện số đo theo đường đi xe máy từ Goong. Nút “Chỉ đường” mở các bước đi và liên kết bản đồ ngoài.

Khi để trống key, phần tìm quán mock vẫn dùng được. Địa chỉ gõ tay cần tọa độ hợp lệ khi duyệt, còn thông tin di chuyển hiển thị dưới dạng ước tính. Xem [tài liệu tích hợp](docs/SOA_ARCHITECTURE.md#3-tích-hợp-vị-trí-và-lộ-trình-a7) và [tài liệu Goong](https://help.goong.io/kb/rest-api-v2/).

### Tìm quanh mốc (B1–B5)

1. Chọn **Lê Văn Lương**, ngân sách **50k** và bán kính **2 km**. Nhập **phở bò** hoặc **pho bo**, rồi bấm **Tìm quán**.
2. Đổi bán kính hoặc ngân sách để cập nhật kết quả. Bán kính tính theo đường chim bay. Các quán có tuyến Goong sẽ hiện thêm quãng đường theo đường đi. Mỗi thẻ ghi điểm xuất phát.
3. Bấm **Vị trí hiện tại** để dùng tọa độ thiết bị. Nếu trình duyệt không cấp quyền, ứng dụng quay về điểm mốc đang chọn. Bán kính và tọa độ thiết bị chỉ dùng trong trạng thái trang.
4. Mở `/admin.html`, đăng nhập bằng tài khoản demo và vào **Khu vực tìm kiếm**. Thêm hoặc sửa khu vực bằng cách chọn một địa chỉ Goong, hoặc nhập địa chỉ cùng vĩ độ và kinh độ. Khu vực đang hoạt động sẽ xuất hiện ở menu tìm kiếm.

Dữ liệu preview gồm ba mốc mẫu ở Hà Nội. Preview ưu tiên catalog mẫu, sau đó kiểm tra gợi ý đã lưu trong `localStorage`. Nếu cả hai đều rỗng, preview tìm thêm qua Goong khi có khóa. Các lần tìm lại trên cùng trình duyệt có thể dùng gợi ý đã lưu.

### Luồng tìm kiếm của backend MySQL

1. Khi người dùng tìm **bún bò** với GPS và bán kính **3 km**, hệ thống truy vấn catalog nội bộ theo món, giá và khoảng cách. Có từ **5 quán** là đủ theo ví dụ. Có **1–4 quán** thì vẫn trả ngay từ database.
2. Khi có **0 quán**, hệ thống kiểm tra gợi ý địa điểm đã lưu trong bán kính. Nếu cũng không có, gọi Goong để tìm địa điểm.
3. Lưu quán mới, chi nhánh và từ khóa vào MySQL. Mỗi quán có `restaurant_id` nội bộ. Cặp `(provider, provider_place_id)` dùng để nhận ra chi nhánh đã lưu. Lần sau tìm cùng từ khóa quanh khu vực đó, hệ thống đọc dữ liệu từ MySQL và bỏ qua bước tìm địa điểm Goong.

Địa điểm từ Goong hiển thị với nhãn **Chưa xác nhận món và giá**. Việc chia sẻ dữ liệu đã lưu giữa các trình duyệt và người dùng cần backend MySQL. [Thiết kế truy vấn và API](docs/SOA_ARCHITECTURE.md#4-tìm-theo-tên-món-và-điểm-mốc-b1b5)
