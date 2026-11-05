CREATE TABLE posts (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', body TEXT NOT NULL,
 category TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL CHECK(status IN ('draft','published')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT
);
CREATE TABLE sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE oauth_states (hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE releases (
 id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('pending','building','succeeded','failed')),
 snapshot TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, run_id TEXT, attempt TEXT,
 error TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX one_active_release ON releases((1)) WHERE state IN ('pending','building');
CREATE INDEX release_time ON releases(created_at);
