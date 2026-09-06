import { useAuth } from '../context/AuthProvider'
import { DesktopSidebar } from './DesktopSidebar'

// Wraps <Routes> in App.jsx. Below 900px this renders nothing but its own
// children — mobile is untouched. At 900px+, once someone is signed in,
// onboarded, and has a role (not mid-auth, not an admin), a persistent
// sidebar appears alongside whatever page is routed. See index.css's
// "Desktop shell" block for the actual layout — this component only
// decides WHETHER the sidebar mounts, never how it's positioned.
export function AppFrame({ children }) {
  const { user, role, isOnboarded } = useAuth()
  const showSidebar = Boolean(user && isOnboarded && (role === 'organizer' || role === 'freelancer'))

  return (
    <div className="desktop-frame">
      {showSidebar && <DesktopSidebar role={role} />}
      <div className="desktop-content">{children}</div>
    </div>
  )
}
