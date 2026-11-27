# Context & Weather Service

Thành viên 1 phụ trách. Cổng mặc định `4001` khi chạy độc lập.

Service dùng Express, lấy thời tiết hiện tại từ Meteosource và gợi ý món theo thời tiết, giờ Việt Nam. Khóa `METEOSOURCE_API_KEY` được đọc từ `backend/.env`. [Cài thư viện và khởi tạo MySQL](../../../README.md#chạy-dự-án)

Chạy riêng từ thư mục gốc dự án:

```powershell
npm --prefix backend run weather
```

Gọi `GET http://127.0.0.1:4001/api/v1/context/morning-greeting?q=21.0278,105.8342`. Phản hồi thành công có nguồn `meteosource`, nhiệt độ theo °C, điều kiện thời tiết, thời điểm lấy dữ liệu và gợi ý món. Bảng MySQL `weather_cache` giữ kết quả 10 phút theo tọa độ làm tròn đến 3 chữ số thập phân. Server preview và service chạy riêng dùng chung cache.

Lệnh `node backend/server.js` cũng phục vụ endpoint này cùng origin với frontend. Ứng dụng lấy thời tiết theo mốc mặc định khi mở trang và cập nhật khi đổi khu vực hoặc dùng GPS. Khi API không khả dụng, giao diện gắn nhãn **Dữ liệu mẫu**.

Xem [bảng phân công](../../../docs/TEAM_ASSIGNMENT.md) và [kiến trúc SOA](../../../docs/SOA_ARCHITECTURE.md).
