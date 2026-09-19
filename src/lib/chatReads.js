import { supabase } from './supabaseClient'

// One small module backing unread-message badges everywhere they show up —
// Connect's two chat lists, per-event "Open event chat" buttons, and the
// tabbar's Connect badge. Two chat kinds share one `chat_reads` table:
// 'personal' rows key off a matches.id (the messages table), 'event' rows
// key off a job_postings.id (the job_chat_messages table).

const TABLE_BY_TYPE = { personal: 'messages', event: 'job_chat_messages' }
const ID_COLUMN_BY_TYPE = { personal: 'match_id', event: 'job_id' }

// Call when a user opens a chat (mount, and again whenever a new message
// streams in while they're already looking at it) — upserts "read up to
// now" so it drops out of every unread count next time it's computed.
export async function markChatRead(userId, chatType, chatId) {
  if (!userId || !chatId) return
  const { error } = await supabase
    .from('chat_reads')
    .upsert(
      { user_id: userId, chat_type: chatType, chat_id: chatId, last_read_at: new Date().toISOString() },
      { onConflict: 'user_id,chat_type,chat_id' }
    )
  if (error) console.error('markChatRead error', error)
}

// Returns Map<chatId, unreadCount> for every id in `ids` — messages the
// user themselves sent never count as unread. A chat never opened (no
// chat_reads row) counts everything not sent by the user.
export async function fetchUnreadCounts({ userId, chatType, ids }) {
  const counts = new Map((ids || []).map((id) => [id, 0]))
  if (!userId || !ids || ids.length === 0) return counts

  const table = TABLE_BY_TYPE[chatType]
  const idColumn = ID_COLUMN_BY_TYPE[chatType]

  const [{ data: reads, error: readsError }, { data: msgs, error: msgsError }] = await Promise.all([
    supabase.from('chat_reads').select('chat_id, last_read_at').eq('user_id', userId).eq('chat_type', chatType).in('chat_id', ids),
    supabase.from(table).select(`${idColumn}, sender_id, created_at`).in(idColumn, ids).neq('sender_id', userId),
  ])
  if (readsError) console.error('fetchUnreadCounts reads error', readsError)
  if (msgsError) console.error('fetchUnreadCounts messages error', msgsError)

  const lastReadById = new Map((reads || []).map((r) => [r.chat_id, r.last_read_at]))
  ;(msgs || []).forEach((m) => {
    const id = m[idColumn]
    const lastRead = lastReadById.get(id)
    if (!lastRead || m.created_at > lastRead) counts.set(id, (counts.get(id) || 0) + 1)
  })
  return counts
}

// Live increments for a list of chats (Connect's sidebar) — Realtime's
// postgres_changes still goes through RLS, so this fires only for chats the
// signed-in user can actually read; no per-chat filter needed. Ignores the
// user's own sends. Returns an unsubscribe function.
export function subscribeUnreadIncrements(chatType, userId, onIncrement) {
  if (!userId) return () => {}
  const table = TABLE_BY_TYPE[chatType]
  const idColumn = ID_COLUMN_BY_TYPE[chatType]
  const channel = supabase
    .channel(`unread:${chatType}:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (payload) => {
      if (payload.new.sender_id === userId) return
      onIncrement(payload.new[idColumn])
    })
    .subscribe()
  return () => supabase.removeChannel(channel)
}
