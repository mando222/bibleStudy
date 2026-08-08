-- Bundled, read-only Bible database schema (built by data-pipeline/build.ts).
-- User notes/highlights live in a SEPARATE user.sqlite (see src/main), never here.

CREATE TABLE translations (
  id           TEXT PRIMARY KEY,   -- our stable id, e.g. 'KJV'
  abbrev       TEXT NOT NULL,
  name         TEXT NOT NULL,
  language     TEXT NOT NULL,      -- 'eng' | 'hbo' | 'grc'
  direction    TEXT NOT NULL DEFAULT 'ltr',
  is_original  INTEGER NOT NULL DEFAULT 0,
  has_strongs  INTEGER NOT NULL DEFAULT 0,
  license      TEXT NOT NULL DEFAULT '',
  attribution  TEXT NOT NULL DEFAULT '',
  sort_order   INTEGER NOT NULL DEFAULT 0
);

-- Canonical books (shared across all 66-book translations).
CREATE TABLE books (
  id            TEXT PRIMARY KEY,  -- OSIS-style, e.g. 'John'
  usfm          TEXT NOT NULL,     -- 'JHN'
  name          TEXT NOT NULL,
  testament     TEXT NOT NULL,     -- 'OT' | 'NT'
  sort_order    INTEGER NOT NULL,
  num_chapters  INTEGER NOT NULL
);

CREATE TABLE verses (
  translation_id TEXT NOT NULL,
  book_id        TEXT NOT NULL,
  chapter        INTEGER NOT NULL,
  verse          INTEGER NOT NULL,
  text           TEXT NOT NULL,
  PRIMARY KEY (translation_id, book_id, chapter, verse)
) WITHOUT ROWID;

CREATE INDEX idx_verses_loc ON verses (translation_id, book_id, chapter);

-- Word-level tokens for translations that carry Strong's / interlinear data.
-- Populated for KJV (+Strong's) in the Strong's task; empty otherwise.
CREATE TABLE verse_tokens (
  translation_id TEXT NOT NULL,
  book_id        TEXT NOT NULL,
  chapter        INTEGER NOT NULL,
  verse          INTEGER NOT NULL,
  position       INTEGER NOT NULL,
  surface        TEXT NOT NULL,
  trailer        TEXT NOT NULL DEFAULT ' ',
  strongs        TEXT,
  lemma          TEXT,
  translit       TEXT,
  morph          TEXT,
  gloss          TEXT,
  PRIMARY KEY (translation_id, book_id, chapter, verse, position)
) WITHOUT ROWID;

CREATE INDEX idx_tokens_strongs ON verse_tokens (strongs);

CREATE TABLE strongs_lexicon (
  id            TEXT PRIMARY KEY,  -- 'G26' / 'H430'
  language      TEXT NOT NULL,     -- 'greek' | 'hebrew'
  lemma         TEXT,
  translit      TEXT,
  pronunciation TEXT,
  definition    TEXT,
  kjv_def       TEXT,
  derivation    TEXT
);

-- Full-text search over verse text (standalone contentless-style table).
CREATE VIRTUAL TABLE verses_fts USING fts5 (
  text,
  translation_id UNINDEXED,
  book_id UNINDEXED,
  chapter UNINDEXED,
  verse UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Simple key/value for build metadata (version, sources, build date).
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
