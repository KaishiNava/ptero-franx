-- FRANXX PTERO / Supabase schema
-- Run this once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  root boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id text primary key,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  scopes jsonb not null default '[]'::jsonb,
  created_by text references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.servers (
  id text primary key,
  owner_id text not null references public.users(id) on delete cascade,
  name text not null,
  runtime text not null default 'node' check (runtime in ('node','python','custom')),
  entry text not null default 'index.js',
  command text not null,
  memory_limit integer not null default 512 check (memory_limit >= 64 and memory_limit <= 32768),
  env jsonb not null default '{}'::jsonb,
  runtime_port integer not null default 0 check (runtime_port >= 0 and runtime_port <= 65535),
  suspended boolean not null default false,
  suspended_at timestamptz,
  suspended_reason text,
  created_at timestamptz not null default now()
);

create index if not exists users_username_idx on public.users(username);
create index if not exists servers_owner_idx on public.servers(owner_id);
create index if not exists api_keys_created_by_idx on public.api_keys(created_by);
create index if not exists api_keys_hash_idx on public.api_keys(key_hash);

-- Backend uses the Supabase service-role key, so the browser does not need
-- direct database access. RLS prevents accidental public access if the anon
-- key is ever exposed.
alter table public.users enable row level security;
alter table public.api_keys enable row level security;
alter table public.servers enable row level security;

-- No public policies are created intentionally.
-- The Node backend is the only database client and uses service_role.

-- Optional integrity checks for the configured admin username are enforced by
-- the application, because ROOT_USERNAME is a Railway environment variable.
