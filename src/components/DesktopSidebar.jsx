import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'
import { IconUser, IconClipboard, IconCalendar, IconSearch, IconChat } from './TabIcons'
import logoMark from '../assets/logo-mark.png'

// The desktop-only left nav — mirrors the mobile tabbar's destinations (see
// Layout.jsx's OrganizerTabbar/FreelancerTabbar) plus the new desktop-only
// event workspace, so switching between a phone and a wide window lands on
// familiar ground either way. Rendered by AppFrame; never mounted below the
// 900px breakpoint (CSS-hidden, see index.css).
export function DesktopSidebar({ role }) {
  const { signOut } = useAuth()
  const linkClass = ({ isActive }) => (isActive ? 'active' : '')

  return (
    <aside className="desktop-sidebar">
      <div className="ds-brand">
        <img src={logoMark} alt="" />
        Pulau Event
      </div>

      {role === 'organizer' && (
        <>
          <NavLink to="/organizer/onboarding" end className={linkClass}>
            <IconUser className="ds-icon" />
            Profile
          </NavLink>
          <NavLink to="/organizer/my-events" className={linkClass}>
            <IconCalendar className="ds-icon" />
            My Event
          </NavLink>
          <NavLink to="/organizer/browse" className={linkClass}>
            <IconSearch className="ds-icon" />
            Discover
          </NavLink>
          <NavLink to="/organizer/dashboard" className={linkClass}>
            <IconClipboard className="ds-icon" />
            Post
          </NavLink>
          <NavLink to="/organizer/notifications" className={linkClass}>
            <IconChat className="ds-icon" />
            Connect
          </NavLink>
        </>
      )}

      {role === 'freelancer' && (
        <>
          <NavLink to="/freelancer/onboarding" end className={linkClass}>
            <IconUser className="ds-icon" />
            Profile
          </NavLink>
          <NavLink to="/freelancer/jobs" className={linkClass}>
            <IconClipboard className="ds-icon" />
            Job board
          </NavLink>
          <NavLink to="/freelancer/my-events" className={linkClass}>
            <IconCalendar className="ds-icon" />
            My Event
          </NavLink>
          <NavLink to="/freelancer/notifications" className={linkClass}>
            <IconChat className="ds-icon" />
            Connect
          </NavLink>
        </>
      )}

      <div className="ds-spacer" />
      <div className="ds-signout">
        <button type="button" className="ds-link" onClick={signOut}>
          Sign out
        </button>
      </div>
    </aside>
  )
}
