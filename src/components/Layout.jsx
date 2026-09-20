import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'
import { IconHome, IconUser, IconClipboard, IconCalendar, IconSearch, IconChat, IconStore } from './TabIcons'

// Where "Profile" (no longer its own tabbar entry — see FreelancerTabbar/
// OrganizerTabbar/VendorTabbar below) is reached from now: a round avatar
// in the topbar's corner, present on every screen. Signing out moved the
// other way — off the topbar and onto the profile page itself (see
// FreelancerOnboarding/OrganizerOnboarding/VendorOnboarding).
const PROFILE_PATH_BY_ROLE = { freelancer: '/freelancer/onboarding', organizer: '/organizer/onboarding', vendor: '/vendor/onboarding' }
// Each role keeps its "photo" under a different field — freelancers pick
// from a gallery (photo_urls), organizers/vendors have one logo — so the
// avatar shown here is whichever one that role actually has.
const AVATAR_URL_BY_ROLE = {
  freelancer: (p) => p?.photo_urls?.[0],
  organizer: (p) => p?.logo_url,
  vendor: (p) => p?.logo_url,
}

export function Topbar({ title }) {
  const { user, role, roleProfile } = useAuth()
  const profilePath = PROFILE_PATH_BY_ROLE[role]
  const avatarUrl = AVATAR_URL_BY_ROLE[role]?.(roleProfile)
  return (
    <div className="topbar">
      <span className="brand">{title || 'Pulau Event'}</span>
      {user && profilePath && (
        <Link to={profilePath} className="topbar-avatar" aria-label="Profile">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="topbar-avatar-img" />
          ) : (
            <IconUser className="topbar-avatar-icon" />
          )}
        </Link>
      )}
    </div>
  )
}

// myEventCount: job invites waiting on a response (needs a decision after
// seeing the jobdesk/fee). connectCount: "interested in you" likes waiting
// on a yes/no. Each tab only ever notifies about what it actually owns.
export function FreelancerTabbar({ myEventCount = 0, connectCount = 0 }) {
  return (
    <nav className="tabbar">
      <NavLink to="/freelancer/jobs" className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconClipboard className="tab-icon" />Job
      </NavLink>
      <NavLink to="/freelancer/my-events" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="tab-icon-wrap">
          <IconCalendar className="tab-icon" />
          {myEventCount > 0 && <span className="badge" style={{ marginLeft: 4 }}>{myEventCount}</span>}
        </span>
        My Event
      </NavLink>
      <NavLink to="/freelancer/notifications" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="tab-icon-wrap">
          <IconChat className="tab-icon" />
          {connectCount > 0 && <span className="badge" style={{ marginLeft: 4 }}>{connectCount}</span>}
        </span>
        Connect
      </NavLink>
    </nav>
  )
}

// connectCount: unread messages across event and personal chats. Team has no
// badge of its own — applicant review moved back to each event's own
// workspace (Select team/Recruiting/Review applicants, and the Vendors tab),
// so there's no single cross-event "pending" number to show here any more.
// 2026-09-20 nav restructure: Home (dashboard + calendar, split off My
// Event) and Vendor Management (previously desktop-sidebar-only) both
// became top-level tabs here, on mobile as well as desktop, per the new
// 6-tab order: Home, My Event, Discover, Team, Connect, Vendor Management.
export function OrganizerTabbar({ connectCount = 0 }) {
  return (
    <nav className="tabbar">
      <NavLink to="/organizer/home" className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconHome className="tab-icon" />Home
      </NavLink>
      <NavLink to="/organizer/my-events" className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconCalendar className="tab-icon" />My Event
      </NavLink>
      <NavLink to="/organizer/browse" className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconSearch className="tab-icon" />Discover
      </NavLink>
      <NavLink to="/organizer/team" className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconUser className="tab-icon" />Team
      </NavLink>
      <NavLink to="/organizer/notifications" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="tab-icon-wrap">
          <IconChat className="tab-icon" />
          {connectCount > 0 && <span className="badge" style={{ marginLeft: 4 }}>{connectCount}</span>}
        </span>
        Connect
      </NavLink>
      <NavLink to="/organizer/vendors" className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconStore className="tab-icon" />Vendors
      </NavLink>
    </nav>
  )
}

// myEventCount: vendor bookings waiting on a response (invited, not yet
// accepted/declined). connectCount: unread messages across event chats —
// vendors don't have a personal-chat/likes system yet, so Connect here is
// event chats only (see VendorNotifications.jsx).
export function VendorTabbar({ myEventCount = 0, connectCount = 0 }) {
  return (
    <nav className="tabbar">
      <NavLink to="/vendor/jobs" className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconClipboard className="tab-icon" />Opportunities
      </NavLink>
      <NavLink to="/vendor/my-events" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="tab-icon-wrap">
          <IconCalendar className="tab-icon" />
          {myEventCount > 0 && <span className="badge" style={{ marginLeft: 4 }}>{myEventCount}</span>}
        </span>
        My Event
      </NavLink>
      <NavLink to="/vendor/notifications" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="tab-icon-wrap">
          <IconChat className="tab-icon" />
          {connectCount > 0 && <span className="badge" style={{ marginLeft: 4 }}>{connectCount}</span>}
        </span>
        Connect
      </NavLink>
    </nav>
  )
}
