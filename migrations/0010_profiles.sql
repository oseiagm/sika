-- Company facts from the web (sector, shares outstanding, dividends, results, news), with sources; refreshed daily.
CREATE TABLE company_profiles (
  symbol TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
