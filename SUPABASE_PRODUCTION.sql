-- MAPPHEX Supabase production setup
-- Run this in Supabase SQL Editor before deploying to Vercel.
-- The current application uses public.mapphex_kv as its durable production store.

begin;

create extension if not exists pgcrypto;

create table if not exists public.mapphex_kv (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mapphex_kv_key_not_empty check (length(trim(key)) > 0),
  constraint mapphex_kv_key_length check (length(key) <= 240)
);

create index if not exists mapphex_kv_tenant_idx
  on public.mapphex_kv ((split_part(key, ':', 2)))
  where key like 'tenant:%';

create index if not exists mapphex_kv_updated_at_idx
  on public.mapphex_kv (updated_at desc);

create or replace function public.mapphex_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_mapphex_kv_updated_at on public.mapphex_kv;
create trigger trg_mapphex_kv_updated_at
before update on public.mapphex_kv
for each row execute function public.mapphex_touch_updated_at();

alter table public.mapphex_kv enable row level security;

drop policy if exists "mapphex_kv_no_public_select" on public.mapphex_kv;
drop policy if exists "mapphex_kv_no_public_insert" on public.mapphex_kv;
drop policy if exists "mapphex_kv_no_public_update" on public.mapphex_kv;
drop policy if exists "mapphex_kv_no_public_delete" on public.mapphex_kv;

create policy "mapphex_kv_no_public_select"
on public.mapphex_kv for select
to anon, authenticated
using (false);

create policy "mapphex_kv_no_public_insert"
on public.mapphex_kv for insert
to anon, authenticated
with check (false);

create policy "mapphex_kv_no_public_update"
on public.mapphex_kv for update
to anon, authenticated
using (false)
with check (false);

create policy "mapphex_kv_no_public_delete"
on public.mapphex_kv for delete
to anon, authenticated
using (false);

-- Optional normalized production tables for future reporting and BI.
-- The app remains functional through mapphex_kv today; these tables are here
-- so Supabase is ready for structured enterprise expansion.

create table if not exists public.mapphex_organizations (
  id text primary key,
  organization_id text unique not null,
  reference_code text unique not null,
  name text not null,
  business_type text not null default 'company',
  email text,
  phone text,
  location text,
  status text not null default 'active' check (status in ('active', 'trial', 'verified', 'restricted', 'suspended')),
  subscription_status text not null default 'trial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mapphex_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'staff',
  status text not null default 'active' check (status in ('active', 'disabled', 'invited')),
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table if not exists public.mapphex_modules (
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  module_id text not null,
  enabled boolean not null default true,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, module_id)
);

create table if not exists public.mapphex_activity_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  actor text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mapphex_activity_tenant_time_idx
  on public.mapphex_activity_events (tenant_id, created_at desc);

create table if not exists public.mapphex_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  owner_email text,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  storage_path text not null,
  checksum text,
  created_at timestamptz not null default now()
);

create index if not exists mapphex_files_tenant_idx
  on public.mapphex_files (tenant_id, created_at desc);

alter table public.mapphex_organizations enable row level security;
alter table public.mapphex_users enable row level security;
alter table public.mapphex_modules enable row level security;
alter table public.mapphex_activity_events enable row level security;
alter table public.mapphex_files enable row level security;

-- No direct browser access to enterprise data tables.
-- Vercel API routes use SUPABASE_SERVICE_ROLE_KEY and enforce organization sessions.
drop policy if exists "mapphex_orgs_no_public_access" on public.mapphex_organizations;
drop policy if exists "mapphex_users_no_public_access" on public.mapphex_users;
drop policy if exists "mapphex_modules_no_public_access" on public.mapphex_modules;
drop policy if exists "mapphex_events_no_public_access" on public.mapphex_activity_events;
drop policy if exists "mapphex_files_no_public_access" on public.mapphex_files;

create policy "mapphex_orgs_no_public_access" on public.mapphex_organizations
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_users_no_public_access" on public.mapphex_users
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_modules_no_public_access" on public.mapphex_modules
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_events_no_public_access" on public.mapphex_activity_events
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_files_no_public_access" on public.mapphex_files
for all to anon, authenticated using (false) with check (false);

-- Storage bucket for future document uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mapphex-documents',
  'mapphex-documents',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
