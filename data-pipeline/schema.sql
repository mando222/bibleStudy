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

-- Structural markup in the publisher's native verse coordinates. No verse text is stored here.
CREATE TABLE verse_layout (
  translation_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  marks TEXT NOT NULL,
  PRIMARY KEY (translation_id, book_id, chapter, verse)
) WITHOUT ROWID;

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

-- The exact publisher row retained after aligning the Berean table to the printed BSB.
-- KJV links require independent English tagging, verbatim English parallels, and the unique
-- inflected form in the Hebrew/Aramaic or TR witness. A single corroborated bare divine
-- name can also qualify in a differently worded verse.
CREATE TABLE source_word_spans (
  translation_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  start_position INTEGER NOT NULL,
  end_position INTEGER NOT NULL,
  bsb_position INTEGER NOT NULL,
  source_row TEXT NOT NULL,
  language TEXT NOT NULL,
  PRIMARY KEY (translation_id, book_id, chapter, verse, end_position)
) WITHOUT ROWID;

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
  native_chapter INTEGER,       -- edition's own numbering when the reader uses English references
  native_verse   INTEGER,
  original  TEXT NOT NULL,       -- the Greek/Hebrew word
  source_type TEXT,              -- TAHOT's attestation code for the Hebrew/Aramaic reading
  translit  TEXT,
  strongs   TEXT,
  morph     TEXT,
  gloss     TEXT,                -- English gloss
  PRIMARY KEY (edition, book_id, chapter, verse, position)
) WITHOUT ROWID;

CREATE INDEX idx_ot_loc ON original_tokens (edition, book_id, chapter, verse);
CREATE INDEX idx_ot_native ON original_tokens (edition, book_id, native_chapter, native_verse);

-- One verified source occurrence of a dictionary ID. Several IDs may describe the same
-- publisher-attested reading. Hebrew attached lexical components have their own part number.
CREATE TABLE word_frequency_occurrences (
  edition        TEXT NOT NULL,
  strongs        TEXT NOT NULL,
  book_id        TEXT NOT NULL,
  chapter        INTEGER NOT NULL, -- reader address
  verse          INTEGER NOT NULL,
  position       INTEGER NOT NULL, -- position in original_tokens
  part           INTEGER NOT NULL,
  native_chapter INTEGER NOT NULL,
  native_verse   INTEGER NOT NULL,
  language       TEXT NOT NULL,
  surface        TEXT NOT NULL, -- original lexical spelling, including any cantillation
  form           TEXT NOT NULL, -- grouping form; retains vowel points, accents, spelling
  morph          TEXT NOT NULL,
  translit       TEXT,          -- publisher's transliteration when available
  alternate      INTEGER NOT NULL CHECK (alternate IN (0,1)),
  surface_start  INTEGER NOT NULL, -- UTF-16 offsets in original_tokens.original
  surface_end    INTEGER NOT NULL,
  segments       TEXT,          -- extra span information for a joined multiword lexeme
  PRIMARY KEY (strongs, edition, book_id, chapter, verse, position, part)
) WITHOUT ROWID;

-- Denominator for relative frequency: once per tagged source position, regardless of the
-- number of aliases or bound segments. Chapter is the edition's NATIVE chapter.
CREATE TABLE word_frequency_chapters (
  edition TEXT NOT NULL, language TEXT NOT NULL, book_id TEXT NOT NULL,
  chapter INTEGER NOT NULL, tagged_words INTEGER NOT NULL,
  PRIMARY KEY (edition,language,book_id,chapter)
) WITHOUT ROWID;

-- The publisher lists an ID but the available reading does not establish its exact surface.
CREATE TABLE word_frequency_gaps (
  edition TEXT NOT NULL, strongs TEXT NOT NULL, reason TEXT NOT NULL, positions INTEGER NOT NULL,
  PRIMARY KEY (strongs,edition,reason)
) WITHOUT ROWID;

