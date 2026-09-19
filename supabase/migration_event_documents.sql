-- Migration: replaces the Rundown + Share-with-client features with a much
-- simpler "Documents" tab — the organizer uploads files (contract, floor
-- plan, run-of-show as a PDF, whatever), the confirmed team (and, unlike
-- Rundown, there's no separate public client link) can view/download them.
-- Run this once in Supabase's SQL Editor, on top of the existing schema.
-- Safe to re-run.
--
-- This intentionally does NOT drop event_rundowns / event_rundown_items /
-- event_share_links / get_public_schedule — any rundown data an organizer
-- already built stays in the database untouched, it's just no longer
-- surfaced anywhere in the app. Drop them later in a separate cleanup pass
-- once you're sure nothing needs to be recovered from them.

-- Same two security-definer helpers migration_rundown_tasks.sql defined —
-- re-declared here (idempotent, "create or replace") so this migration
-- doesn't have a hard ordering dependency on that one having run first.
create or replace function public.is_job_organizer(p_job_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.job_postings jp
    where jp.id = p_job_id and jp.organizer_id = auth.uid()
  );
$$;

create or replace function public.is_confirmed_on_job(p_job_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.applications a
    join public.job_divisions jd on jd.id = a.division_id
    where jd.job_id = p_job_id
      and a.freelancer_id = auth.uid()
      and a.status = 'accepted'
  );
$$;

-- ---------------------------------------------------------------------------
-- event_documents: one row per uploaded file. storage_path encodes the job
-- id as its first folder segment ("{job_id}/{uuid}-{filename}") so the
-- storage policies below can key off it directly, the same trick
-- event-scoped storage would otherwise need a join for.
-- ---------------------------------------------------------------------------
create table if not exists public.event_documents (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null, -- original filename, for display — storage_path is deduped/sanitized
  mime_type text,
  file_size bigint,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists event_documents_job_id_idx on public.event_documents (job_id);

alter table public.event_documents enable row level security;

drop policy if exists "organizer manages their event documents" on public.event_documents;
create policy "organizer manages their event documents" on public.event_documents
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

drop policy if exists "confirmed team can read event documents" on public.event_documents;
create policy "confirmed team can read event documents" on public.event_documents
  for select using (public.is_confirmed_on_job(job_id));

grant select, insert, update, delete on public.event_documents to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: a PRIVATE bucket (unlike "avatars") — these can be contracts,
-- invoices, floor plans, so there's no reason for them to be publicly
-- readable by URL guessing. Access is via short-lived signed URLs the app
-- requests on demand, which Supabase only issues if the requesting user's
-- storage policy (below) actually grants them select on that object.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('event-docs', 'event-docs', false)
on conflict (id) do nothing;

drop policy if exists "organizer manages their event document files" on storage.objects;
create policy "organizer manages their event document files" on storage.objects
  for all
  using (bucket_id = 'event-docs' and public.is_job_organizer(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'event-docs' and public.is_job_organizer(((storage.foldername(name))[1])::uuid));

drop policy if exists "confirmed team can read event document files" on storage.objects;
create policy "confirmed team can read event document files" on storage.objects
  for select
  using (bucket_id = 'event-docs' and public.is_confirmed_on_job(((storage.foldername(name))[1])::uuid));
