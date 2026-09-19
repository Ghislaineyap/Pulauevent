-- Migration: accepting a freelancer onto an event automatically opens that
-- event's team chat, instead of requiring the organizer to flip the "Event
-- chat" switch separately after confirming their team.
-- Run this once in Supabase's SQL Editor, on top of your existing database.

-- Re-defines the same trigger function from schema.sql/migration_event_flow.sql,
-- adding one more effect when an application flips to 'accepted': open the
-- job's chat if it isn't already open. The manual "Event chat" switch in My
-- Event still works exactly as before — an organizer can still turn it back
-- off (e.g. to swap someone out) and it won't reopen itself on its own.
create or replace function public.handle_application_accepted()
returns trigger as $$
declare
  v_organizer_id uuid;
  v_job_id uuid;
  v_quantity integer;
  v_filled_count integer;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    select jp.organizer_id, jp.id, jd.quantity into v_organizer_id, v_job_id, v_quantity
    from public.job_divisions jd
    join public.job_postings jp on jp.id = jd.job_id
    where jd.id = new.division_id;

    insert into public.matches (organizer_id, freelancer_id, source, source_id)
    values (v_organizer_id, new.freelancer_id, 'application', new.id)
    on conflict (organizer_id, freelancer_id) do nothing;

    insert into public.team_members (organizer_id, freelancer_id, source)
    values (v_organizer_id, new.freelancer_id, 'connection')
    on conflict (organizer_id, freelancer_id) do nothing;

    -- Being accepted means you're on the team — get straight into the group
    -- chat instead of waiting on the organizer to remember to switch it on.
    update public.job_postings
    set chat_opened_at = coalesce(chat_opened_at, now())
    where id = v_job_id;

    update public.job_divisions
    set filled_count = filled_count + 1
    where id = new.division_id
    returning filled_count into v_filled_count;

    -- A division can need more than one person. Once enough are accepted to
    -- fill it, auto-decline everyone else still pending OR invited for the
    -- same role so the organizer doesn't have to clean up manually.
    if v_filled_count >= v_quantity then
      update public.applications
      set status = 'declined'
      where division_id = new.division_id and status in ('pending', 'invited') and id <> new.id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Function body changed in place — the existing on_application_accepted
-- trigger already points at it, so no need to touch the trigger itself.
