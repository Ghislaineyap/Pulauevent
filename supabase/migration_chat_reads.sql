-- Migration: chat read-tracking, for unread-message badges in Connect's
-- chat lists and per-event chat buttons.
-- Run this once in Supabase's SQL Editor, on top of your existing database.

-- ---------------------------------------------------------------------------
-- One row per (user, chat) pair recording when that user last opened it.
-- Covers both chat kinds with one table rather than two near-identical ones:
-- 'personal' rows point at a matches.id (the 1:1 chat), 'event' rows point
-- at a job_postings.id (the group chat). A missing row just means "never
-- opened" — unread count then counts every message in that chat.
-- ---------------------------------------------------------------------------
create table if not exists public.chat_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_type text not null check (chat_type in ('personal', 'event')),
  chat_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, chat_type, chat_id)
);

alter table public.chat_reads enable row level security;

-- A user can only ever see/touch their own read-receipts — this table isn't
-- about who's in the chat, just what each person has personally seen.
create policy "a user can read their own chat_reads" on public.chat_reads
  for select using (auth.uid() = user_id);
create policy "a user can upsert their own chat_reads" on public.chat_reads
  for insert with check (auth.uid() = user_id);
create policy "a user can update their own chat_reads" on public.chat_reads
  for update using (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_reads'
  ) then
    alter publication supabase_realtime add table public.chat_reads;
  end if;
end $$;
