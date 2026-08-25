-- Migration 002: profile editing (no schema change needed), real photo
-- uploads, and in-app chat.
--
-- Run this ONCE in Supabase's SQL Editor, on top of your existing database.
-- Do NOT re-run the full schema.sql — several of its statements (like
-- `create policy`) aren't safe to run twice and will error on duplicates.
-- This file only contains what's new since your last migration.

-- ---------------------------------------------------------------------------
-- 1. Real photo uploads
-- ---------------------------------------------------------------------------
alter table public.freelancer_profiles add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "a user can upload their own avatar photo"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "a user can replace their own avatar photo"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "a user can delete their own avatar photo"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 2. In-app chat
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists messages_match_id_created_at_idx on public.messages (match_id, created_at);

alter table public.messages enable row level security;

create policy "the two matched parties can read their messages" on public.messages
  for select using (
    exists (
      select 1 from public.matches m
      where m.id = match_id and (m.organizer_id = auth.uid() or m.freelancer_id = auth.uid())
    )
  );

create policy "a matched party can send a message as themselves" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id and (m.organizer_id = auth.uid() or m.freelancer_id = auth.uid())
    )
  );

-- Live delivery: add messages to Supabase's realtime publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Same base-grant fix as before, extended to the new table.
grant select, insert, update, delete on public.messages to authenticated;
grant usage, select on all sequences in schema public to authenticated;
