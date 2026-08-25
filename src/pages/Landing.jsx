import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../context/AuthProvider'

export default function Landing() {
  const navigate = useNavigate()
  const { user, role, isOnboarded, loading } = useAuth()

  useEffect(() => {
    if (loading || !user || !role) return
    if (!isOnboarded) {
      navigate(role === 'freelancer' ? '/freelancer/onboarding' : '/organizer/onboarding', { replace: true })
    } else {
      navigate(role === 'freelancer' ? '/freelancer/jobs' : '/organizer/dashboard', { replace: true })
    }
  }, [loading, user, role, isOnboarded, navigate])

  return (
    <div className="center-page">
      <div>
        <div style={{ fontSize: 40 }}>🤝</div>
        <h1 style={{ marginTop: 10 }}>Vendor Connect</h1>
        <p className="subtitle">Event-services freelancers, and the organizers who hire them. Swipe, apply, match.</p>
      </div>
      <div className="stack" style={{ width: '100%', maxWidth: 320 }}>
        <button className="btn btn-primary btn-block" onClick={() => navigate('/login?role=freelancer')}>
          I'm a Freelancer
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => navigate('/login?role=organizer')}>
          I'm an Event Organizer
        </button>
      </div>
    </div>
  )
}
