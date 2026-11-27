# NLP Conversation Service

Thành viên 1 phụ trách. Cổng mặc định `4002` khi chạy độc lập.

Service chuẩn hóa tên món tiếng Việt bằng quy tắc, hỗ trợ truy vấn có dấu hoặc không dấu và tách tên món khỏi gợi ý thời tiết. Ngân sách, bán kính và khu vực được lấy từ bộ lọc trên giao diện.

Chạy từ thư mục gốc:

```powershell
node backend/services/nlp-conversation-service/src/index.js
```

Trong Postman, gửi `POST http://localhost:4002/api/v1/nlp/parse` với **Body → raw → JSON**.

```json
{"text":"  Bún   bò  "}
```

Phản hồi `200 OK`:

```json
{"success":true,"data":{"dish":"Bún bò","normalizedDish":"bun bo"}}
```

Với gợi ý thời tiết, gửi `{"text":"50k phở bò","source":"suggestion"}` để lấy tên món và giữ ngân sách đang chọn. Khi nhập trực tiếp, `source` mặc định là `input` và nội dung như `50k phở bò` trả về `422`. JSON sai hoặc thiếu trường `text` trả về `400`.

Server preview trên cổng `3000` phục vụ cùng endpoint. Frontend dùng bộ quy tắc chung khi endpoint không khả dụng.

Xem [bảng phân công](../../../docs/TEAM_ASSIGNMENT.md) và [kiến trúc SOA](../../../docs/SOA_ARCHITECTURE.md).
