import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'

// Deliberately separate from Guard.jsx — admin accounts have no
// freelancer/organizer detail row and no onboarding step, so reusing Guard's
// isOnboarded logic here would misfire.
export function AdminGuard({ children }) {
  const { loading, user, role } = useAuth()

  if (loading) return <div className="center-page">Loading…</div>
  if (!user || role !== 'admin') return <Navigate to="/admin/login" replace />

  return children
}
