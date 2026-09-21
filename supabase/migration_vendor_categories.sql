-- Moves the vendor category list out of a hardcoded JS constant
-- (VENDOR_CATEGORIES in VendorRoster.jsx) into its own table, same pattern
-- as the existing "skills" and "locations" catalogs — so an admin can add a
-- new category from the Admin Dashboard instead of needing a code change
-- and a redeploy. Run this once in Supabase: Project → SQL Editor → New
-- query → paste → Run. Safe to re-run. Requires migration_admin.sql to
-- already be applied (uses public.is_admin()).

create table if not exists public.vendor_categories (
  id serial primary key,
  label text not null unique,
  sort_order int not null default 0
);

-- Seeded with the exact list VENDOR_CATEGORIES already had, in the same
-- order, so nothing changes for any existing vendor profile or organizer
-- filter the moment this runs.
insert into public.vendor_categories (label, sort_order) values
  ('Venue & Rentals', 1), ('Catering & Beverage', 2), ('Décor & Styling', 3),
  ('Entertainment & AV', 4), ('Photography & Video', 5), ('Staffing & Labor', 6),
  ('Transportation & Logistics', 7), ('Marketing & Print', 8), ('Beauty & Attire', 9),
  ('Gifts & Favors', 10), ('Technology & Equipment', 11), ('Other', 12)
on conflict (label) do nothing;

alter table public.vendor_categories enable row level security;

drop policy if exists "vendor categories are readable by anyone signed in" on public.vendor_categories;
create policy "vendor categories are readable by anyone signed in" on public.vendor_categories
  for select using (auth.role() = 'authenticated');

drop policy if exists "admins can add vendor categories" on public.vendor_categories;
create policy "admins can add vendor categories" on public.vendor_categories
  for insert with check (public.is_admin());

drop policy if exists "admins can edit vendor categories" on public.vendor_categories;
create policy "admins can edit vendor categories" on public.vendor_categories
  for update using (public.is_admin()) with check (public.is_admin());
