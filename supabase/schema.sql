-- Run once in Supabase Dashboard → SQL Editor before deploying the Render service.
-- The Node backend uses the Postgres connection string. Do not grant these tables to anon/authenticated API roles.
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  role text NOT NULL CHECK (role IN ('teacher','student')),
  display_name text NOT NULL,
  salt text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, username)
);

CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions(expires_at);

CREATE TABLE IF NOT EXISTS student_memory (
  student_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classroom_tasks (
  code text PRIMARY KEY,
  title text NOT NULL,
  game_id text NOT NULL,
  class_name text NOT NULL DEFAULT '',
  teacher_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  submissions jsonb NOT NULL DEFAULT '[]'::jsonb
);
ALTER TABLE classroom_tasks ADD COLUMN IF NOT EXISTS game_definition jsonb;
CREATE INDEX IF NOT EXISTS classroom_tasks_teacher_idx ON classroom_tasks(teacher_id, created_at DESC);

CREATE TABLE IF NOT EXISTS teacher_resources (
  id text PRIMARY KEY,
  teacher_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT '备课内容',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teacher_resources_owner_idx ON teacher_resources(teacher_id, updated_at DESC);
ALTER TABLE teacher_resources ENABLE ROW LEVEL SECURITY;

-- Deny direct Data API reads/writes. Only the server-side Postgres connection should access these tables.
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE classroom_tasks ENABLE ROW LEVEL SECURITY;
