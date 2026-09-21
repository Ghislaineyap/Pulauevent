import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { ProfileAvatar } from '../../components/ProfileAvatar'
import { InfoButton } from '../../components/InfoButton'
import { IconStore } from '../../components/TabIcons'

// Item 9 (revised 2026-09-20): Team is now purely the connected-roster
// directory — no applicant review here at all. The review board this page
// used to carry (ported from the old OrganizerDashboard/Post) moved back to
// the per-event workspace: freelancer divisions get a "Review applicants"
// link next to Select team/Recruiting (see ManageEventView in MyEvents.jsx),
// and vendor slots got their inline Accept/Decline back on the Vendors tab
// (see VendorRecruitPanel in VendorsView.jsx). That keeps recruiting/review
// scoped to the event it's for, same as Select team/Recruiting already are,
// rather than duplicated on a second, event-agnostic page.
export default function Team() {
  const { user } = useAuth()
  const [tab, setTab] = useState('people') // 'people' | 'vendors'
  const [connectedPeople, setConnectedPeople] = useState([])
  const [connectedVendors, setConnectedVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase
        .from('team_members')
        .select('freelancer_id, freelancer_profiles(id, name, gender, avatar_key, photo_urls, skills, locations)')
        .eq('organizer_id', user.id)
        .order('created_at', { ascending: false }),
      // RLS on vendor_applications already scopes rows to slots on this
      // organizer's own jobs, so no explicit organizer filter is needed here.
      supabase
        .from('vendor_applications')
        .select('id, vendor_profiles(id, vendor_name, category, logo_url, locations)')
        .eq('status', 'accepted'),
    ]).then(([peopleRes, vendorRes]) => {
      if (peopleRes.error) console.error(peopleRes.error)
      if (vendorRes.error) console.error(vendorRes.error)
      setConnectedPeople((peopleRes.data || []).map((t) => t.freelancer_profiles).filter(Boolean))

      // A vendor can be accepted onto more than one slot/event — dedupe so
      // "your team" lists each vendor once regardless of how many events
      // they're booked on.
      const seen = new Set()
      const vendors = []
      ;(vendorRes.data || []).forEach((a) => {
        const v = a.vendor_profiles
        if (v && !seen.has(v.id)) {
          seen.add(v.id)
          vendors.push(v)
        }
      })
      setConnectedVendors(vendors)
      setLoading(false)
    })
  }, [user.id])

  const q = search.trim().toLowerCase()
  const filteredPeople = !q
    ? connectedPeople
    : connectedPeople.filter((f) =>
        [f.name, ...(f.skills || []), ...(f.locations || [])].some((s) => (s || '').toLowerCase().includes(q))
      )
  const filteredVendors = !q
    ? connectedVendors
    : connectedVendors.filter((v) =>
        [v.vendor_name, v.category, ...(v.locations || [])].some((s) => (s || '').toLowerCase().includes(q))
      )

  return (
    <div className="app-shell">
      <Topbar title="Team" />
      <div className="page">
        <div className="row" style={{ alignItems: 'center', gap: 0 }}>
          <div className="segmented" style={{ flex: 1 }}>
            <button type="button" className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>
              My Team
            </button>
            <button type="button" className={tab === 'vendors' ? 'active' : ''} onClick={() => setTab('vendors')}>
              Vendors
            </button>
          </div>
          <InfoButton title={tab === 'people' ? 'My Team' : 'Vendors'}>
            {tab === 'people'
              ? "Everyone you're connected with — accepted through a job, shortlisted via Discover, or added manually from their profile."
              : "Every vendor account that's been accepted onto one of your events. Review a vendor's pending application from that event's Vendors tab."}
          </InfoButton>
        </div>

        <input
          type="text"
          placeholder={tab === 'people' ? 'Search your team by name, skill, or location…' : 'Search vendors by name, category, or location…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading && <p className="subtitle">Loading…</p>}

        {tab === 'people' && (
          <>
            {!loading && connectedPeople.length === 0 && (
              <div className="empty-state">No connected people yet — browse People in Discover, or accept an applicant on one of your events.</div>
            )}
            {!loading && connectedPeople.length > 0 && filteredPeople.length === 0 && (
              <div className="empty-state">No matches for "{search.trim()}".</div>
            )}
            <div className="stack">
              {filteredPeople.map((f) => (
                <Link key={f.id} to={`/organizer/freelancers/${f.id}`} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <ProfileAvatar avatarKey={f.avatar_key} photoUrl={(f.photo_urls || [])[0]} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{f.name}</div>
                    <p className="subtitle" style={{ margin: '2px 0 0' }}>
                      {(f.skills || []).slice(0, 3).join(', ')}
                      {(f.locations || []).length > 0 && ` · ${f.locations.join(', ')}`}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        {tab === 'vendors' && (
          <>
            {!loading && connectedVendors.length === 0 && (
              <div className="empty-state">No connected vendors yet — browse Vendor in Discover, or accept a vendor's application on one of your events.</div>
            )}
            {!loading && connectedVendors.length > 0 && filteredVendors.length === 0 && (
              <div className="empty-state">No matches for "{search.trim()}".</div>
            )}
            <div className="stack">
              {filteredVendors.map((v) => (
                <Link key={v.id} to={`/organizer/vendors-directory/${v.id}`} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      flexShrink: 0,
                      backgroundColor: 'var(--cloud)',
                      backgroundImage: v.logo_url ? `url(${v.logo_url})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {!v.logo_url && <IconStore style={{ width: 18, height: 18, color: 'var(--muted)' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{v.vendor_name}</div>
                    <p className="subtitle" style={{ margin: '2px 0 0' }}>
                      {v.category || 'Uncategorized'}
                      {(v.locations || []).length > 0 && ` · ${v.locations.join(', ')}`}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <OrganizerTabbar />
    </div>
  )
}
