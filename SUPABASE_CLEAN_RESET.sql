-- BYTEWAAVE / MAPPHEX clean production reset
-- Run this only when you intentionally want an empty Supabase ERP database.
-- It removes all application organizations, users, workflows, reports, and KV data.

begin;

truncate table public.mapphex_kv restart identity cascade;
truncate table public.mapphex_organizations restart identity cascade;
truncate table public.mapphex_activity_events restart identity cascade;
truncate table public.mapphex_files restart identity cascade;

-- Optional: remove uploaded document objects from the private bucket.
-- Supabase Storage object cleanup can also be done from the Storage UI.
delete from storage.objects where bucket_id = 'mapphex-documents';

commit;
