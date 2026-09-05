-- Migration: event creation flow rework. Run once in Supabase's SQL Editor.
--
-- 1. Job postings gain a free-text "Detailed location" (venue/address) field,
--    separate from the curated Location dropdown used for filtering.
-- 2. Applications gain a 'cancelled' status — distinct from 'declined' — for
--    a confirmed team member who's removed after being accepted (e.g. they
--    drop out, or the organizer swaps them out). A trigger frees up their
--    division's slot so it can be filled again (by another team invite, or
--    publicly if "Open recruit" is on) without any extra manual step.

alter table public.job_postings add column if not exists location_detail text;

alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status in ('pending', 'accepted', 'declined', 'invited', 'cancelled'));

create or replace function public.handle_application_cancelled()
returns trigger as $$
begin
  if new.status = 'cancelled' and old.status = 'accepted' then
    update public.job_divisions
    set filled_count = greatest(filled_count - 1, 0)
    where id = new.division_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_application_cancelled on public.applications;
create trigger on_application_cancelled
  after update on public.applications
  for each row execute function public.handle_application_cancelled();
