-- A trade the agent proposed. Only the investor's Approve tap moves it on.
CREATE TABLE intents (
  id TEXT PRIMARY KEY,
  wa_id TEXT NOT NULL REFERENCES users(wa_id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  symbol TEXT NOT NULL,
  shares INTEGER NOT NULL CHECK (shares > 0),
  price_pesewas INTEGER NOT NULL CHECK (price_pesewas > 0),
  net_pesewas INTEGER NOT NULL,
  rationale TEXT NOT NULL,
  verdict_json TEXT NOT NULL,
  signature TEXT NOT NULL,          -- HMAC over the fields above; checked before execution
  status TEXT NOT NULL CHECK (status IN ('PROPOSED', 'APPROVED', 'REJECTED', 'EXPIRED', 'FILLED', 'FAILED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX intents_by_user ON intents (wa_id, created_at);

-- Simulated executions.
CREATE TABLE fills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_id TEXT NOT NULL REFERENCES intents(id),
  wa_id TEXT NOT NULL,
  side TEXT NOT NULL,
  symbol TEXT NOT NULL,
  shares INTEGER NOT NULL,
  price_pesewas INTEGER NOT NULL,
  gross_pesewas INTEGER NOT NULL,
  charges_pesewas INTEGER NOT NULL,
  net_pesewas INTEGER NOT NULL,
  lines_json TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX fills_by_user ON fills (wa_id, at);