-- OT textual apparatus: the Ketiv (written) variant beside the Qere (read) main text. The Qere
-- is what's stored in original_tokens ('MT'); this table keeps the Ketiv so the Variants tab can
-- show both. From STEPBible TAHOT (CC-BY 4.0). `position` matches original_tokens.position (MT).
CREATE TABLE ketiv_qere (
  book_id     TEXT NOT NULL,
  chapter     INTEGER NOT NULL,
  verse       INTEGER NOT NULL,
  position    INTEGER NOT NULL,
  qere        TEXT NOT NULL,               -- the read form (main text)
  ketiv       TEXT NOT NULL,               -- the written variant
  strongs     TEXT,
  significant INTEGER NOT NULL DEFAULT 0,  -- 1 = the difference affects translation (uppercase K)
  PRIMARY KEY (book_id, chapter, verse, position)
) WITHOUT ROWID;

CREATE INDEX idx_kq_loc ON ketiv_qere (book_id, chapter, verse);

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

-- One browsable entry per numeric headword, including extended publisher entries
-- with no counterpart in the historical Strong's dictionary.
CREATE TABLE lexicon_headwords (
  id TEXT PRIMARY KEY, language TEXT NOT NULL, lemma TEXT NOT NULL, translit TEXT,
  gloss TEXT, definition TEXT, lookup_form TEXT NOT NULL, source TEXT NOT NULL
) WITHOUT ROWID;

