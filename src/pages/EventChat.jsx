import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthProvider'

// Group chat scoped to one event/job — everyone confirmed on it (the
// organizer + every freelancer accepted into any of its divisions) shares
// this one thread, named after the event instead of a single person. This is
// what a job-application connection becomes instead of a 1:1 chat; a
// Discover-sourced ("like") connection still gets its own 1:1 chat since
// there's no specific job attached to it.
export default function EventChat() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [job, setJob] = useState(null)
  const [namesById, setNamesById] = useState(new Map())
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  const load = useCallback(async () => {
    const { data: jobRow, error: jobError } = await supabase
      .from('job_postings')
      .select('id, title, organizer_id, chat_opened_at, organizer_profiles(org_name)')
      .eq('id', jobId)
      .single()
    if (jobError || !jobRow) {
      setError("Couldn't load this event chat — it may not exist, or you're not part of this event.")
      setLoading(false)
      return
    }
    setJob(jobRow)

    const { data: divisionRows } = await supabase.from('job_divisions').select('id').eq('job_id', jobId)
    const divisionIds = (divisionRows || []).map((d) => d.id)
    const names = new Map([[jobRow.organizer_id, jobRow.organizer_profiles.org_name]])
    if (divisionIds.length > 0) {
      const { data: teamApps } = await supabase
        .from('applications')
        .select('freelancer_profiles(id, name)')
        .in('division_id', divisionIds)
        .eq('status', 'accepted')
      ;(teamApps || []).forEach((a) => names.set(a.freelancer_profiles.id, a.freelancer_profiles.name))
    }
    setNamesById(names)

    if (!jobRow.chat_opened_at) {
      setLoading(false)
      return
    }

    const { data: msgRows, error: msgError } = await supabase
      .from('job_chat_messages')
      .select('id, sender_id, body, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })
    if (msgError) console.error(msgError)
    setMessages(msgRows || [])
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`job_chat_messages:${jobId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'job_chat_messages', filter: `job_id=eq.${jobId}` },
        (payload) => {
          setMessages((msgs) => (msgs.some((m) => m.id === payload.new.id) ? msgs : [...msgs, payload.new]))
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [jobId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setSending(true)
    setError('')
    const { data, error: sendError } = await supabase
      .from('job_chat_messages')
      .insert({ job_id: jobId, sender_id: user.id, body: text })
      .select()
      .single()
    setSending(false)
    if (sendError) {
      setError(sendError.message)
      return
    }
    setBody('')
    setMessages((msgs) => (msgs.some((m) => m.id === data.id) ? msgs : [...msgs, data]))
  }

  if (error && !job) {
    return (
      <div className="center-page">
        <p className="error-text">{error}</p>
        <button className="btn btn-outline" onClick={() => navigate(-1)}>
          Go back
        </button>
      </div>
    )
  }

  if (loading || !job) {
    return <div className="center-page">Loading…</div>
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <button
          className="link"
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', marginRight: 10, fontSize: 18 }}
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          ←
        </button>
        <div className="stack" style={{ gap: 0 }}>
          <span className="brand">{job.title}</span>
          {job.chat_opened_at && (
            <span style={{ fontSize: 11, color: '#dbe6ff' }}>{namesById.size} in this chat</span>
          )}
        </div>
      </div>

      <div className="page" style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 16 }}>
        {!job.chat_opened_at && (
          <div className="empty-state">
            This event's group chat hasn't been started by the organizer yet — check back once your team is
            confirmed.
          </div>
        )}
        {job.chat_opened_at && (
        <>
        <div className="chat-thread">
          {messages.length === 0 && (
            <p className="subtitle" style={{ textAlign: 'center', marginTop: 24 }}>
              This is the group chat for everyone confirmed on {job.title} — say hello!
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`chat-bubble ${m.sender_id === user.id ? 'mine' : 'theirs'}`}>
              {m.sender_id !== user.id && (
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, marginBottom: 2 }}>
                  {namesById.get(m.sender_id) || 'Someone'}
                </div>
              )}
              {m.body}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && <p className="error-text">{error}</p>}
        <form className="row" style={{ marginTop: 8 }} onSubmit={handleSend}>
          <input
            style={{ flex: 1 }}
            type="text"
            placeholder="Type a message…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending}
          />
          <button className="btn btn-primary" type="submit" disabled={sending || !body.trim()}>
            Send
          </button>
        </form>
        </>
        )}
      </div>
    </div>
  )
}
