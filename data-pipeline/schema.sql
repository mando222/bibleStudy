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

-- Selectable original-language editions for the interlinear (Masoretic, TR, Byzantine, Critical, …).
CREATE TABLE editions (
  id         TEXT PRIMARY KEY,   -- 'MT' | 'NA' | 'TR' | 'BYZ' | 'LXX'
  name       TEXT NOT NULL,
  language   TEXT NOT NULL,      -- 'hbo' | 'grc'
  testament  TEXT NOT NULL,      -- 'OT' | 'NT'
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- One row per original-language word of an edition (the interlinear backbone).
CREATE TABLE original_tokens (
  edition   TEXT NOT NULL,
  book_id   TEXT NOT NULL,
  chapter   INTEGER NOT NULL,
  verse     INTEGER NOT NULL,
  position  INTEGER NOT NULL,
  original  TEXT NOT NULL,       -- the Greek/Hebrew word
  translit  TEXT,
  strongs   TEXT,
  morph     TEXT,
  gloss     TEXT,                -- English gloss
  PRIMARY KEY (edition, book_id, chapter, verse, position)
) WITHOUT ROWID;

CREATE INDEX idx_ot_loc ON original_tokens (edition, book_id, chapter, verse);

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

-- Additional scholarly lexicons (BDB, Abbott-Smith, LSJ, …), keyed to Strong's numbers so the
-- lexicon card can offer several entries for a clicked word. Bodies are sanitised at build time
-- to a safe <b>/<i>/newline subset. One row per lexicon sub-entry (a Strong's number may have a
-- few, e.g. G0001G / G0001H).
CREATE TABLE lexicon_entries (
  id        INTEGER PRIMARY KEY,
  lexicon   TEXT NOT NULL,     -- 'TBESG' | 'TBESH' | 'TFLSJ'
  strongs   TEXT NOT NULL,     -- normalised base id: 'G26' / 'H430'
  ext_key   TEXT,              -- extended Strong's, e.g. 'G0001G'
  headword  TEXT,              -- lemma
  translit  TEXT,
  gloss     TEXT,
  body      TEXT NOT NULL,     -- sanitised definition (only <b>/<i> + newlines)
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_lex_strongs ON lexicon_entries (strongs, lexicon, sort);

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
