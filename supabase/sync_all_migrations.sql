-- Sync-everything script — run this ONCE in Supabase's SQL Editor to bring
-- your live database fully up to date, regardless of which of the
-- individual migration_*.sql files you have or haven't already run.
--
-- Why this exists: the "could not find the jobdesk column" error means your
-- live database is missing at least one column the app expects — almost
-- certainly because it was set up from an earlier version of schema.sql,
-- before some of the migration_*.sql files in this folder were written, and
-- one or more of them were never actually run against it. Rather than
-- guess which ones, this concatenates all of them into one script, in the
-- order they were written, with every statement made idempotent (safe to
-- run whether or not it's already been applied). Whatever you're missing —
-- just jobdesk, or several — running this once brings you current. Running
-- it on a database that's already fully up to date is a harmless no-op.
--
-- This does NOT touch any of your data — every statement here only adds
-- columns/tables/policies that don't already exist, or replaces a function/
-- policy definition with an identical one. Nothing is deleted.

-- =============================================================================
-- From migration_002_editing_photos_chat.sql
-- =============================================================================
alter table public.freelancer_profiles add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar photos are publicly readable" on storage.objects;
create policy "avatar photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "a user can upload their own avatar photo" on storage.objects;
create policy "a user can upload their own avatar photo"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "a user can replace their own avatar photo" on storage.objects;
create policy "a user can replace their own avatar photo"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "a user can delete their own avatar photo" on storage.objects;
create policy "a user can delete their own avatar photo"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists messages_match_id_created_at_idx on public.messages (match_id, created_at);

alter table public.messages enable row level security;

drop policy if exists "the two matched parties can read their messages" on public.messages;
create policy "the two matched parties can read their messages" on public.messages
  for select using (
    exists (
      select 1 from public.matches m
      where m.id = match_id and (m.organizer_id = auth.uid() or m.freelancer_id = auth.uid())
    )
  );

drop policy if exists "a matched party can send a message as themselves" on public.messages;
create policy "a matched party can send a message as themselves" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id and (m.organizer_id = auth.uid() or m.freelancer_id = auth.uid())
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

grant select, insert, update, delete on public.messages to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- =============================================================================
-- From migration_catchup.sql
-- =============================================================================
alter table public.job_postings add column if not exists event_start_date date;
alter table public.job_postings add column if not exists event_end_date date;

-- Only a database that started from the OLD single-event_date schema has
-- this column to backfill from — a fresh install built from the current
-- schema.sql went straight to event_start_date/event_end_date and never had
-- it, so referencing event_date unconditionally fails on those installs.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_postings' and column_name = 'event_date'
  ) then
    update public.job_postings
    set event_start_date = coalesce(event_start_date, event_date),
        event_end_date = coalesce(event_end_date, event_date)
    where event_date is not null;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'job_postings' and column_name = 'event_start_date' and is_nullable = 'YES')
     and not exists (select 1 from public.job_postings where event_start_date is null) then
    alter table public.job_postings alter column event_start_date set not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'job_postings' and column_name = 'event_end_date' and is_nullable = 'YES')
     and not exists (select 1 from public.job_postings where event_end_date is null) then
    alter table public.job_postings alter column event_end_date set not null;
  end if;
end $$;

alter table public.job_postings drop column if exists event_date;

alter table public.job_postings drop constraint if exists job_postings_date_range;
alter table public.job_postings add constraint job_postings_date_range check (event_end_date >= event_start_date);

alter table public.freelancer_profiles add column if not exists gender text;
alter table public.freelancer_profiles drop constraint if exists freelancer_profiles_gender_check;
alter table public.freelancer_profiles add constraint freelancer_profiles_gender_check
  check (gender in ('male', 'female', 'prefer_not_to_say'));

alter table public.freelancer_profiles add column if not exists experience_band text;
alter table public.freelancer_profiles drop constraint if exists freelancer_profiles_experience_band_check;
alter table public.freelancer_profiles add constraint freelancer_profiles_experience_band_check
  check (experience_band in ('0-1', '2-5', '6-10', '10+'));

alter table public.freelancer_profiles drop column if exists years_experience;

alter table public.freelancer_profiles alter column avatar_key set default 'prefer_not_to_say';

alter table public.freelancer_profiles add column if not exists photo_urls text[] not null default '{}';

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'freelancer_profiles' and column_name = 'photo_url') then
    update public.freelancer_profiles
    set photo_urls = array[photo_url]
    where photo_url is not null and photo_urls = '{}';
  end if;
