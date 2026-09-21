-- Splits vendor_profiles.price_range (a single free-text field like
-- "Rp 5jt–15jt" or "Contact for quote") into two numeric columns, min and
-- max, so a vendor picks an actual range instead of typing one out and an
-- organizer can eventually sort/filter by it. Run this once in Supabase:
-- Project → SQL Editor → New query → paste → Run. Safe to re-run.
--
-- The old price_range column is left in place (not dropped) so no existing
-- vendor's data is lost — it just stops being read or written by the app
-- going forward in favor of price_range_min/price_range_max.

alter table public.vendor_profiles add column if not exists price_range_min numeric;
alter table public.vendor_profiles add column if not exists price_range_max numeric;
