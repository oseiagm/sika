-- The investor's language (null: never chosen; treated as English) and whether Sika replies with voice notes.
ALTER TABLE users ADD COLUMN lang TEXT;
ALTER TABLE users ADD COLUMN voice_replies TEXT NOT NULL DEFAULT 'match';

-- Translated lines, so each fixed message and button is translated once per language.
CREATE TABLE translations (
  key TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
