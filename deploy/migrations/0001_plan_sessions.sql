CREATE TABLE plan_sessions (
  tokenHash TEXT PRIMARY KEY NOT NULL,
  sessionGeneration TEXT NOT NULL,
  planId TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0 AND revision <= 9007199254740991),
  schemaVersion INTEGER NOT NULL DEFAULT 1,
  currentJson TEXT CHECK(currentJson IS NULL OR json_valid(currentJson)),
  previousJson TEXT CHECK(previousJson IS NULL OR json_valid(previousJson)),
  updatedAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  lastOperationId TEXT,
  lastOperationHash TEXT
);
CREATE INDEX plan_sessions_expiry ON plan_sessions(expiresAt);
