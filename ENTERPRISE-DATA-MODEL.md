# Enterprise ERP Data Model

This platform is structured as a multi-company ERP, not a phone marketplace. Legacy keys such as `phones` remain only as backward-compatible local storage aliases for existing branch records. New workflows should use universal names: products, services, assets, subscriptions, clients, projects, tickets, branches, and modules.

## Core Tenant Tables

- `organizations`: company profile, industry, subscription, package, status.
- `branches`: locations, warehouses, campuses, facilities, restaurants, offices, or service regions.
- `users`: staff, agents, managers, department users, admins.
- `roles`: role names, scopes, module access, approval limits.
- `permissions`: reusable permission codes such as `finance.manage`, `technology.manage`, `inventory.transfer`.
- `modules`: installed modules per organization with activation status.
- `activity_logs`: immutable audit events for user and workflow actions.
- `notifications`: shared alert center for approvals, finance events, inventory events, and admin notices.
- `transactions`: universal business events from sales, billing, procurement, subscriptions, and payments.
- `reports`: reusable report snapshots and analytics summaries for each module.

## Runtime Integration Layer

- `/api/erp` is the centralized tenant-scoped service for workflows, approval decisions, transactions, messages, permissions, reports, notifications, and audit records.
- `erp-client.js` is the shared browser client used by portals. It posts to `/api/erp` when a secure organization session exists and falls back to the local enterprise store during static preview.
- Canonical storage keys live in `api/_lib/erp-keys.js` so every module writes to the same names instead of creating duplicate schemas.
- Transaction writes are atomic through the shared KV store facade. Sales, pharmacy, hospital, restaurant, procurement, and technology events update shared finance, inventory, reporting, notification, and audit streams.

## Universal Catalog

- `categories`: custom product/service categories per organization.
- `attributes`: custom fields such as size, batch, dosage, class, room, unit, project type, subscription tier.
- `catalog_items`: products, services, subscriptions, assets, fees, menu items, medical services, school fees, rent, software packages.
- `catalog_item_attributes`: item-to-attribute values.
- `units`: pcs, kg, litre, hour, month, license, room, class, visit, session.
- `taxes`: tax rates, exemptions, withholding, VAT, service tax.
- `prices`: item pricing by branch, customer group, currency, date, and discount rules.

## Operations

- `stock_movements`: receiving, transfer, adjustment, sale, return, disposal.
- `production_orders`: manufacturing orders, work centers, bills of materials, raw material issues, quality checks, and finished goods receipts.
- `retail_operations`: POS sales, returns, discounts, register close, shelf stock, and customer purchase activity.
- `logistics_jobs`: dispatches, shipments, routes, fleets, delivery confirmations, exceptions, and delivery costing.
- `suppliers`: supplier records and performance.
- `customers`: clients, patients, students, tenants, parents, guests, companies.
- `invoices`: invoices for products, services, subscriptions, projects, rent, fees, or medical billing.
- `receipts`: payment receipts and reconciliation.
- `purchase_requests`: department purchase requests.
- `purchase_orders`: approved supplier orders.
- `workflow_requests`: generic approval pipeline for payroll, purchases, discounts, refunds, subscriptions, stock adjustments, and project billing.
- `messages`: department-to-department communication.
- `documents`: contracts, employee files, prescriptions, reports, project files, tenant leases.

## Technology Module

- `projects`: client projects, software builds, IT service jobs, implementation work.
- `tasks`: assignments, priorities, owners, due dates, status.
- `bugs`: issue tracking, severity, reproduction notes, fixes.
- `deployments`: release version, environment, approver, deployment state.
- `service_tickets`: technical support and SLA tracking.
- `subscriptions`: SaaS, hosting, maintenance, licenses, renewals.
- `documentation`: technical docs, meeting notes, implementation plans.

## Workflow Examples

- HR sends payroll to Finance. Finance approves, rejects, or returns with reason.
- Procurement sends large purchase requests to Finance.
- Sales reserves or deducts stock from Inventory.
- Retail POS sales deduct branch stock and update Finance and Reporting.
- Manufacturing production orders issue raw materials, create finished goods, and post production costs.
- Logistics deliveries update Sales, Customer Service, Inventory, and Finance when delivery costs apply.
- Pharmacy sends revenue and expiry reports to Finance and Inventory.
- Technology sends project milestones, deployment billing, and subscriptions to Finance.
- Agents register organizations, track onboarding, subscriptions, commissions, referrals, contracts, and support requests.
- Admin monitors organizations, roles, audit logs, module activation, backups, and subscriptions.
