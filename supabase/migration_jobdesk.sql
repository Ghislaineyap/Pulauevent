-- Migration: per-division jobdesk. Run once in Supabase's SQL Editor.
-- What someone in this role will actually do — shown to applicants so they
-- understand the job before applying, not just the role title and headcount.
alter table public.job_divisions add column if not exists jobdesk text;
