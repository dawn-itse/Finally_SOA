# NLP Conversation Service

Thành viên 1 phụ trách. Cổng mặc định `4002` khi chạy độc lập.

Service dùng Express để chuẩn hóa tên món tiếng Việt, hỗ trợ chữ có dấu hoặc không dấu và tách tên món khỏi gợi ý thời tiết. Bảng MySQL `nlp_dish_alias` lưu các cách viết tương đương. Ví dụ, `banh my pate` được quy về `Bánh mì pate`. Ngân sách, bán kính và khu vực lấy từ bộ lọc trên giao diện. [Cài thư viện và khởi tạo MySQL](../../../README.md#chạy-dự-án)

Chạy từ thư mục gốc:

```powershell
npm --prefix backend run nlp
```

Trong Postman, gửi `POST http://127.0.0.1:4002/api/v1/nlp/parse` với **Body → raw → JSON**.

```json
{"text":"  Bún   bò  "}
```

Phản hồi `200 OK`:

```json
{"success":true,"data":{"dish":"Bún bò","normalizedDish":"bun bo"}}
```

Với gợi ý thời tiết, gửi `{"text":"50k phở bò","source":"suggestion"}` để lấy tên món và giữ ngân sách đang chọn. Khi nhập trực tiếp, `source` mặc định là `input` và nội dung như `50k phở bò` trả về `422`. JSON sai hoặc thiếu trường `text` trả về `400`.

Server preview trên cổng `3000` phục vụ cùng endpoint. Frontend dùng quy tắc chuẩn hóa cục bộ khi endpoint không khả dụng. Bảng alias chỉ chứa từ điển món ăn.

Xem [bảng phân công](../../../docs/TEAM_ASSIGNMENT.md) và [kiến trúc SOA](../../../docs/SOA_ARCHITECTURE.md).
