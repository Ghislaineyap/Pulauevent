-- Differentiates the shared "skills" catalog between freelancer roles and
-- vendor categories, so recruiting a freelancer and booking a vendor don't
-- overlap for entries like Photographer/Videographer/Decorator/Caterer,
-- which read as both a freelance role and a vendor category. Run this once
-- in Supabase: Project → SQL Editor → New query → paste → Run. Safe to
-- re-run. Requires migration_admin.sql to already be applied (uses
-- public.is_admin()).
--
-- Every existing row defaults to 'freelancer' — nothing disappears from any
-- picker until an admin deliberately retags a row from the new Skills tab
-- in the Admin Dashboard.

alter table public.skills add column if not exists audience text not null default 'freelancer';

alter table public.skills drop constraint if exists skills_audience_check;
alter table public.skills add constraint skills_audience_check
  check (audience in ('freelancer', 'vendor'));

-- ---------------------------------------------------------------------------
-- The skills table previously had no insert/update policy at all — every
-- row came from the one seed insert in schema.sql, so nothing but a direct
-- SQL connection could ever add or retag one. The new admin Skills tab
-- needs both.
-- ---------------------------------------------------------------------------
drop policy if exists "admins can add skills" on public.skills;
create policy "admins can add skills" on public.skills
  for insert with check (public.is_admin());

drop policy if exists "admins can retag skills" on public.skills;
create policy "admins can retag skills" on public.skills
  for update using (public.is_admin()) with check (public.is_admin());