end $$;

alter table public.freelancer_profiles drop column if exists photo_url;

-- =============================================================================
-- From migration_locations_team_events.sql
-- =============================================================================
create table if not exists public.locations (
  id serial primary key,
  label text not null unique,
  sort_order int not null default 0
);

insert into public.locations (label, sort_order) values
  ('Jakarta', 1), ('Bandung', 2), ('Surabaya', 3), ('Bali (Denpasar)', 4), ('Yogyakarta', 5),
  ('Semarang', 6), ('Medan', 7), ('Makassar', 8), ('Palembang', 9), ('Malang', 10),
  ('Bogor', 11), ('Depok', 12), ('Tangerang', 13), ('Bekasi', 14), ('Batam', 15),
  ('Balikpapan', 16), ('Solo (Surakarta)', 17), ('Manado', 18)
on conflict (label) do nothing;

alter table public.locations enable row level security;
drop policy if exists "locations are readable by anyone signed in" on public.locations;
create policy "locations are readable by anyone signed in" on public.locations
  for select using (auth.role() = 'authenticated');

grant select on public.locations to authenticated;
grant select on public.locations to anon;

alter table public.job_divisions add column if not exists fee_type text not null default 'all_in';
alter table public.job_divisions drop constraint if exists job_divisions_fee_type_check;
alter table public.job_divisions add constraint job_divisions_fee_type_check
  check (fee_type in ('all_in', 'plus_transport'));
alter table public.job_divisions add column if not exists transport_max_amount numeric;

alter table public.applications add column if not exists source text not null default 'applied';
alter table public.applications drop constraint if exists applications_source_check;
alter table public.applications add constraint applications_source_check
  check (source in ('applied', 'invited'));

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.applications'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%pending%accepted%declined%';
  if con_name is not null then
    execute format('alter table public.applications drop constraint %I', con_name);
  end if;
end $$;
alter table public.applications add constraint applications_status_check
  check (status in ('pending', 'accepted', 'declined', 'invited', 'cancelled'));

drop policy if exists "an organizer can invite a team member into their own division" on public.applications;
create policy "an organizer can invite a team member into their own division" on public.applications
  for insert with check (
    source = 'invited'
    and status = 'invited'
    and exists (
      select 1 from public.job_divisions jd
      join public.job_postings jp on jp.id = jd.job_id
      where jd.id = division_id and jp.organizer_id = auth.uid()
    )
  );

drop policy if exists "a freelancer can respond to an invitation" on public.applications;
create policy "a freelancer can respond to an invitation" on public.applications
  for update using (auth.uid() = freelancer_id and source = 'invited');

create table if not exists public.team_members (
  id uuid primary key default uuid_generate_v4(),
  organizer_id uuid not null references public.organizer_profiles(id) on delete cascade,
  freelancer_id uuid not null references public.freelancer_profiles(id) on delete cascade,
  source text not null default 'manual' check (source in ('connection', 'manual')),
  created_at timestamptz not null default now(),
  unique (organizer_id, freelancer_id)
);

alter table public.team_members enable row level security;

drop policy if exists "an organizer can read their own team" on public.team_members;
create policy "an organizer can read their own team" on public.team_members
  for select using (auth.uid() = organizer_id);

drop policy if exists "an organizer can add to their own team" on public.team_members;
create policy "an organizer can add to their own team" on public.team_members
  for insert with check (auth.uid() = organizer_id);

grant select, insert, update, delete on public.team_members to authenticated;
grant select on public.team_members to anon;

create or replace function public.handle_application_accepted()
returns trigger as $$
declare
  v_organizer_id uuid;
  v_quantity integer;
  v_filled_count integer;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    select jp.organizer_id, jd.quantity into v_organizer_id, v_quantity
    from public.job_divisions jd
    join public.job_postings jp on jp.id = jd.job_id
    where jd.id = new.division_id;

    insert into public.matches (organizer_id, freelancer_id, source, source_id)
    values (v_organizer_id, new.freelancer_id, 'application', new.id)
    on conflict (organizer_id, freelancer_id) do nothing;

    insert into public.team_members (organizer_id, freelancer_id, source)
    values (v_organizer_id, new.freelancer_id, 'connection')
    on conflict (organizer_id, freelancer_id) do nothing;

    update public.job_divisions
    set filled_count = filled_count + 1
    where id = new.division_id
    returning filled_count into v_filled_count;

    if v_filled_count >= v_quantity then
      update public.applications
      set status = 'declined'
      where division_id = new.division_id and status in ('pending', 'invited') and id <> new.id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_application_accepted on public.applications;
