import { useState } from 'react'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { PeopleBrowse } from './FreelancerBrowse'
import { VendorBrowse } from './VendorBrowse'

// Item 8: Discover used to be freelancers-only (the whole page was what's
// now PeopleBrowse). It's now a shell that owns the Topbar/Tabbar and a
// People/Vendor segmented control, and swaps in whichever browse component
// is active — each of those owns its own data loading, filters, and empty
// states, this page just decides which one is on screen.
export default function Discover() {
  const [tab, setTab] = useState('people') // 'people' | 'vendor'

  return (
    <div className="app-shell">
      <Topbar title="Discover" />
      <div className="page">
        <div className="segmented">
          <button type="button" className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>
            People
          </button>
          <button type="button" className={tab === 'vendor' ? 'active' : ''} onClick={() => setTab('vendor')}>
            Vendor
          </button>
        </div>

        {tab === 'people' ? <PeopleBrowse /> : <VendorBrowse />}
      </div>
      <OrganizerTabbar />
    </div>
  )
}
