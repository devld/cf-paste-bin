CREATE TABLE paste_bin_items(
    `key` TEXT PRIMARY KEY,
    `content` TEXT NOT NULL,
    `admin_password` TEXT NOT NULL,
    `expired_at` INTEGER,
    `created_at` INTEGER NOT NULL,
    `updated_at` INTEGER NOT NULL
);