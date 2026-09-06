import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatMessageTime } from '../lib/date'

// A persistent chat panel next to the event workspace content, matching the
// original desktop mockup (the event's group chat stays visible alongside
// every tab, instead of living behind a separate /event-chat/:jobId route).
// Same job_chat_messages table + realtime subscription as pages/EventChat —
// this is the same feature, just rendered as a rail instead of a page.
export function ChatRail({ jobId, eventTitle, currentUserId, canOpenChat, onEnableChat }) {
  const [namesById, setNamesById] = useState(new Map())
  const [chatOpened, setChatOpened] = useState(null) // null = still loading
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  const load = useCallback(async () => {
    const { data: jobRow } = await supabase
      .from('job_postings')
      .select('chat_opened_at, organizer_id, organizer_profiles(org_name)')
      .eq('id', jobId)
      .maybeSingle()
    if (!jobRow) return
    setChatOpened(Boolean(jobRow.chat_opened_at))

    const names = new Map([[jobRow.organizer_id, jobRow.organizer_profiles?.org_name || 'Organizer']])
    const { data: divisionRows } = await supabase.from('job_divisions').select('id').eq('job_id', jobId)
    const divisionIds = (divisionRows || []).map((d) => d.id)
    if (divisionIds.length > 0) {
      const { data: teamApps } = await supabase
        .from('applications')
        .select('freelancer_profiles(id, name)')
        .in('division_id', divisionIds)
        .eq('status', 'accepted')
      ;(teamApps || []).forEach((a) => a.freelancer_profiles && names.set(a.freelancer_profiles.id, a.freelancer_profiles.name))
    }
    setNamesById(names)

    if (!jobRow.chat_opened_at) return
    const { data: msgRows, error } = await supabase
      .from('job_chat_messages')
      .select('id, sender_id, body, created_at')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })
    if (error) console.error(error)
    setMessages(msgRows || [])
  }, [jobId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`job_chat_messages_rail:${jobId}`)
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
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setSending(true)
    const { data, error } = await supabase
      .from('job_chat_messages')
      .insert({ job_id: jobId, sender_id: currentUserId, body: text })
      .select()
      .single()
    setSending(false)
    if (error) {
      console.error(error)
      return
    }
    setBody('')
    setMessages((msgs) => (msgs.some((m) => m.id === data.id) ? msgs : [...msgs, data]))
  }

  async function handleEnable() {
    if (!onEnableChat) return
    await onEnableChat()
    load()
  }

  return (
    <aside className="chat-rail">
      <div className="chat-head">
        <div>
          <div className="ct-name">Event chat</div>
          <div className="ct-sub">{chatOpened ? `${namesById.size} in this chat` : eventTitle}</div>
        </div>
      </div>

      {chatOpened === false && (
        <div className="chat-body" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <p className="subtitle" style={{ margin: 0 }}>
            {canOpenChat
              ? "This event's group chat isn't open yet."
              : "This event's group chat hasn't been started by the organizer yet."}
          </p>
          {canOpenChat && (
            <button type="button" className="btn btn-primary" style={{ marginTop: 10 }} onClick={handleEnable}>
              Open event chat
            </button>
          )}
        </div>
      )}

      {chatOpened === true && (
        <>
          <div className="chat-body">
            {messages.length === 0 && (
              <p className="subtitle" style={{ textAlign: 'center', margin: '10px 0' }}>
                Say hello to the team!
              </p>
            )}
            {messages.map((m) => {
              const mine = m.sender_id === currentUserId
              return (
                <div key={m.id} className={`msg-group ${mine ? 'mine' : 'theirs'}`}>
                  {!mine && <div className="msg-sender">{namesById.get(m.sender_id) || 'Someone'}</div>}
                  <div className={`chat-bubble ${mine ? 'mine' : 'theirs'}`}>{m.body}</div>
                  <div className="msg-time">{formatMessageTime(m.created_at)}</div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
          <form className="chat-input-row" onSubmit={handleSend}>
            <input
              className="chat-input"
              type="text"
              placeholder="Message the team…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={sending}
            />
            <button type="submit" className="chat-send-btn" disabled={sending || !body.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </aside>
  )
}
