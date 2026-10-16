-- ohjeyti accounts and online backups (MySQL / MariaDB).
-- Run once in hPanel: Databases -> phpMyAdmin -> select your database -> SQL -> paste -> Go.
--
-- No passwords are stored. Each account has a recovery code, saved only as a
-- bcrypt hash, and devices hold random tokens, saved only as SHA-256 hashes.
-- Photos are stored as files outside public_html (see data_dir in the config).

CREATE TABLE IF NOT EXISTS accounts (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username         VARCHAR(20)  NOT NULL,
  full_name        VARCHAR(120) NOT NULL,
  code_hash        VARCHAR(255) NOT NULL,
  failed_attempts  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until     DATETIME NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_tokens (
  token_hash   CHAR(64)     NOT NULL PRIMARY KEY,
  account_id   INT UNSIGNED NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME     NULL,
  CONSTRAINT fk_tokens_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS backups (
  account_id  INT UNSIGNED NOT NULL PRIMARY KEY,
  snapshot    LONGTEXT     NOT NULL,
  updated_at  DATETIME     NOT NULL,
  CONSTRAINT fk_backups_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       CHAR(64)          NOT NULL PRIMARY KEY,
  hits         SMALLINT UNSIGNED NOT NULL,
  window_start DATETIME          NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
