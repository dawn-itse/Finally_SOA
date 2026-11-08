# Đặc Tả Kiến Trúc Dịch Vụ (SOA Architecture) - Mua Gì Đây

Tài liệu này định nghĩa các hợp đồng giao tiếp (API Contracts) giữa tầng **Frontend** và tầng **Backend SOA Services** sẽ được triển khai ở bước tiếp theo.

---

## 1. Danh sách 6 Dịch Vụ Nghiệp Vụ (SOA Services)

| STT | Tên Thư Mục Service | Port Dự Kiến | Trách Nhiệm Chính |
| :--- | :--- | :--- | :--- |
| **0** | `api-gateway/` | `4000` | Định tuyến request từ Frontend, tổng hợp dữ liệu (Aggregator/BFF). |
| **1** | `services/context-weather-service/` | `4001` | Nhận tọa độ + giờ hệ thống, trả về nhiệt độ, trạng thái thời tiết và câu gợi ý món sáng. |
| **2** | `services/nlp-conversation-service/` | `4002` | Bóc tách câu tự nhiên (`"30k cà phê"`, `"phở bò"`, `"rẻ hơn"`, `"đi 2 người"`) thành cấu trúc Slot-Filling. |
| **3** | `services/restaurant-search-service/` | `4003` | Tìm kiếm quán theo từ khóa món ăn, lọc món trong thực đơn có `price <= budget`, tính tiền dư (`dư 5k`). |
| **4** | `services/routing-geo-service/` | `4004` | Tính khoảng cách thực tế (`1,4km`), thời gian chạy xe (`9 phút`), nhãn so sánh (`Gần hơn 340m`) và tọa độ bản đồ. |
| **5** | `services/feedback-review-service/` | `4005` | Quản lý đánh giá (Rating & Comment), chọn câu trích dẫn nổi bật (Featured Quote) và xác minh giá (`Đã xác minh`). |
| **6** | `services/user-preference-service/` | `4006` | Lưu trữ quán yêu thích (`♡`), khu vực tìm kiếm mặc định và sở thích ăn uống. |
