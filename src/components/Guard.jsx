import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'

// Wrap a route element with this to require: signed in, correct role, and
// (unless skipOnboardedCheck) an onboarding profile already filled in.
// Usage: <Route path="/freelancer/jobs" element={<Guard role="freelancer"><JobFeed /></Guard>} />
export function Guard({ children, role, skipOnboardedCheck = false }) {
  const { loading, user, role: userRole, isOnboarded } = useAuth()
  const location = useLocation()

  if (loading) return <div className="center-page">Loading…</div>

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />

  if (role && userRole && userRole !== role) {
    // Signed in as the other role — send them to their own home.
    return <Navigate to={userRole === 'freelancer' ? '/freelancer/jobs' : '/organizer/dashboard'} replace />
  }

  if (!userRole) return <Navigate to="/login" replace />

  if (!skipOnboardedCheck && !isOnboarded) {
    return (
      <Navigate
        to={userRole === 'freelancer' ? '/freelancer/onboarding' : '/organizer/onboarding'}
        replace
      />
    )
  }

  return children
}