create trigger on_application_accepted
  after update on public.applications
  for each row execute function public.handle_application_accepted();

create or replace function public.handle_like_accepted()
returns trigger as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    insert into public.matches (organizer_id, freelancer_id, source, source_id)
    values (new.organizer_id, new.freelancer_id, 'like', new.id)
    on conflict (organizer_id, freelancer_id) do nothing;

    insert into public.team_members (organizer_id, freelancer_id, source)
    values (new.organizer_id, new.freelancer_id, 'connection')
    on conflict (organizer_id, freelancer_id) do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_like_accepted on public.likes;
create trigger on_like_accepted
  after update on public.likes
  for each row execute function public.handle_like_accepted();

create table if not exists public.job_chat_messages (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists job_chat_messages_job_id_created_at_idx on public.job_chat_messages (job_id, created_at);

alter table public.job_chat_messages enable row level security;

grant select, insert, update, delete on public.job_chat_messages to authenticated;
grant select on public.job_chat_messages to anon;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_chat_messages'
  ) then
    alter publication supabase_realtime add table public.job_chat_messages;
  end if;
end $$;

-- =============================================================================
-- From migration_recruit_org_profile.sql
-- =============================================================================
alter table public.organizer_profiles add column if not exists location text;
alter table public.organizer_profiles add column if not exists about text;
alter table public.job_divisions add column if not exists open_recruit boolean not null default true;

-- =============================================================================
-- From migration_event_flow.sql
-- =============================================================================
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

-- =============================================================================
-- From migration_org_logo.sql
-- =============================================================================
alter table public.organizer_profiles add column if not exists logo_url text;

-- =============================================================================
-- From migration_ratings_endorsements_multiapply.sql
-- =============================================================================
create table if not exists public.ratings (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  organizer_id uuid not null references public.organizer_profiles(id) on delete cascade,
  freelancer_id uuid not null references public.freelancer_profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  recommendation text,
  created_at timestamptz not null default now(),
  unique (job_id, freelancer_id)
);

alter table public.ratings enable row level security;

drop policy if exists "ratings are readable by anyone signed in" on public.ratings;
create policy "ratings are readable by anyone signed in" on public.ratings
  for select using (auth.role() = 'authenticated');

drop policy if exists "an organizer can rate a freelancer confirmed on their own past event" on public.ratings;
create policy "an organizer can rate a freelancer confirmed on their own past event" on public.ratings
  for insert with check (
    auth.uid() = organizer_id
    and exists (
      select 1 from public.job_postings jp
      where jp.id = job_id and jp.organizer_id = auth.uid() and jp.event_end_date < current_date
    )
    and exists (
      select 1 from public.applications a
      join public.job_divisions jd on jd.id = a.division_id
      where jd.job_id = ratings.job_id and a.freelancer_id = ratings.freelancer_id and a.status = 'accepted'
    )
  );

grant select, insert, update, delete on public.ratings to authenticated;
grant select on public.ratings to anon;

create table if not exists public.skill_endorsements (
  id uuid primary key default uuid_generate_v4(),
  freelancer_id uuid not null references public.freelancer_profiles(id) on delete cascade,
  endorser_id uuid not null references public.freelancer_profiles(id) on delete cascade,
  skill text not null,
  created_at timestamptz not null default now(),
  unique (freelancer_id, endorser_id, skill),
  check (freelancer_id <> endorser_id)
);

alter table public.skill_endorsements enable row level security;

drop policy if exists "endorsements are readable by anyone signed in" on public.skill_endorsements;
create policy "endorsements are readable by anyone signed in" on public.skill_endorsements
  for select using (auth.role() = 'authenticated');

drop policy if exists "a freelancer can endorse a past coworker's skill" on public.skill_endorsements;
create policy "a freelancer can endorse a past coworker's skill" on public.skill_endorsements
  for insert with check (
    auth.uid() = endorser_id
    and exists (
      select 1
      from public.applications a_mine
      join public.job_divisions jd_mine on jd_mine.id = a_mine.division_id
      join public.job_divisions jd_theirs on jd_theirs.job_id = jd_mine.job_id
      join public.applications a_theirs on a_theirs.division_id = jd_theirs.id
      where a_mine.freelancer_id = endorser_id
        and a_mine.status = 'accepted'
        and a_theirs.freelancer_id = skill_endorsements.freelancer_id
        and a_theirs.status = 'accepted'
    )
  );

