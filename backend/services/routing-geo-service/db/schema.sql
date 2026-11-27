-- Routing & Geo Service (cổng 4004): bảng service sở hữu theo docs/ERD.md (SEARCH_AREA).
-- Yêu cầu MySQL 8.0.16+ (thực thi CHECK), InnoDB, utf8mb4.
--   mysql -u root -p < db/schema.sql
-- Đặt GEO_MYSQL_DATABASE=mua_gi_day_geo trong backend/.env để service dùng MySQL (không đặt thì dùng kho in-memory).
-- RESTAURANT_LOCATION vẫn thuộc restaurant-search-service, nên không có khóa ngoại sang catalog.

CREATE DATABASE IF NOT EXISTS mua_gi_day_geo
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;
USE mua_gi_day_geo;

CREATE TABLE IF NOT EXISTS search_area (
  area_id          CHAR(36)      NOT NULL,
  name             VARCHAR(100)  NOT NULL,
  short_label      VARCHAR(40)   NOT NULL,
  anchor_address   VARCHAR(500)  NOT NULL,
  anchor_latitude  DECIMAL(10,7) NOT NULL,
  anchor_longitude DECIMAL(10,7) NOT NULL,
  anchor_place_id  VARCHAR(512)  NULL,
  display_order    INT           NOT NULL DEFAULT 0,
  is_active        TINYINT(1)    NOT NULL DEFAULT 1,
  PRIMARY KEY (area_id),
  UNIQUE KEY search_area_name_uq (name),
  KEY search_area_active_order_ix (is_active, display_order),
  CONSTRAINT search_area_lat_ck CHECK (anchor_latitude BETWEEN -90 AND 90),
  CONSTRAINT search_area_lng_ck CHECK (anchor_longitude BETWEEN -180 AND 180),
  CONSTRAINT search_area_order_ck CHECK (display_order BETWEEN 0 AND 10000),
  CONSTRAINT search_area_active_ck CHECK (is_active IN (0, 1))
);
-- "Luôn có ít nhất một khu vực is_active = 1" do service kiểm tra trong giao dịch (CHECK không biểu diễn được).
