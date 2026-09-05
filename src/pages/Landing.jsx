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
      navigate(role === 'freelancer' ? '/freelancer/jobs' : '/organizer/my-events', { replace: true })
    }
  }, [loading, user, role, isOnboarded, navigate])

  return (
    <div className="app-shell landing-hero">
      <div className="spot-mark" />
      <div>
        <h1>Pulau Event</h1>
        <p className="subtitle">Event-services freelancers, and the organizers who hire them. Browse, apply, connect.</p>
      </div>
      <div className="stack" style={{ width: '100%', maxWidth: 320 }}>
        <button className="btn btn-accent btn-block" onClick={() => navigate('/login?role=freelancer')}>
          I'm a Freelancer
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => navigate('/login?role=organizer')}>
          I'm an Event Organizer
        </button>
      </div>
    </div>
  )
}
