# Restaurant Search Service

Thành viên 2 phụ trách. Cổng dự kiến `4003`.

Quản lý catalog, thực đơn và giá. Tìm chi nhánh theo món, ngân sách và bán kính.

Thiết kế MySQL ưu tiên quán phù hợp trong catalog, sau đó đến gợi ý đã lưu theo từ khóa và khoảng cách. Chỉ khi cả hai truy vấn rỗng, service gọi Routing & Geo. Service lưu quán, chi nhánh và từ khóa để tái sử dụng `restaurant_id` cho lượt tìm sau.

Thư mục `src/` dành cho phần triển khai. Xem [bảng phân công](../../../docs/TEAM_ASSIGNMENT.md) và [kiến trúc SOA](../../../docs/SOA_ARCHITECTURE.md).
