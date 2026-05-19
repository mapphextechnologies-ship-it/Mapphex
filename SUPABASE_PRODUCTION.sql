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

create table if not exists public.mapphex_branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  name text not null,
  branch_type text not null default 'branch',
  location text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mapphex_catalog_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  name text not null,
  category_type text not null default 'product',
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.mapphex_catalog_attributes (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  name text not null,
  data_type text not null default 'text',
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.mapphex_catalog_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  category_id uuid references public.mapphex_catalog_categories(id) on delete set null,
  item_type text not null default 'product' check (item_type in ('product', 'service', 'asset', 'subscription', 'fee', 'project')),
  sku text,
  name text not null,
  unit text not null default 'unit',
  tax_code text,
  price numeric(14,2) not null default 0,
  cost numeric(14,2) not null default 0,
  attributes jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create table if not exists public.mapphex_workflow_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  source_module text not null,
  target_module text not null,
  request_type text not null,
  title text not null,
  amount numeric(14,2) default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'returned', 'cancelled')),
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_by text,
  decided_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mapphex_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  from_module text,
  to_module text,
  subject text,
  body text not null,
  status text not null default 'sent',
  created_at timestamptz not null default now()
);

create table if not exists public.mapphex_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  name text not null,
  scope text not null default 'organization',
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.mapphex_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  role_id uuid references public.mapphex_roles(id) on delete cascade,
  module_id text not null,
  permission text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, role_id, module_id, permission)
);

create table if not exists public.mapphex_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  module_id text,
  user_id uuid references public.mapphex_users(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mapphex_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  actor text,
  action text not null,
  module_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mapphex_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  source_module text not null,
  transaction_type text not null,
  item_id uuid references public.mapphex_catalog_items(id) on delete set null,
  reference text,
  amount numeric(14,2) not null default 0,
  quantity numeric(14,3) not null default 0,
  status text not null default 'posted',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mapphex_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  module_id text not null,
  report_type text not null,
  period_start date,
  period_end date,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mapphex_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  module_id text,
  owner_user_id uuid references public.mapphex_users(id) on delete set null,
  file_id uuid references public.mapphex_files(id) on delete set null,
  document_type text,
  title text not null,
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mapphex_technology_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  client_name text not null,
  project_name text not null,
  service_type text not null,
  status text not null default 'active',
  billing_type text not null default 'project',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mapphex_organizations enable row level security;
alter table public.mapphex_users enable row level security;
alter table public.mapphex_modules enable row level security;
alter table public.mapphex_activity_events enable row level security;
alter table public.mapphex_files enable row level security;
alter table public.mapphex_branches enable row level security;
alter table public.mapphex_catalog_categories enable row level security;
alter table public.mapphex_catalog_attributes enable row level security;
alter table public.mapphex_catalog_items enable row level security;
alter table public.mapphex_workflow_requests enable row level security;
alter table public.mapphex_messages enable row level security;
alter table public.mapphex_roles enable row level security;
alter table public.mapphex_permissions enable row level security;
alter table public.mapphex_notifications enable row level security;
alter table public.mapphex_audit_logs enable row level security;
alter table public.mapphex_transactions enable row level security;
alter table public.mapphex_reports enable row level security;
alter table public.mapphex_documents enable row level security;
alter table public.mapphex_technology_projects enable row level security;

-- No direct browser access to enterprise data tables.
-- Vercel API routes use SUPABASE_SERVICE_ROLE_KEY and enforce organization sessions.
drop policy if exists "mapphex_orgs_no_public_access" on public.mapphex_organizations;
drop policy if exists "mapphex_users_no_public_access" on public.mapphex_users;
drop policy if exists "mapphex_modules_no_public_access" on public.mapphex_modules;
drop policy if exists "mapphex_events_no_public_access" on public.mapphex_activity_events;
drop policy if exists "mapphex_files_no_public_access" on public.mapphex_files;
drop policy if exists "mapphex_branches_no_public_access" on public.mapphex_branches;
drop policy if exists "mapphex_categories_no_public_access" on public.mapphex_catalog_categories;
drop policy if exists "mapphex_attributes_no_public_access" on public.mapphex_catalog_attributes;
drop policy if exists "mapphex_items_no_public_access" on public.mapphex_catalog_items;
drop policy if exists "mapphex_workflows_no_public_access" on public.mapphex_workflow_requests;
drop policy if exists "mapphex_messages_no_public_access" on public.mapphex_messages;
drop policy if exists "mapphex_roles_no_public_access" on public.mapphex_roles;
drop policy if exists "mapphex_permissions_no_public_access" on public.mapphex_permissions;
drop policy if exists "mapphex_notifications_no_public_access" on public.mapphex_notifications;
drop policy if exists "mapphex_audit_logs_no_public_access" on public.mapphex_audit_logs;
drop policy if exists "mapphex_transactions_no_public_access" on public.mapphex_transactions;
drop policy if exists "mapphex_reports_no_public_access" on public.mapphex_reports;
drop policy if exists "mapphex_documents_no_public_access" on public.mapphex_documents;
drop policy if exists "mapphex_tech_projects_no_public_access" on public.mapphex_technology_projects;

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

create policy "mapphex_branches_no_public_access" on public.mapphex_branches
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_categories_no_public_access" on public.mapphex_catalog_categories
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_attributes_no_public_access" on public.mapphex_catalog_attributes
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_items_no_public_access" on public.mapphex_catalog_items
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_workflows_no_public_access" on public.mapphex_workflow_requests
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_messages_no_public_access" on public.mapphex_messages
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_roles_no_public_access" on public.mapphex_roles
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_permissions_no_public_access" on public.mapphex_permissions
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_notifications_no_public_access" on public.mapphex_notifications
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_audit_logs_no_public_access" on public.mapphex_audit_logs
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_transactions_no_public_access" on public.mapphex_transactions
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_reports_no_public_access" on public.mapphex_reports
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_documents_no_public_access" on public.mapphex_documents
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_tech_projects_no_public_access" on public.mapphex_technology_projects
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
