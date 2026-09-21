// Shared price-range formatting for vendor_profiles.price_range_min/_max
// (numeric, both optional). Used everywhere a vendor's price range is
// displayed to an organizer (VendorBrowse, VendorProfileDetail) so the
// four min/max/both/neither cases render identically everywhere.
export function formatPriceRange(min, max) {
  const hasMin = min != null && min !== ''
  const hasMax = max != null && max !== ''
  if (!hasMin && !hasMax) return ''
  const fmt = (n) => Number(n).toLocaleString('id-ID')
  if (hasMin && hasMax) return `Rp ${fmt(min)} – Rp ${fmt(max)}`
  if (hasMin) return `From Rp ${fmt(min)}`
  return `Up to Rp ${fmt(max)}`
}
