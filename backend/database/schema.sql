CREATE TABLE IF NOT EXISTS app_user (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  email VARCHAR(254) COLLATE utf8mb4_0900_as_cs NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  password_hash VARCHAR(161) CHARACTER SET ascii NOT NULL,
  role ENUM('USER', 'ADMIN') NOT NULL,
  account_status ENUM('ACTIVE', 'SUSPENDED', 'LOCKED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY app_user_email_uq (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_session (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  KEY auth_session_expiry_ix (expires_at),
  CONSTRAINT auth_session_user_fk FOREIGN KEY (user_id) REFERENCES app_user(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS weather_cache (
  latitude DECIMAL(6,3) NOT NULL,
  longitude DECIMAL(6,3) NOT NULL,
  payload JSON NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (latitude, longitude),
  KEY weather_cache_expiry_ix (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS nlp_dish_alias (
  alias_normalized VARCHAR(150) COLLATE utf8mb4_0900_as_cs PRIMARY KEY,
  canonical_dish VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO nlp_dish_alias (alias_normalized, canonical_dish)
VALUES ('banh my pate', 'Bánh mì pate')
ON DUPLICATE KEY UPDATE canonical_dish = nlp_dish_alias.canonical_dish;
