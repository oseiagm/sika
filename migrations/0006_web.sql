-- Web demo ("try it") usage, to cap how much of the model budget visitors can spend.
CREATE TABLE try_usage (
  session TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session, day)
);

-- Secret link to each user's activity page.
ALTER TABLE users ADD COLUMN view_token TEXT;
CREATE UNIQUE INDEX users_view_token ON users (view_token);