-- Scripture-attested parses: every distinct analysis (Strong's + morphology + gloss) that an
-- original-language WORD FORM receives across the scholar-tagged editions (STEPBible TAGNT for
-- Greek, TAHOT for Hebrew). Powers the "all parses" view — it surfaces existing scholarship and
-- the real ambiguity in the text; it never generates or guesses. `count` = how often attested.
CREATE TABLE form_parses (
  id      INTEGER PRIMARY KEY,
  form    TEXT NOT NULL,     -- accent/point-insensitive normalised surface
  lang    TEXT NOT NULL,     -- 'greek' | 'hebrew'
  strongs TEXT,
  morph   TEXT,
  gloss   TEXT,
  count   INTEGER NOT NULL
);

CREATE INDEX idx_form_parses ON form_parses (form, lang, count);

-- People / places / events for the Genealogies, Maps, and Timelines views. From the Theographic
-- Bible Metadata knowledge graph (CC-BY-SA 4.0); every row carries the verses that reference it,
-- normalised to our "Book.ch.v" keys (JSON arrays) so each links straight into the reader.
CREATE TABLE people (
  id          INTEGER PRIMARY KEY, -- Theographic personID
  name        TEXT NOT NULL,
  gender      TEXT,
  birth_year  INTEGER,
  death_year  INTEGER,
  father_id   INTEGER,
  mother_id   INTEGER,
  slug        TEXT,
  summary     TEXT,                -- short public-domain (Easton's) blurb
  verse_count INTEGER NOT NULL DEFAULT 0,
  verses      TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_people_name ON people (name);

CREATE TABLE person_links (
  person_id  INTEGER NOT NULL,
  related_id INTEGER NOT NULL,
  kind       TEXT NOT NULL         -- 'spouse' | 'child'
);
CREATE INDEX idx_person_links ON person_links (person_id);

CREATE TABLE places (
  id           INTEGER PRIMARY KEY, -- Theographic placeID
  name         TEXT NOT NULL,
  lat          REAL,
  lon          REAL,
  feature_type TEXT,
  aliases      TEXT NOT NULL DEFAULT '[]',
  precision    TEXT,              -- Theographic location precision (may be unspecified)
  ambiguous    INTEGER NOT NULL DEFAULT 0, -- this name identifies multiple places
  identification_note TEXT,       -- source notes on the separate Recogito match
  comment      TEXT,
  verse_count  INTEGER NOT NULL DEFAULT 0,
  verses       TEXT NOT NULL DEFAULT '[]',
  start_year   INTEGER,              -- earliest year the place appears active (derived; null = unknown)
  end_year     INTEGER               -- latest year the place appears active (derived)
);

CREATE TABLE events (
  id           INTEGER PRIMARY KEY, -- Theographic eventID
  title        TEXT NOT NULL,
  start_year   INTEGER,
  end_year     INTEGER,             -- derived from the source event duration (null = point event)
  sort_key     REAL,
  participants TEXT NOT NULL DEFAULT '[]', -- JSON array of personID
  place_ids    TEXT NOT NULL DEFAULT '[]', -- JSON array of placeID
  verses       TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_events_sort ON events (sort_key);

-- Canonical (KJV-numbered) references cited by Theographic people, places and events.
CREATE TABLE study_references (
  ref TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('person','place','event')),
  entity_id INTEGER NOT NULL,
  PRIMARY KEY (ref,kind,entity_id)
) WITHOUT ROWID;

-- Cross-references (Treasury of Scripture Knowledge, public domain, via OpenBible.info). A "from"
-- verse links to a ranked list of related "to" verses (which may be a small range), keyed to our
-- "Book" ids so each row links straight into the reader.
CREATE TABLE cross_references (
  from_book     TEXT NOT NULL,
  from_chapter  INTEGER NOT NULL,
  from_verse    INTEGER NOT NULL,
  to_book       TEXT NOT NULL,
  to_chapter    INTEGER NOT NULL,
  to_verse_start INTEGER NOT NULL,
  to_verse_end  INTEGER,            -- null unless the target is a range
  votes         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_xref_from ON cross_references (from_book, from_chapter, from_verse);

-- Frequency-ranked vocabulary for the Learn tab, derived from the tagged original-language text.
CREATE TABLE vocab (
  strongs   TEXT PRIMARY KEY,       -- 'G26' / 'H430'
  language  TEXT NOT NULL,          -- 'greek' | 'hebrew'
  lemma     TEXT NOT NULL,
  translit  TEXT,
  gloss     TEXT,
  frequency INTEGER NOT NULL,       -- number of occurrences in the tagged text
  testament TEXT NOT NULL           -- 'OT' | 'NT'
);
CREATE INDEX idx_vocab_lang ON vocab (language, frequency);

-- Interactive grammar lessons — original, inductive "read real Greek/Hebrew early" courses (our own
-- wording; readings are references into the tagged Greek NT / Hebrew OT, rendered live by the
-- interlinear). vocab_json / readings_json / exercises_json are JSON arrays used by Learn > Grammar.
CREATE TABLE grammar_lessons (
  id             INTEGER PRIMARY KEY,
  course         TEXT NOT NULL,     -- 'koine' | 'hebrew'
  chapter_no     INTEGER NOT NULL,
  title          TEXT NOT NULL,
  body_md        TEXT NOT NULL,
  vocab_json     TEXT NOT NULL DEFAULT '[]',
  readings_json  TEXT NOT NULL DEFAULT '[]', -- [{ ref: "John.1.1", note }] rendered from original_tokens
  exercises_json TEXT NOT NULL DEFAULT '[]',
  sort           INTEGER NOT NULL DEFAULT 0
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

-- Machine-derived word→Strong's mappings, for translations that carry no scholarly word tagging
-- of their own (everything except KJV and BSB). Inferred by aligning each verse to the BSB — which
-- IS tagged and aligned to the originals — then filling gaps from the Strong's numbers that verse
-- actually contains. See data-pipeline/lib.ts `deriveVerseTags`.
--
-- These are NOT scholarship. They are ~92% accurate, measured against the KJV's independent
-- tagging, so they live in their own table rather than in verse_tokens, and the reader marks them
-- as inferred. Keeping them separate is what makes the provenance honest.
--
-- One row per verse. `strongs` is a space-separated list aligned to the verse text's
-- whitespace-split words, with '-' for a word that received no tag — compact enough (~5 bytes a
-- word) that tagging seven translations costs tens of MB rather than hundreds.
CREATE TABLE derived_tags (
  translation_id TEXT NOT NULL,
  book_id        TEXT NOT NULL,
  chapter        INTEGER NOT NULL,
  verse          INTEGER NOT NULL,
  strongs        TEXT NOT NULL,
  PRIMARY KEY (translation_id, book_id, chapter, verse)
) WITHOUT ROWID;
