-- Idempotent schema: safe to run on every boot.

CREATE TABLE IF NOT EXISTS employees (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(254) NOT NULL UNIQUE,   -- stored lower-cased
  password_hash TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- An enquiry is PUBLIC while counselor_id IS NULL and PRIVATE once claimed.
CREATE TABLE IF NOT EXISTS enquiries (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(254) NOT NULL,
  phone           VARCHAR(20),
  course_interest VARCHAR(150) NOT NULL,
  message         TEXT,
  counselor_id    INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  claimed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT claim_consistency CHECK ((counselor_id IS NULL) = (claimed_at IS NULL))
);

-- Fast "public enquiries" listing (newest first, unclaimed only).
CREATE INDEX IF NOT EXISTS idx_enquiries_unclaimed
  ON enquiries (created_at DESC) WHERE counselor_id IS NULL;

-- Fast "my leads" listing.
CREATE INDEX IF NOT EXISTS idx_enquiries_counselor
  ON enquiries (counselor_id, claimed_at DESC);
