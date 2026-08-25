import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthProvider'
import { ProfileAvatar } from '../components/ProfileAvatar'

export default function Chat() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const { user, role } = useAuth()
  const [match, setMatch] = useState(null)
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  const loadMatch = useCallback(async () => {
    const { data, error: matchError } = await supabase
      .from('matches')
      .select('id, organizer_id, freelancer_id, organizer_profiles(org_name), freelancer_profiles(name, avatar_key, photo_url)')
      .eq('id', matchId)
      .single()
    if (matchError) {
      setError("Couldn't load this chat — the match may not exist, or isn't yours.")
      setLoading(false)
      return
    }
    setMatch(data)
  }, [matchId])

  const loadMessages = useCallback(async () => {
    const { data, error: msgError } = await supabase
      .from('messages')
      .select('id, sender_id, body, created_at')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true })
    if (msgError) console.error(msgError)
    setMessages(data || [])
    setLoading(false)
  }, [matchId])

  useEffect(() => {
    loadMatch()
    loadMessages()
  }, [loadMatch, loadMessages])

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (payload) => {
          setMessages((msgs) => (msgs.some((m) => m.id === payload.new.id) ? msgs : [...msgs, payload.new]))
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [matchId])

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
      .from('messages')
      .insert({ match_id: matchId, sender_id: user.id, body: text })
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

  if (error && !match) {
    return (
      <div className="center-page">
        <p className="error-text">{error}</p>
        <button className="btn btn-outline" onClick={() => navigate(-1)}>
          Go back
        </button>
      </div>
    )
  }

  // loadMatch and loadMessages run in parallel, so messages can finish first —
  // keep showing the loading state until both are in, not just messages,
  // otherwise the render below crashes reaching into a still-null match.
  if (loading || !match) {
    return <div className="center-page">Loading…</div>
  }

  const counterpart =
    role === 'organizer'
      ? { name: match.freelancer_profiles.name, avatarKey: match.freelancer_profiles.avatar_key, photoUrl: match.freelancer_profiles.photo_url }
      : { name: match.organizer_profiles.org_name, avatarKey: null, photoUrl: null }

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
        {counterpart.avatarKey && <ProfileAvatar avatarKey={counterpart.avatarKey} photoUrl={counterpart.photoUrl} size={32} />}
        <span className="brand" style={{ marginLeft: counterpart.avatarKey ? 8 : 0 }}>
          {counterpart.name}
        </span>
      </div>

      <div className="page" style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 16 }}>
        <div className="chat-thread">
          {messages.length === 0 && (
            <p className="subtitle" style={{ textAlign: 'center', marginTop: 24 }}>
              You matched — say hello! Once you've settled the details, you're welcome to move to WhatsApp or
              wherever's easiest.
            </p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`chat-bubble ${m.sender_id === user.id ? 'mine' : 'theirs'}`}>
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
      </div>
    </div>
  )
}
