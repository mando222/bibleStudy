CREATE TABLE IF NOT EXISTS highlights (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  translation TEXT NOT NULL,
  book        TEXT NOT NULL,
  chapter     INTEGER NOT NULL,
  verse       INTEGER NOT NULL,
  start_token INTEGER,
  end_token   INTEGER,
  color       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hl_loc ON highlights (translation, book, chapter);

CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  book       TEXT NOT NULL,
  chapter    INTEGER NOT NULL,
  verse      INTEGER NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_loc ON notes (book, chapter);

CREATE TABLE IF NOT EXISTS imported_translations (
  id        TEXT PRIMARY KEY,
  abbrev    TEXT NOT NULL,
  name      TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'ltr',
  added_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS imported_verses (
  translation_id TEXT NOT NULL,
  book_id        TEXT NOT NULL,
  chapter        INTEGER NOT NULL,
  verse          INTEGER NOT NULL,
  text           TEXT NOT NULL,
  PRIMARY KEY (translation_id, book_id, chapter, verse)
);

CREATE TABLE IF NOT EXISTS srs_cards (
  strongs       TEXT PRIMARY KEY,
  language      TEXT NOT NULL,
  ease          REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  due_at        INTEGER NOT NULL DEFAULT 0,
  reps          INTEGER NOT NULL DEFAULT 0,
  lapses        INTEGER NOT NULL DEFAULT 0,
  last_grade    INTEGER,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_srs_due ON srs_cards (language, due_at);

CREATE TABLE IF NOT EXISTS learn_progress (
  module     TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (module, key)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  book       TEXT NOT NULL,
  chapter    INTEGER NOT NULL,
  verse      INTEGER NOT NULL DEFAULT 1,
  note       TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  book       TEXT NOT NULL,
  chapter    INTEGER NOT NULL,
  verse      INTEGER,
  visited_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_meta (key TEXT PRIMARY KEY, value TEXT);
