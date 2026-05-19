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
  status text not null default 'pending',
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_by text,
  decided_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mapphex_workflow_requests
  drop constraint if exists mapphex_workflow_requests_status_check;

alter table public.mapphex_workflow_requests
  add constraint mapphex_workflow_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'returned', 'paid', 'cancelled'));

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

create table if not exists public.mapphex_employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  branch_id uuid references public.mapphex_branches(id) on delete set null,
  employee_code text,
  full_name text not null,
  email text,
  phone text,
  department text,
  job_title text,
  employment_status text not null default 'active',
  salary numeric(14,2) not null default 0,
  tax_pin text,
  hire_date date,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, employee_code),
  unique (tenant_id, email)
);

create table if not exists public.mapphex_attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  employee_id uuid references public.mapphex_employees(id) on delete cascade,
  work_date date not null default current_date,
  status text not null default 'present',
  check_in timestamptz,
  check_out timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, employee_id, work_date)
);

create table if not exists public.mapphex_leave_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  employee_id uuid references public.mapphex_employees(id) on delete cascade,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'pending',
  reason text,
  decided_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mapphex_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  period_month date not null,
  source_module text not null default 'hr',
  target_module text not null default 'finance',
  status text not null default 'draft',
  gross_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  deduction_amount numeric(14,2) not null default 0,
  bonus_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  approval_request_id uuid references public.mapphex_workflow_requests(id) on delete set null,
  prepared_by text,
  approved_by text,
  paid_by text,
  rejection_reason text,
  paid_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, period_month)
);

create table if not exists public.mapphex_payroll_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  payroll_run_id uuid not null references public.mapphex_payroll_runs(id) on delete cascade,
  employee_id uuid references public.mapphex_employees(id) on delete set null,
  employee_name text not null,
  department text,
  base_salary numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  bonus_amount numeric(14,2) not null default 0,
  deduction_amount numeric(14,2) not null default 0,
  net_pay numeric(14,2) not null default 0,
  payment_status text not null default 'pending',
  payslip_payload jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.mapphex_approval_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  workflow_request_id uuid references public.mapphex_workflow_requests(id) on delete cascade,
  decision text not null,
  comment text,
  decided_by text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mapphex_suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.mapphex_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  customer_type text not null default 'customer',
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mapphex_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  item_id uuid references public.mapphex_catalog_items(id) on delete set null,
  branch_id uuid references public.mapphex_branches(id) on delete set null,
  movement_type text not null,
  quantity numeric(14,3) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  reference text,
  source_module text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mapphex_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  supplier_id uuid references public.mapphex_suppliers(id) on delete set null,
  request_id uuid references public.mapphex_workflow_requests(id) on delete set null,
  po_number text not null,
  status text not null default 'draft',
  total_amount numeric(14,2) not null default 0,
  expected_delivery date,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, po_number)
);

create table if not exists public.mapphex_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  customer_id uuid references public.mapphex_customers(id) on delete set null,
  invoice_number text not null,
  module_id text not null default 'finance',
  status text not null default 'draft',
  subtotal numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  due_date date,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, invoice_number)
);

create table if not exists public.mapphex_invoice_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  invoice_id uuid not null references public.mapphex_invoices(id) on delete cascade,
  item_id uuid references public.mapphex_catalog_items(id) on delete set null,
  description text not null,
  quantity numeric(14,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0
);

create table if not exists public.mapphex_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  invoice_id uuid references public.mapphex_invoices(id) on delete set null,
  transaction_id uuid references public.mapphex_transactions(id) on delete set null,
  amount numeric(14,2) not null default 0,
  payment_method text,
  status text not null default 'posted',
  reference text,
  paid_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.mapphex_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  plan_code text not null,
  status text not null default 'trial',
  billing_period text not null default 'monthly',
  amount numeric(14,2) not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mapphex_industry_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.mapphex_organizations(id) on delete cascade,
  module_id text not null,
  record_type text not null,
  title text not null,
  status text not null default 'active',
  amount numeric(14,2) not null default 0,
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
alter table public.mapphex_employees enable row level security;
alter table public.mapphex_attendance enable row level security;
alter table public.mapphex_leave_requests enable row level security;
alter table public.mapphex_payroll_runs enable row level security;
alter table public.mapphex_payroll_items enable row level security;
alter table public.mapphex_approval_decisions enable row level security;
alter table public.mapphex_suppliers enable row level security;
alter table public.mapphex_customers enable row level security;
alter table public.mapphex_inventory_movements enable row level security;
alter table public.mapphex_purchase_orders enable row level security;
alter table public.mapphex_invoices enable row level security;
alter table public.mapphex_invoice_items enable row level security;
alter table public.mapphex_payments enable row level security;
alter table public.mapphex_subscriptions enable row level security;
alter table public.mapphex_industry_records enable row level security;

