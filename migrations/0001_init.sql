-- One row per WhatsApp user.
CREATE TABLE users (
  wa_id TEXT PRIMARY KEY,
  name TEXT,
  mandate_json TEXT,              -- latest mandate (draft or confirmed)
  mandate_confirmed_at TEXT,      -- NULL while it's a draft
  holdings_draft_json TEXT,       -- holdings waiting for "Looks right"
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Confirmed holdings. Money in pesewas (integers).
CREATE TABLE holdings (
  wa_id TEXT NOT NULL REFERENCES users(wa_id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  shares INTEGER NOT NULL CHECK (shares > 0),
  cost_pesewas INTEGER NOT NULL CHECK (cost_pesewas > 0),  -- all-in, buy charges included
  cost_source TEXT NOT NULL CHECK (cost_source IN ('given', 'estimate')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (wa_id, symbol)
);

-- Chat history the agent sees (text turns only).
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX messages_by_user ON messages (wa_id, id);

-- WhatsApp may deliver a message more than once.
CREATE TABLE processed (
  message_id TEXT PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Everything the agent and the user did, for the trust view.
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX audit_by_user ON audit (wa_id, id);
