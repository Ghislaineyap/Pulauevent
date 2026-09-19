import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'

// Every role's own "home" once signed in — used both to bounce a signed-in
// user off a route that belongs to a different role, and to send them
// onward to build their profile first if they haven't yet.
const HOME_BY_ROLE = { freelancer: '/freelancer/jobs', organizer: '/organizer/my-events', vendor: '/vendor/jobs' }
const ONBOARDING_BY_ROLE = { freelancer: '/freelancer/onboarding', organizer: '/organizer/onboarding', vendor: '/vendor/onboarding' }

// Wrap a route element with this to require: signed in, correct role, and
// (unless skipOnboardedCheck) an onboarding profile already filled in.
// Usage: <Route path="/freelancer/jobs" element={<Guard role="freelancer"><JobFeed /></Guard>} />
export function Guard({ children, role, skipOnboardedCheck = false }) {
  const { loading, user, role: userRole, isOnboarded, isSuspended } = useAuth()
  const location = useLocation()

  if (loading) return <div className="center-page">Loading…</div>

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />

  // Checked before the role/onboarding logic below so a suspended account
  // never reaches an app screen, no matter what it was trying to open.
  if (isSuspended) return <Navigate to="/suspended" replace />

  if (role && userRole && userRole !== role) {
    // Signed in as another role — send them to their own home.
    return <Navigate to={HOME_BY_ROLE[userRole] || '/'} replace />
  }

  if (!userRole) return <Navigate to="/login" replace />

  if (!skipOnboardedCheck && !isOnboarded) {
    return <Navigate to={ONBOARDING_BY_ROLE[userRole] || '/'} replace />
  }

  return children
}