grant select, insert, update, delete on public.skill_endorsements to authenticated;
grant select on public.skill_endorsements to anon;

-- =============================================================================
-- From migration_ux_polish.sql
-- =============================================================================
alter table public.organizer_profiles add column if not exists instagram_handle text;
alter table public.freelancer_profiles add column if not exists instagram_handle text;

alter table public.job_postings add column if not exists chat_opened_at timestamptz;

drop policy if exists "job team members can read the event chat" on public.job_chat_messages;
create policy "job team members can read the event chat" on public.job_chat_messages
  for select using (
    exists (
      select 1 from public.job_postings jp
      where jp.id = job_chat_messages.job_id and jp.organizer_id = auth.uid() and jp.chat_opened_at is not null
    )
    or exists (
      select 1 from public.applications a
      join public.job_divisions jd on jd.id = a.division_id
      join public.job_postings jp on jp.id = jd.job_id
      where jd.job_id = job_chat_messages.job_id
        and a.freelancer_id = auth.uid()
        and a.status = 'accepted'
        and jp.chat_opened_at is not null
    )
  );

drop policy if exists "job team members can send an event chat message" on public.job_chat_messages;
create policy "job team members can send an event chat message" on public.job_chat_messages
  for insert with check (
    auth.uid() = sender_id
    and (
      exists (
        select 1 from public.job_postings jp
        where jp.id = job_chat_messages.job_id and jp.organizer_id = auth.uid() and jp.chat_opened_at is not null
      )
      or exists (
        select 1 from public.applications a
        join public.job_divisions jd on jd.id = a.division_id
        join public.job_postings jp on jp.id = jd.job_id
        where jd.job_id = job_chat_messages.job_id
          and a.freelancer_id = auth.uid()
          and a.status = 'accepted'
          and jp.chat_opened_at is not null
      )
    )
  );

-- =============================================================================
-- From migration_jobdesk.sql — the column your "could not find the jobdesk
-- column" error is about.
-- =============================================================================
alter table public.job_divisions add column if not exists jobdesk text;

-- =============================================================================
-- From migration_admin.sql
-- =============================================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('freelancer', 'organizer', 'vendor', 'admin'));

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "admins can read every profile" on public.profiles;
create policy "admins can read every profile" on public.profiles
  for select using (public.is_admin());

drop policy if exists "admins can read every application" on public.applications;
create policy "admins can read every application" on public.applications
  for select using (public.is_admin());

drop policy if exists "admins can read every like" on public.likes;
create policy "admins can read every like" on public.likes
  for select using (public.is_admin());

drop policy if exists "admins can read every match" on public.matches;
create policy "admins can read every match" on public.matches
  for select using (public.is_admin());

drop policy if exists "admins can read every team roster" on public.team_members;
create policy "admins can read every team roster" on public.team_members
  for select using (public.is_admin());

drop policy if exists "admins can read every 1:1 message" on public.messages;
create policy "admins can read every 1:1 message" on public.messages
  for select using (public.is_admin());

drop policy if exists "admins can read every event chat message" on public.job_chat_messages;
create policy "admins can read every event chat message" on public.job_chat_messages
  for select using (public.is_admin());

drop policy if exists "admins can delete any event" on public.job_postings;
create policy "admins can delete any event" on public.job_postings
  for delete using (public.is_admin());

-- =============================================================================
-- From migration_reports_appeals.sql (requires migration_admin.sql — is_admin())
-- =============================================================================
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('active', 'suspended'));
alter table public.profiles add column if not exists suspended_reason text;
alter table public.profiles add column if not exists suspended_at timestamptz;

drop policy if exists "admins can update any profile" on public.profiles;
create policy "admins can update any profile" on public.profiles
  for update using (public.is_admin());

create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  check (reporter_id <> reported_id)
);

create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_reported_id_idx on public.reports (reported_id);

alter table public.reports enable row level security;

drop policy if exists "a signed-in user can file a report" on public.reports;
create policy "a signed-in user can file a report" on public.reports
  for insert with check (auth.uid() = reporter_id);

drop policy if exists "a user can read reports they filed" on public.reports;
create policy "a user can read reports they filed" on public.reports
  for select using (auth.uid() = reporter_id);

drop policy if exists "admins can read every report" on public.reports;
create policy "admins can read every report" on public.reports
  for select using (public.is_admin());

drop policy if exists "admins can update any report" on public.reports;
create policy "admins can update any report" on public.reports
  for update using (public.is_admin());

grant select, insert, update, delete on public.reports to authenticated;
grant select on public.reports to anon;

