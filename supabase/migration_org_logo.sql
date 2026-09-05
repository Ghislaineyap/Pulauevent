-- Migration: organizer logo. Run once in Supabase's SQL Editor.
alter table public.organizer_profiles add column if not exists logo_url text;
