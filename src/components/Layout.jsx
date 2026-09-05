import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'
import { IconUser, IconClipboard, IconCalendar, IconSearch, IconChat } from './TabIcons'

export function Topbar({ title }) {
  const { signOut, user } = useAuth()
  return (
    <div className="topbar">
      <span className="brand">{title || 'Pulau Event'}</span>
      {user && (
        <button className="link" onClick={signOut}>
          Sign out
        </button>
      )}
    </div>
  )
}

export function FreelancerTabbar({ pendingCount = 0 }) {
  return (
    <nav className="tabbar">
      <NavLink to="/freelancer/onboarding" end className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconUser className="tab-icon" />Profile
      </NavLink>
      <NavLink to="/freelancer/jobs" className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconClipboard className="tab-icon" />Job
      </NavLink>
      <NavLink to="/freelancer/my-events" className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconCalendar className="tab-icon" />My Event
      </NavLink>
      <NavLink to="/freelancer/notifications" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="tab-icon-wrap">
          <IconChat className="tab-icon" />
          {pendingCount > 0 && <span className="badge" style={{ marginLeft: 4 }}>{pendingCount}</span>}
        </span>
        Connect
      </NavLink>
    </nav>
  )
}

// pendingCount: applicants waiting on a decision, across every posting —
// shown on My Event (where staffing/recruiting happens) so an organizer
// notices new interest without opening each event. Post is its own tab
// again — it's just for creating/editing the posting itself, tracked
// separately from My Event's operational view.
export function OrganizerTabbar({ pendingCount = 0 }) {
  return (
    <nav className="tabbar">
      <NavLink to="/organizer/onboarding" end className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconUser className="tab-icon" />Profile
      </NavLink>
      <NavLink to="/organizer/my-events" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="tab-icon-wrap">
          <IconCalendar className="tab-icon" />
          {pendingCount > 0 && <span className="badge" style={{ marginLeft: 4 }}>{pendingCount}</span>}
        </span>
        My Event
      </NavLink>
      <NavLink to="/organizer/browse" className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconSearch className="tab-icon" />Discover
      </NavLink>
      <NavLink to="/organizer/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconClipboard className="tab-icon" />Post
      </NavLink>
      <NavLink to="/organizer/notifications" className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconChat className="tab-icon" />Connect
      </NavLink>
    </nav>
  )
}
