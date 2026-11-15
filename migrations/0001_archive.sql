PRAGMA foreign_keys = ON;
CREATE TABLE entries (
 id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('material','fiction','art')),
 title TEXT NOT NULL, author TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
 starred INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX entries_created ON entries(created_at DESC, id DESC);
CREATE TABLE storage_usage (id INTEGER PRIMARY KEY CHECK(id=1), bytes INTEGER NOT NULL DEFAULT 0 CHECK(bytes>=0 AND bytes<=8000000000));
INSERT INTO storage_usage(id,bytes) VALUES(1,0);
CREATE TABLE images (
 id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
 name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL CHECK(size>0), created_at TEXT NOT NULL
);
CREATE INDEX images_entry ON images(entry_id);
CREATE TRIGGER reserve_image BEFORE INSERT ON images BEGIN UPDATE storage_usage SET bytes=bytes+NEW.size WHERE id=1; END;
CREATE TRIGGER release_image AFTER DELETE ON images BEGIN UPDATE storage_usage SET bytes=bytes-OLD.size WHERE id=1; END;
