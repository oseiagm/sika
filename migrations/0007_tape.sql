-- IC snapshot + order books recorded during GSE hours, replayed when MARKET_MODE=replay (e.g. weekend demos).
CREATE TABLE market_tape (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  snapshot_json TEXT NOT NULL,
  depth_json TEXT NOT NULL
);
