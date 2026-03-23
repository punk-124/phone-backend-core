PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  access_token TEXT PRIMARY KEY,
  refresh_token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  access_expires_at TEXT NOT NULL,
  refresh_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS bottles (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  author_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('floating', 'picked')),
  created_at TEXT NOT NULL,
  picked_by TEXT,
  picked_at TEXT,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (picked_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bottles_status_created_at ON bottles(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bottles_author_id ON bottles(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bottles_picked_by ON bottles(picked_by, picked_at DESC);

CREATE TABLE IF NOT EXISTS bottle_pick_history (
  user_id TEXT NOT NULL,
  bottle_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, bottle_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (bottle_id) REFERENCES bottles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quota_counters (
  day_key TEXT PRIMARY KEY,
  read_used INTEGER NOT NULL DEFAULT 0,
  write_used INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
