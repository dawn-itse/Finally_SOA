# Auth Service

Thành viên 1 phụ trách. Cổng mặc định khi chạy riêng là `4007`.

Auth Service dùng Express và lưu tài khoản, phiên trong MySQL ở hai bảng `app_user` và `auth_session`. Mật khẩu được hash bằng scrypt có salt, token phiên được băm trước khi lưu và phiên hết hạn sau 8 giờ. Trình duyệt nhận cookie HttpOnly riêng cho trang người dùng và trang Admin. [Cài thư viện và khởi tạo MySQL](../../../README.md#chạy-dự-án)

### Chạy và test trên giao diện

Chạy `node backend/server.js`. Mở trang được in trong terminal, chọn **Cá nhân hóa → Đăng ký**. Nhập tên, email và mật khẩu ít nhất 8 ký tự. Sau khi đăng ký, thử tải lại trang, đăng xuất và đăng nhập lại để kiểm tra phiên.

Để tạo Admin, điền `AUTH_ADMIN_EMAIL`, `AUTH_ADMIN_PASSWORD` và tùy chọn `AUTH_ADMIN_NAME` trong `backend/.env`, rồi chạy:

```powershell
npm --prefix backend run auth:create-admin
```

Sau khi tạo, có thể xóa mật khẩu khởi tạo khỏi `.env`. Đăng nhập ở `/admin.html` bằng tài khoản vừa tạo.

### Test bằng Postman

Chạy `npm --prefix backend run auth` để test riêng ở `http://127.0.0.1:4007`. Giữ nguyên hostname giữa các request để Postman gửi lại cookie. Dùng **Body → raw → JSON** với các request POST.

| Request | Body | Kết quả |
|---|---|---|
| `POST /api/v1/auth/register` | `{"email":"test@example.com","display_name":"Tài khoản thử","password":"MatKhauThu123"}` | `201`, tạo User và cấp phiên |
| `POST /api/v1/auth/session` | `{"email":"test@example.com","password":"MatKhauThu123"}` | `200`, đăng nhập |
| `GET /api/v1/auth/session` | | `200` khi có phiên hợp lệ. Dùng endpoint này để xác thực phiên từ Gateway |
| `DELETE /api/v1/auth/session` | | `200`, hủy phiên hiện tại |

Thêm `?portal=admin` vào endpoint `/session` để dùng phiên quản trị. Có thể kiểm tra email trùng (`409`), mật khẩu sai hoặc phiên hết hiệu lực (`401`), và tài khoản khóa hoặc vai trò sai (`403`).

Khi phục vụ qua HTTPS, đặt `AUTH_COOKIE_SECURE=1`. Catalog, đóng góp và cá nhân hóa của bản preview dùng dữ liệu demo trong trình duyệt. Phân quyền trên các API nghiệp vụ thuộc giai đoạn tích hợp SOA. [Bảng phân công](../../../docs/TEAM_ASSIGNMENT.md) · [Kiến trúc SOA](../../../docs/SOA_ARCHITECTURE.md)
