import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { Guard } from './components/Guard'

import Landing from './pages/Landing'
import Login from './pages/Login'
import CheckEmail from './pages/CheckEmail'
import Chat from './pages/Chat'

import FreelancerOnboarding from './pages/freelancer/FreelancerOnboarding'
import JobFeed from './pages/freelancer/JobFeed'
import JobDetail from './pages/freelancer/JobDetail'
import FreelancerNotifications from './pages/freelancer/FreelancerNotifications'

import OrganizerOnboarding from './pages/organizer/OrganizerOnboarding'
import OrganizerDashboard from './pages/organizer/OrganizerDashboard'
import ApplicantReview from './pages/organizer/ApplicantReview'
import FreelancerBrowse from './pages/organizer/FreelancerBrowse'
import OrganizerNotifications from './pages/organizer/OrganizerNotifications'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/check-email" element={<CheckEmail />} />
          <Route
            path="/chat/:matchId"
            element={
              <Guard>
                <Chat />
              </Guard>
            }
          />

          <Route
            path="/freelancer/onboarding"
            element={
              <Guard role="freelancer" skipOnboardedCheck>
                <FreelancerOnboarding />
              </Guard>
            }
          />
          <Route
            path="/freelancer/jobs"
            element={
              <Guard role="freelancer">
                <JobFeed />
              </Guard>
            }
          />
          <Route
            path="/freelancer/jobs/:jobId"
            element={
              <Guard role="freelancer">
                <JobDetail />
              </Guard>
            }
          />
          <Route
            path="/freelancer/notifications"
            element={
              <Guard role="freelancer">
                <FreelancerNotifications />
              </Guard>
            }
          />

          <Route
            path="/organizer/onboarding"
            element={
              <Guard role="organizer" skipOnboardedCheck>
                <OrganizerOnboarding />
              </Guard>
            }
          />
          <Route
            path="/organizer/dashboard"
            element={
              <Guard role="organizer">
                <OrganizerDashboard />
              </Guard>
            }
          />
          <Route
            path="/organizer/jobs/:jobId/applicants"
            element={
              <Guard role="organizer">
                <ApplicantReview />
              </Guard>
            }
          />
          <Route
            path="/organizer/browse"
            element={
              <Guard role="organizer">
                <FreelancerBrowse />
              </Guard>
            }
          />
          <Route
            path="/organizer/notifications"
            element={
              <Guard role="organizer">
                <OrganizerNotifications />
              </Guard>
            }
          />

          <Route path="*" element={<Landing />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