create index if not exists mapphex_users_tenant_idx on public.mapphex_users (tenant_id);
create index if not exists mapphex_modules_tenant_idx on public.mapphex_modules (tenant_id);
create index if not exists mapphex_branches_tenant_idx on public.mapphex_branches (tenant_id);
create index if not exists mapphex_items_tenant_status_idx on public.mapphex_catalog_items (tenant_id, status);
create index if not exists mapphex_workflows_tenant_status_idx on public.mapphex_workflow_requests (tenant_id, status, created_at desc);
create index if not exists mapphex_messages_tenant_time_idx on public.mapphex_messages (tenant_id, created_at desc);
create index if not exists mapphex_notifications_tenant_time_idx on public.mapphex_notifications (tenant_id, created_at desc);
create index if not exists mapphex_audit_tenant_time_idx on public.mapphex_audit_logs (tenant_id, created_at desc);
create index if not exists mapphex_transactions_tenant_time_idx on public.mapphex_transactions (tenant_id, created_at desc);
create index if not exists mapphex_reports_tenant_period_idx on public.mapphex_reports (tenant_id, module_id, period_start, period_end);
create index if not exists mapphex_employees_tenant_status_idx on public.mapphex_employees (tenant_id, employment_status);
create index if not exists mapphex_payroll_runs_tenant_period_idx on public.mapphex_payroll_runs (tenant_id, period_month desc);
create index if not exists mapphex_payroll_items_run_idx on public.mapphex_payroll_items (payroll_run_id);
create index if not exists mapphex_inventory_movements_tenant_time_idx on public.mapphex_inventory_movements (tenant_id, created_at desc);
create index if not exists mapphex_invoices_tenant_status_idx on public.mapphex_invoices (tenant_id, status, created_at desc);
create index if not exists mapphex_industry_records_tenant_module_idx on public.mapphex_industry_records (tenant_id, module_id, created_at desc);

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
drop policy if exists "mapphex_employees_no_public_access" on public.mapphex_employees;
drop policy if exists "mapphex_attendance_no_public_access" on public.mapphex_attendance;
drop policy if exists "mapphex_leave_requests_no_public_access" on public.mapphex_leave_requests;
drop policy if exists "mapphex_payroll_runs_no_public_access" on public.mapphex_payroll_runs;
drop policy if exists "mapphex_payroll_items_no_public_access" on public.mapphex_payroll_items;
drop policy if exists "mapphex_approval_decisions_no_public_access" on public.mapphex_approval_decisions;
drop policy if exists "mapphex_suppliers_no_public_access" on public.mapphex_suppliers;
drop policy if exists "mapphex_customers_no_public_access" on public.mapphex_customers;
drop policy if exists "mapphex_inventory_movements_no_public_access" on public.mapphex_inventory_movements;
drop policy if exists "mapphex_purchase_orders_no_public_access" on public.mapphex_purchase_orders;
drop policy if exists "mapphex_invoices_no_public_access" on public.mapphex_invoices;
drop policy if exists "mapphex_invoice_items_no_public_access" on public.mapphex_invoice_items;
drop policy if exists "mapphex_payments_no_public_access" on public.mapphex_payments;
drop policy if exists "mapphex_subscriptions_no_public_access" on public.mapphex_subscriptions;
drop policy if exists "mapphex_industry_records_no_public_access" on public.mapphex_industry_records;

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

create policy "mapphex_employees_no_public_access" on public.mapphex_employees
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_attendance_no_public_access" on public.mapphex_attendance
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_leave_requests_no_public_access" on public.mapphex_leave_requests
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_payroll_runs_no_public_access" on public.mapphex_payroll_runs
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_payroll_items_no_public_access" on public.mapphex_payroll_items
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_approval_decisions_no_public_access" on public.mapphex_approval_decisions
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_suppliers_no_public_access" on public.mapphex_suppliers
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_customers_no_public_access" on public.mapphex_customers
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_inventory_movements_no_public_access" on public.mapphex_inventory_movements
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_purchase_orders_no_public_access" on public.mapphex_purchase_orders
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_invoices_no_public_access" on public.mapphex_invoices
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_invoice_items_no_public_access" on public.mapphex_invoice_items
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_payments_no_public_access" on public.mapphex_payments
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_subscriptions_no_public_access" on public.mapphex_subscriptions
for all to anon, authenticated using (false) with check (false);

create policy "mapphex_industry_records_no_public_access" on public.mapphex_industry_records
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
