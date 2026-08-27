import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'

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
        <span className="tab-icon">👤</span>Profile
      </NavLink>
      <NavLink to="/freelancer/jobs" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="tab-icon">📋</span>Job
      </NavLink>
      <NavLink to="/freelancer/notifications" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="tab-icon">
          🔔{pendingCount > 0 && <span className="badge" style={{ marginLeft: 4 }}>{pendingCount}</span>}
        </span>
        Connect
      </NavLink>
    </nav>
  )
}

export function OrganizerTabbar() {
  return (
    <nav className="tabbar">
      <NavLink to="/organizer/onboarding" end className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="tab-icon">👤</span>Profile
      </NavLink>
      <NavLink to="/organizer/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="tab-icon">🗂️</span>Post
      </NavLink>
      <NavLink to="/organizer/browse" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="tab-icon">🔎</span>Discover
      </NavLink>
      <NavLink to="/organizer/notifications" className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="tab-icon">🔔</span>Connect
      </NavLink>
    </nav>
  )
}
