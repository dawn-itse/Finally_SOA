# Context & Weather Service

Thành viên 1 phụ trách. Cổng mặc định `4001` khi chạy độc lập.

Service lấy thời tiết hiện tại từ Meteosource và gợi ý món theo thời tiết, giờ Việt Nam. Khóa `METEOSOURCE_API_KEY` được đọc từ `backend/.env`.

Chạy riêng từ thư mục gốc dự án:

```powershell
node backend/services/context-weather-service/src/index.js
```

Gọi `GET /api/v1/context/morning-greeting?q=21.0278,105.8342`. Phản hồi thành công có nguồn `meteosource`, nhiệt độ theo °C, điều kiện thời tiết, thời điểm lấy dữ liệu và gợi ý món. Kết quả được lưu trong bộ nhớ 10 phút theo tọa độ làm tròn đến 3 chữ số thập phân để giảm số lần gọi API.

Lệnh `node backend/server.js` cũng phục vụ endpoint này cùng origin với frontend. Ứng dụng lấy thời tiết theo mốc mặc định khi mở trang và cập nhật khi đổi khu vực hoặc dùng GPS. Khi API không khả dụng, giao diện gắn nhãn **Dữ liệu mẫu**.

Xem [bảng phân công](../../../docs/TEAM_ASSIGNMENT.md) và [kiến trúc SOA](../../../docs/SOA_ARCHITECTURE.md).
