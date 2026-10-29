-- One row per alert sent, so each fires once (per holding and level per day, or per month for reminders).
CREATE TABLE alerts_sent (
  wa_id TEXT NOT NULL,
  key TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (wa_id, key)
);
