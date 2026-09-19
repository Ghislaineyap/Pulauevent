import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../context/AuthProvider'
import logoMark from '../assets/logo-mark.png'

export default function Landing() {
  const navigate = useNavigate()
  const { user, role, isOnboarded, isSuspended, loading } = useAuth()

  const onboardingPath = { freelancer: '/freelancer/onboarding', organizer: '/organizer/onboarding', vendor: '/vendor/onboarding' }
  const homePath = { freelancer: '/freelancer/jobs', organizer: '/organizer/my-events', vendor: '/vendor/jobs' }

  useEffect(() => {
    if (loading || !user || !role) return
    if (isSuspended) {
      navigate('/suspended', { replace: true })
    } else if (!isOnboarded) {
      navigate(onboardingPath[role] || '/', { replace: true })
    } else {
      navigate(homePath[role] || '/', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, role, isOnboarded, isSuspended, navigate])

  return (
    <div className="app-shell landing-hero">
      <div className="logo-badge">
        <img src={logoMark} alt="" />
      </div>
      <div>
        <h1>Pulau Event</h1>
        <p className="subtitle">Freelancers &amp; organizers — connected.</p>
      </div>
      <div className="stack" style={{ width: '100%', maxWidth: 320 }}>
        <button className="btn btn-accent btn-block" onClick={() => navigate('/login?role=freelancer')}>
          I'm a Freelancer
        </button>
        <button className="btn btn-outline btn-block" onClick={() => navigate('/login?role=organizer')}>
          I'm an Event Organizer
        </button>
        <button className="btn btn-outline btn-block" onClick={() => navigate('/login?role=vendor')}>
          I'm a Vendor
        </button>
      </div>
    </div>
  )
}
