-- Stocks an investor follows for news (stocks they hold are watched without a row here).
CREATE TABLE follows (
  wa_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (wa_id, symbol)
);

-- Every news article seen for a stock, so each is pushed at most once.
CREATE TABLE news_seen (
  symbol TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  published TEXT,
  material INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (symbol, url)
);

-- Updates waiting behind a WhatsApp template tap (sent when the 24-hour window had closed).
CREATE TABLE pending_updates (
  id TEXT PRIMARY KEY,
  wa_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('news', 'price')),
  symbol TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  shown_at TEXT
);
CREATE INDEX pending_by_user ON pending_updates (wa_id, created_at);

-- 1: send news messages; 0: the investor tapped "Stop news alerts".
ALTER TABLE users ADD COLUMN news_alerts INTEGER NOT NULL DEFAULT 1;
