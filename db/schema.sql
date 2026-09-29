CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS history_users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('visitor', 'editor', 'administrator')),
  disabled boolean NOT NULL DEFAULT false,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS history_versions (
  id uuid PRIMARY KEY,
  version text NOT NULL,
  author text NOT NULL,
  author_id text NOT NULL,
  created_at timestamptz NOT NULL,
  changes text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'review', 'approved', 'published')),
  dataset jsonb NOT NULL,
  history jsonb NOT NULL DEFAULT '[]',
  restored_from text,
  base_version_id uuid
);
ALTER TABLE history_versions ADD COLUMN IF NOT EXISTS base_version_id uuid;

CREATE TABLE IF NOT EXISTS history_datasets (
  id text PRIMARY KEY,
  published_version_id uuid REFERENCES history_versions(id),
  login_attempts jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS history_sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES history_users(id),
  expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS history_sessions_expiration_idx ON history_sessions(expires_at);
CREATE INDEX IF NOT EXISTS history_versions_date_idx ON history_versions(created_at DESC);

CREATE TABLE IF NOT EXISTS history_features (
  id bigserial PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES history_versions(id),
  properties jsonb NOT NULL,
  geometry geometry(Geometry, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS history_features_geom_idx ON history_features USING gist(geometry);
CREATE INDEX IF NOT EXISTS history_features_version_idx ON history_features(version_id);
