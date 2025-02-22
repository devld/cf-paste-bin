CREATE TABLE paste_bin_items(
    `key` TEXT PRIMARY KEY,
    `content` TEXT NOT NULL,
    `admin_password` TEXT NOT NULL,
    `created_at` INTEGER NOT NULL,
    `expired_at` INTEGER
);