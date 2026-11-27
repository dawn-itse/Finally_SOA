-- Restaurant Search Service (cổng 4003): các bảng service sở hữu theo docs/ERD.md.
-- Yêu cầu MySQL 8.0.16+ (thực thi CHECK), InnoDB, utf8mb4.
--   mysql -u root -p < db/schema.sql
-- Không có khóa ngoại tới app_user: APP_USER thuộc auth-service (4007), verified_by chỉ lưu id tham chiếu.

CREATE DATABASE IF NOT EXISTS mua_gi_day_catalog
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;
USE mua_gi_day_catalog;

CREATE TABLE IF NOT EXISTS restaurant (
  restaurant_id     CHAR(36)      NOT NULL,
  name              VARCHAR(200)  NOT NULL,
  description       VARCHAR(500)  NULL,
  phone             VARCHAR(30)   NULL,
  visibility_status VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
  verified_at       DATETIME(3)   NULL,
  verified_by       CHAR(36)      NULL,
  source_type       VARCHAR(30)   NOT NULL,
  source_ref        VARCHAR(512)  NULL,
  created_at        DATETIME(3)   NOT NULL,
  updated_at        DATETIME(3)   NOT NULL,
  PRIMARY KEY (restaurant_id),
  CONSTRAINT restaurant_status_ck CHECK (visibility_status IN ('PENDING', 'PUBLISHED', 'REJECTED', 'SUSPENDED', 'CLOSED')),
  CONSTRAINT restaurant_verified_ck CHECK ((verified_at IS NULL) = (verified_by IS NULL)),
  KEY restaurant_status_ix (visibility_status)
);

CREATE TABLE IF NOT EXISTS restaurant_location (
  location_id             CHAR(36)      NOT NULL,
  restaurant_id           CHAR(36)      NOT NULL,
  address_text            VARCHAR(500)  NOT NULL,
  latitude                DECIMAL(10,7) NOT NULL,
  longitude               DECIMAL(10,7) NOT NULL,
  provider                VARCHAR(10)   NOT NULL,
  provider_place_id       VARCHAR(512)  NULL,
  commune                 VARCHAR(100)  NULL,
  province                VARCHAR(100)  NULL,
  deprecated_address_text VARCHAR(500)  NULL,
  geocoded_at             DATETIME(3)   NULL,
  is_primary              TINYINT(1)    NOT NULL DEFAULT 0,
  -- NULL khi không phải chi nhánh chính nên UNIQUE chỉ ràng buộc các dòng is_primary = 1
  primary_restaurant_id   CHAR(36) GENERATED ALWAYS AS (IF(is_primary = 1, restaurant_id, NULL)) STORED,
  PRIMARY KEY (location_id),
  CONSTRAINT restaurant_location_restaurant_fk FOREIGN KEY (restaurant_id) REFERENCES restaurant (restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT restaurant_location_lat_ck CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT restaurant_location_lng_ck CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT restaurant_location_provider_ck CHECK (
    (provider = 'GOONG'  AND NULLIF(TRIM(provider_place_id), '') IS NOT NULL AND geocoded_at IS NOT NULL)
    OR (provider = 'MANUAL' AND provider_place_id IS NULL)
    OR (provider = 'OSM'    AND NULLIF(TRIM(provider_place_id), '') IS NOT NULL)
  ),
  UNIQUE KEY restaurant_location_provider_place_uq (provider, provider_place_id),
  UNIQUE KEY restaurant_location_primary_uq (primary_restaurant_id),
  KEY restaurant_location_restaurant_ix (restaurant_id),
  KEY restaurant_location_coord_ix (latitude, longitude)
);

CREATE TABLE IF NOT EXISTS restaurant_discovery (
  location_id   CHAR(36)     NOT NULL,
  dish_keyword  VARCHAR(100) NOT NULL,
  discovered_at DATETIME(3)  NOT NULL,
  PRIMARY KEY (location_id, dish_keyword),
  KEY restaurant_discovery_keyword_ix (dish_keyword, location_id),
  CONSTRAINT restaurant_discovery_location_fk
    FOREIGN KEY (location_id) REFERENCES restaurant_location (location_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS cuisine (
  cuisine_id CHAR(36)     NOT NULL,
  name       VARCHAR(100) NOT NULL,
  PRIMARY KEY (cuisine_id),
  UNIQUE KEY cuisine_name_uq (name)
);

CREATE TABLE IF NOT EXISTS restaurant_cuisine (
  restaurant_id CHAR(36) NOT NULL,
  cuisine_id    CHAR(36) NOT NULL,
  PRIMARY KEY (restaurant_id, cuisine_id),
  CONSTRAINT restaurant_cuisine_restaurant_fk FOREIGN KEY (restaurant_id) REFERENCES restaurant (restaurant_id) ON DELETE RESTRICT,
  CONSTRAINT restaurant_cuisine_cuisine_fk FOREIGN KEY (cuisine_id) REFERENCES cuisine (cuisine_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS menu_item (
  menu_item_id    CHAR(36)     NOT NULL,
  restaurant_id   CHAR(36)     NOT NULL,
  name            VARCHAR(200) NOT NULL,
  -- Service tính khi tạo/sửa món: bỏ dấu, đ -> d, chữ thường, gộp khoảng trắng (shared/dishText.mjs)
  name_normalized VARCHAR(200) NOT NULL,
  description     VARCHAR(500) NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  created_at      DATETIME(3)  NOT NULL,
  updated_at      DATETIME(3)  NOT NULL,
  PRIMARY KEY (menu_item_id),
  CONSTRAINT menu_item_restaurant_fk FOREIGN KEY (restaurant_id) REFERENCES restaurant (restaurant_id) ON DELETE RESTRICT,
  KEY menu_item_restaurant_ix (restaurant_id),
  KEY menu_item_name_ix (name_normalized)
);

CREATE TABLE IF NOT EXISTS price_assertion (
  price_assertion_id   CHAR(36)      NOT NULL,
  menu_item_id         CHAR(36)      NOT NULL,
  min_price            DECIMAL(12,0) NOT NULL,
  max_price            DECIMAL(12,0) NOT NULL,
  currency             CHAR(3)       NOT NULL DEFAULT 'VND',
  is_current           TINYINT(1)    NOT NULL DEFAULT 0,
  source_type          VARCHAR(30)   NOT NULL,
  source_reference     VARCHAR(255)  NULL,
  created_at           DATETIME(3)   NOT NULL,
  -- NULL khi không phải giá hiện hành, nên UNIQUE chỉ ràng buộc các dòng is_current = 1
  current_menu_item_id CHAR(36) GENERATED ALWAYS AS (IF(is_current = 1, menu_item_id, NULL)) STORED,
  PRIMARY KEY (price_assertion_id),
  CONSTRAINT price_assertion_menu_item_fk FOREIGN KEY (menu_item_id) REFERENCES menu_item (menu_item_id) ON DELETE RESTRICT,
  CONSTRAINT price_assertion_range_ck CHECK (min_price >= 0 AND max_price >= min_price),
  UNIQUE KEY price_assertion_current_uq (current_menu_item_id),
  KEY price_assertion_history_ix (menu_item_id, created_at)
);
