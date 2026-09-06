import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { InfoButton } from './InfoButton'
import { formatTime, formatDuration } from '../lib/schedule'

function randomToken() {
  // Not a secret in the crypto sense — just needs to be unguessable enough
  // for a link nobody will brute-force, and unique (unique constraint on
  // the column is the real backstop).
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// Event-wide share: one link covers every rundown on the job at once,
// grouped by day, so a multi-day event never needs more than one link.
// Toggling a segment's visibility here is the ONLY way it appears on the
// public /schedule/:token page — everything defaults to hidden.
export function ShareView({ jobId, eventTitle }) {
  const [link, setLink] = useState(null) // { id, token } | null | undefined(loading)
  const [rundowns, setRundowns] = useState([])
  const [itemsByRundown, setItemsByRundown] = useState({})
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: linkRow, error: linkError }, { data: rundownRows, error: rundownError }] = await Promise.all([
      supabase.from('event_share_links').select('id, token').eq('job_id', jobId).maybeSingle(),
      supabase.from('event_rundowns').select('id, title, event_date').eq('job_id', jobId).order('event_date', { ascending: true, nullsFirst: false }),
    ])
    if (linkError) console.error(linkError)
    if (rundownError) console.error(rundownError)
    setLink(linkRow || null)
    setRundowns(rundownRows || [])

    const rundownIds = (rundownRows || []).map((r) => r.id)
    if (rundownIds.length > 0) {
      const { data: itemRows, error: itemError } = await supabase
        .from('event_rundown_items')
        .select('id, rundown_id, sort_order, start_time, duration_minutes, segment, client_visible')
        .in('rundown_id', rundownIds)
        .order('sort_order', { ascending: true })
      if (itemError) console.error(itemError)
      const grouped = {}
      ;(itemRows || []).forEach((it) => {
        grouped[it.rundown_id] = grouped[it.rundown_id] || []
        grouped[it.rundown_id].push(it)
      })
      setItemsByRundown(grouped)
    } else {
      setItemsByRundown({})
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    load()
  }, [load])

  async function createLink() {
    const { data: userData } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('event_share_links')
      .insert({ job_id: jobId, token: randomToken(), created_by: userData?.user?.id })
      .select()
      .single()
    if (error) {
      console.error(error)
      return
    }
    setLink(data)
  }

  async function toggleVisible(item) {
    const nextVal = !item.client_visible
    setItemsByRundown((prev) => ({
      ...prev,
      [item.rundown_id]: prev[item.rundown_id].map((it) => (it.id === item.id ? { ...it, client_visible: nextVal } : it)),
    }))
    const { error } = await supabase.from('event_rundown_items').update({ client_visible: nextVal }).eq('id', item.id)
    if (error) console.error(error)
  }

  const shareUrl = link ? `${window.location.origin}/schedule/${link.token}` : null

  function copyLink() {
    if (!shareUrl) return
    navigator.clipboard?.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  if (loading) return <p className="subtitle">Loading…</p>

  return (
    <div className="stack">
      <p className="subtitle" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
        Share {eventTitle}'s schedule with your client
        <InfoButton title="Client sharing">
          This is a live link, not a snapshot — anything you toggle on below shows up immediately, and any later change to a segment's time updates for
          whoever has the link. One link covers every day of a multi-day event, so you never need to send more than one.
        </InfoButton>
      </p>

      {!link ? (
        <button type="button" className="btn btn-primary btn-block" onClick={createLink}>
          Create client link
        </button>
      ) : (
        <div className="share-link-box">
          <span style={{ flex: 1 }}>{shareUrl}</span>
          <button type="button" className="btn btn-outline" style={{ padding: '5px 10px', fontSize: 12, flexShrink: 0 }} onClick={copyLink}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      {rundowns.length === 0 && <div className="empty-state">Add a rundown first — then choose which segments the client can see.</div>}

      <div className="stack" style={{ gap: 10 }}>
        {rundowns.map((r) => {
          const items = itemsByRundown[r.id] || []
          return (
            <div key={r.id} className="share-day-group">
              <div className="sdg-head">
                {r.title}
                {r.event_date && ` · ${new Date(`${r.event_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </div>
              {items.length === 0 && (
                <p className="subtitle" style={{ margin: 0, padding: '9px 12px' }}>
                  No segments yet.
                </p>
              )}
              {items.map((it) => (
                <label key={it.id} className="share-row" style={{ cursor: 'pointer' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{formatTime(it.start_time)}</strong> — {it.segment}
                    <span className="subtitle" style={{ display: 'block' }}>
                      {formatDuration(it.duration_minutes)}
                    </span>
                  </span>
                  <input type="checkbox" checked={Boolean(it.client_visible)} onChange={() => toggleVisible(it)} />
                </label>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
