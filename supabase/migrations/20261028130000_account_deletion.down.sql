-- Undo 20261028130000_account_deletion.sql.
drop function if exists public.prepare_account_deletion(uuid);
drop function if exists public.get_account_deletion_preview();
drop function if exists public.account_deletion_plan(uuid);