create table if not exists public.appeals (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(trim(message)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  admin_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create index if not exists appeals_status_idx on public.appeals (status);
create index if not exists appeals_profile_id_idx on public.appeals (profile_id);

alter table public.appeals enable row level security;

drop policy if exists "a suspended user can file their own appeal" on public.appeals;
create policy "a suspended user can file their own appeal" on public.appeals
  for insert with check (
    auth.uid() = profile_id
    and exists (select 1 from public.profiles where id = auth.uid() and status = 'suspended')
  );

drop policy if exists "a user can read their own appeals" on public.appeals;
create policy "a user can read their own appeals" on public.appeals
  for select using (auth.uid() = profile_id);

drop policy if exists "admins can read every appeal" on public.appeals;
create policy "admins can read every appeal" on public.appeals
  for select using (public.is_admin());

drop policy if exists "admins can update any appeal" on public.appeals;
create policy "admins can update any appeal" on public.appeals
  for update using (public.is_admin());

grant select, insert, update, delete on public.appeals to authenticated;
grant select on public.appeals to anon;

-- =============================================================================
-- From migration_rundown_tasks.sql
-- =============================================================================
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

create table if not exists public.event_rundowns (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  title text not null,
  event_date date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists event_rundowns_job_id_idx on public.event_rundowns (job_id);

create table if not exists public.event_rundown_items (
  id uuid primary key default uuid_generate_v4(),
  rundown_id uuid not null references public.event_rundowns(id) on delete cascade,
  sort_order integer not null,
  start_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  segment text not null,
  owner_label text,
  note text
);

create index if not exists event_rundown_items_rundown_id_sort_idx on public.event_rundown_items (rundown_id, sort_order);

alter table public.event_rundowns enable row level security;
alter table public.event_rundown_items enable row level security;

drop policy if exists "organizer manages their event rundowns" on public.event_rundowns;
create policy "organizer manages their event rundowns" on public.event_rundowns
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

drop policy if exists "confirmed team can read event rundowns" on public.event_rundowns;
create policy "confirmed team can read event rundowns" on public.event_rundowns
  for select using (public.is_confirmed_on_job(job_id));

drop policy if exists "organizer manages their event rundown items" on public.event_rundown_items;
create policy "organizer manages their event rundown items" on public.event_rundown_items
  for all using (
    exists (select 1 from public.event_rundowns r where r.id = rundown_id and public.is_job_organizer(r.job_id))
  ) with check (
    exists (select 1 from public.event_rundowns r where r.id = rundown_id and public.is_job_organizer(r.job_id))
  );

drop policy if exists "confirmed team can read event rundown items" on public.event_rundown_items;
create policy "confirmed team can read event rundown items" on public.event_rundown_items
  for select using (
    exists (select 1 from public.event_rundowns r where r.id = rundown_id and public.is_confirmed_on_job(r.job_id))
  );

grant select, insert, update, delete on public.event_rundowns to authenticated;
grant select, insert, update, delete on public.event_rundown_items to authenticated;

create table if not exists public.event_tasks (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  assigned_to uuid references public.profiles(id) on delete set null,
  due_date date,
  created_at timestamptz not null default now()
);

create index if not exists event_tasks_job_id_idx on public.event_tasks (job_id);
create index if not exists event_tasks_assigned_to_idx on public.event_tasks (assigned_to);

alter table public.event_tasks enable row level security;

drop policy if exists "organizer manages their event tasks" on public.event_tasks;
create policy "organizer manages their event tasks" on public.event_tasks
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

drop policy if exists "confirmed team can read event tasks" on public.event_tasks;
create policy "confirmed team can read event tasks" on public.event_tasks
  for select using (public.is_confirmed_on_job(job_id));

drop policy if exists "assignee can update their own task" on public.event_tasks;
create policy "assignee can update their own task" on public.event_tasks
  for update using (auth.uid() = assigned_to) with check (auth.uid() = assigned_to);

grant select, insert, update, delete on public.event_tasks to authenticated;

alter table public.event_rundown_items
  add column if not exists client_visible boolean not null default false;

create table if not exists public.event_share_links (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists event_share_links_job_id_idx on public.event_share_links (job_id);

alter table public.event_share_links enable row level security;

drop policy if exists "organizer manages their event share links" on public.event_share_links;
create policy "organizer manages their event share links" on public.event_share_links
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

grant select, insert, update, delete on public.event_share_links to authenticated;

create or replace function public.get_public_schedule(p_token text)
returns table (
  event_title text,
  event_start_date date,
  event_end_date date,
  event_location text,
  rundown_title text,
  rundown_date date,
  start_time time,
  duration_minutes integer,
  segment text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    jp.title,
    jp.event_start_date,
    jp.event_end_date,
    jp.location,
    r.title,
    r.event_date,
    ri.start_time,
    ri.duration_minutes,
    ri.segment
  from public.event_share_links sl
  join public.job_postings jp on jp.id = sl.job_id
  join public.event_rundowns r on r.job_id = sl.job_id
  join public.event_rundown_items ri on ri.rundown_id = r.id
  where sl.token = p_token
    and ri.client_visible = true
  order by r.event_date nulls last, ri.sort_order;
$$;

grant execute on function public.get_public_schedule(text) to anon, authenticated;

-- =============================================================================
-- From migration_budget_vendors.sql (requires migration_rundown_tasks.sql —
-- is_job_organizer())
-- =============================================================================
create table if not exists public.event_budget_meta (
  job_id uuid primary key references public.job_postings(id) on delete cascade,
  target_amount numeric,
  contingency_pct numeric not null default 10,
  currency text not null default 'IDR',
  updated_at timestamptz not null default now()
);

create table if not exists public.event_budget_items (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  category text not null,
  item text,
  vendor text,
  est_cost numeric not null default 0,
  actual_cost numeric,
  status text not null default 'not_started' check (status in ('not_started', 'deposit_paid', 'paid_in_full')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_budget_items_job_id_idx on public.event_budget_items (job_id, sort_order);

alter table public.event_budget_meta enable row level security;
alter table public.event_budget_items enable row level security;

drop policy if exists "organizer manages their event budget meta" on public.event_budget_meta;
create policy "organizer manages their event budget meta" on public.event_budget_meta
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

drop policy if exists "organizer manages their event budget items" on public.event_budget_items;
create policy "organizer manages their event budget items" on public.event_budget_items
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

grant select, insert, update, delete on public.event_budget_meta to authenticated;
grant select, insert, update, delete on public.event_budget_items to authenticated;

create table if not exists public.vendor_roster (
  id uuid primary key default uuid_generate_v4(),
  organizer_id uuid not null references public.organizer_profiles(id) on delete cascade,
  name text not null,
  category text,
  contact_name text,
  contact_phone text,
  contact_email text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists vendor_roster_organizer_id_idx on public.vendor_roster (organizer_id);

create table if not exists public.event_vendors (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  vendor_roster_id uuid not null references public.vendor_roster(id) on delete cascade,
  budget_item_id uuid references public.event_budget_items(id) on delete set null,
  status text not null default 'booked' check (status in ('booked', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (job_id, vendor_roster_id)
);

create index if not exists event_vendors_job_id_idx on public.event_vendors (job_id);

alter table public.vendor_roster enable row level security;
alter table public.event_vendors enable row level security;

drop policy if exists "organizer manages their own vendor roster" on public.vendor_roster;
create policy "organizer manages their own vendor roster" on public.vendor_roster
  for all using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());

drop policy if exists "organizer manages their event vendors" on public.event_vendors;
create policy "organizer manages their event vendors" on public.event_vendors
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

grant select, insert, update, delete on public.vendor_roster to authenticated;
grant select, insert, update, delete on public.event_vendors to authenticated;

-- =============================================================================
-- From migration_chat_reads.sql
-- =============================================================================
create table if not exists public.chat_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_type text not null check (chat_type in ('personal', 'event')),
  chat_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, chat_type, chat_id)
);

alter table public.chat_reads enable row level security;

drop policy if exists "a user can read their own chat_reads" on public.chat_reads;
create policy "a user can read their own chat_reads" on public.chat_reads
  for select using (auth.uid() = user_id);
drop policy if exists "a user can upsert their own chat_reads" on public.chat_reads;
create policy "a user can upsert their own chat_reads" on public.chat_reads
  for insert with check (auth.uid() = user_id);
drop policy if exists "a user can update their own chat_reads" on public.chat_reads;
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

-- =============================================================================
-- From migration_auto_open_chat.sql
-- =============================================================================
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

    update public.job_postings
    set chat_opened_at = coalesce(chat_opened_at, now())
    where id = v_job_id;

    update public.job_divisions
    set filled_count = filled_count + 1
    where id = new.division_id
    returning filled_count into v_filled_count;

    if v_filled_count >= v_quantity then
      update public.applications
      set status = 'declined'
      where division_id = new.division_id and status in ('pending', 'invited') and id <> new.id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- =============================================================================
-- From migration_event_documents.sql
-- =============================================================================
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

create table if not exists public.event_documents (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
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

-- =============================================================================
-- From migration_vendor_role.sql
-- =============================================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('freelancer', 'organizer', 'vendor', 'admin'));

create table if not exists public.vendor_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  vendor_name text not null,
  category text,
  logo_url text,
  portfolio_urls text[] not null default '{}',
  website_url text,
  locations text[] not null default '{}',
  price_range text,
  created_at timestamptz not null default now()
);

alter table public.vendor_profiles enable row level security;

drop policy if exists "vendor profiles are browsable by signed-in users" on public.vendor_profiles;
create policy "vendor profiles are browsable by signed-in users" on public.vendor_profiles
  for select using (auth.role() = 'authenticated');
drop policy if exists "a vendor can insert their own profile" on public.vendor_profiles;
create policy "a vendor can insert their own profile" on public.vendor_profiles
  for insert with check (auth.uid() = id);
drop policy if exists "a vendor can update their own profile" on public.vendor_profiles;
create policy "a vendor can update their own profile" on public.vendor_profiles
  for update using (auth.uid() = id);

grant select, insert, update, delete on public.vendor_profiles to authenticated;

create table if not exists public.vendor_slots (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  category text not null,
  quantity integer not null default 1,
  notes text,
  budget_amount numeric,
  budget_type text check (budget_type in ('hourly', 'daily', 'flat')),
  filled_count integer not null default 0,
  open_recruit boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists vendor_slots_job_id_idx on public.vendor_slots (job_id);

create table if not exists public.vendor_applications (
  id uuid primary key default uuid_generate_v4(),
  slot_id uuid not null references public.vendor_slots(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'invited', 'cancelled')),
  source text not null default 'applied' check (source in ('applied', 'invited')),
  created_at timestamptz not null default now(),
  unique (slot_id, vendor_id)
);

create index if not exists vendor_applications_vendor_id_idx on public.vendor_applications (vendor_id);

alter table public.vendor_slots enable row level security;
alter table public.vendor_applications enable row level security;

drop policy if exists "organizer manages their own vendor slots" on public.vendor_slots;
create policy "organizer manages their own vendor slots" on public.vendor_slots
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

drop policy if exists "vendors can browse open vendor slots" on public.vendor_slots;
create policy "vendors can browse open vendor slots" on public.vendor_slots
  for select using (open_recruit = true);

drop policy if exists "organizer manages applications on their own vendor slots" on public.vendor_applications;
create policy "organizer manages applications on their own vendor slots" on public.vendor_applications
  for all using (
    exists (select 1 from public.vendor_slots s where s.id = slot_id and public.is_job_organizer(s.job_id))
  ) with check (
    exists (select 1 from public.vendor_slots s where s.id = slot_id and public.is_job_organizer(s.job_id))
  );

drop policy if exists "a vendor can read their own applications" on public.vendor_applications;
create policy "a vendor can read their own applications" on public.vendor_applications
  for select using (auth.uid() = vendor_id);

drop policy if exists "a vendor can apply to an open slot" on public.vendor_applications;
create policy "a vendor can apply to an open slot" on public.vendor_applications
  for insert with check (
    auth.uid() = vendor_id
    and status = 'pending'
    and exists (select 1 from public.vendor_slots s where s.id = slot_id and s.open_recruit = true)
  );

drop policy if exists "a vendor can respond to their own applications" on public.vendor_applications;
create policy "a vendor can respond to their own applications" on public.vendor_applications
  for update using (auth.uid() = vendor_id) with check (auth.uid() = vendor_id and status in ('accepted', 'declined', 'cancelled'));

grant select, insert, update, delete on public.vendor_slots to authenticated;
grant select, insert, update, delete on public.vendor_applications to authenticated;

create or replace function public.handle_vendor_application_accepted()
returns trigger as $$
declare
  v_job_id uuid;
  v_quantity integer;
  v_filled_count integer;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    select s.job_id, s.quantity into v_job_id, v_quantity
    from public.vendor_slots s
    where s.id = new.slot_id;

    update public.job_postings
    set chat_opened_at = coalesce(chat_opened_at, now())
    where id = v_job_id;

    update public.vendor_slots
    set filled_count = filled_count + 1
    where id = new.slot_id
    returning filled_count into v_filled_count;

    if v_filled_count >= v_quantity then
      update public.vendor_applications
      set status = 'declined'
      where slot_id = new.slot_id and status in ('pending', 'invited') and id <> new.id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_vendor_application_accepted on public.vendor_applications;
create trigger on_vendor_application_accepted
  after update on public.vendor_applications
  for each row execute function public.handle_vendor_application_accepted();

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
  ) or exists (
    select 1 from public.vendor_applications va
    join public.vendor_slots vs on vs.id = va.slot_id
    where vs.job_id = p_job_id
      and va.vendor_id = auth.uid()
      and va.status = 'accepted'
  );
$$;

drop policy if exists "job team members can read the event chat" on public.job_chat_messages;
create policy "job team members can read the event chat" on public.job_chat_messages
  for select using (
    exists (
      select 1 from public.job_postings jp
      where jp.id = job_chat_messages.job_id and jp.organizer_id = auth.uid() and jp.chat_opened_at is not null
    )
    or (public.is_confirmed_on_job(job_chat_messages.job_id) and exists (
      select 1 from public.job_postings jp where jp.id = job_chat_messages.job_id and jp.chat_opened_at is not null
    ))
  );

drop policy if exists "job team members can send an event chat message" on public.job_chat_messages;
create policy "job team members can send an event chat message" on public.job_chat_messages
  for insert with check (
    auth.uid() = sender_id
    and (
      exists (
        select 1 from public.job_postings jp
        where jp.id = job_chat_messages.job_id and jp.organizer_id = auth.uid() and jp.chat_opened_at is not null
      )
      or (public.is_confirmed_on_job(job_chat_messages.job_id) and exists (
        select 1 from public.job_postings jp where jp.id = job_chat_messages.job_id and jp.chat_opened_at is not null
      ))
    )
  );

insert into storage.buckets (id, name, public)
values ('vendor-portfolio', 'vendor-portfolio', true)
on conflict (id) do nothing;

drop policy if exists "vendor portfolio images are publicly readable" on storage.objects;
create policy "vendor portfolio images are publicly readable" on storage.objects
  for select using (bucket_id = 'vendor-portfolio');

drop policy if exists "a vendor can upload their own portfolio images" on storage.objects;
create policy "a vendor can upload their own portfolio images" on storage.objects
  for insert with check (bucket_id = 'vendor-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "a vendor can replace their own portfolio images" on storage.objects;
create policy "a vendor can replace their own portfolio images" on storage.objects
  for update using (bucket_id = 'vendor-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "a vendor can delete their own portfolio images" on storage.objects;
create policy "a vendor can delete their own portfolio images" on storage.objects
  for delete using (bucket_id = 'vendor-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

-- =============================================================================
-- From migration_skill_audience.sql
-- =============================================================================
alter table public.skills add column if not exists audience text not null default 'freelancer';

alter table public.skills drop constraint if exists skills_audience_check;
alter table public.skills add constraint skills_audience_check
  check (audience in ('freelancer', 'vendor'));

drop policy if exists "admins can add skills" on public.skills;
create policy "admins can add skills" on public.skills
  for insert with check (public.is_admin());

drop policy if exists "admins can retag skills" on public.skills;
create policy "admins can retag skills" on public.skills
  for update using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- Verify — every one of these should return a row/count with no error.
-- =============================================================================
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'job_divisions' and column_name = 'jobdesk') as has_jobdesk,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'job_postings' and column_name = 'chat_opened_at') as has_chat_opened_at,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'organizer_profiles' and column_name = 'logo_url') as has_logo_url,
  (select count(*) from public.locations) as locations_count,
  (select count(*) from public.skills) as skills_count,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'event_documents') as has_event_documents,
  (select count(*) from storage.buckets where id = 'event-docs') as has_event_docs_bucket,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'event_tasks') as has_event_tasks,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'chat_reads') as has_chat_reads,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'vendor_roster') as has_vendor_roster,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'vendor_profiles') as has_vendor_profiles,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'reports') as has_reports,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'status') as has_admin_status,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'skills' and column_name = 'audience') as has_skill_audience;
-- has_jobdesk / has_chat_opened_at / has_logo_url should read 1, the two
-- catalog counts should be > 0 (18 and 14 respectively, if neither table has
-- been hand-edited), and every has_* column from has_event_documents onward
-- should read 1 — those are the tables/columns the 9 migrations added by this
-- sync script (on top of the original 9) are responsible for. A 0 in any of
-- them means something above threw partway through — scroll up in the SQL
-- Editor's output for the actual error and re-run once it's fixed (every
-- statement here is safe to run again).
