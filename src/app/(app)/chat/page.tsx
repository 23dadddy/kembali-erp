'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { useLanguage } from '@/components/providers/language-provider'
import { createClient } from '@/lib/supabase/client'
import { Send, Hash, MessageSquare, User, Loader2, Circle, Star, Reply, X, Check, CheckCheck } from 'lucide-react'

const CHANNEL_KEYS = [
  { id: 'general',    labelKey: 'chat_general'    as const, icon: '💬' },
  { id: 'operations', labelKey: 'chat_operations' as const, icon: '🚛' },
  { id: 'drivers',    labelKey: 'chat_drivers'    as const, icon: '🚚' },
  { id: 'finance',    labelKey: 'chat_finance'    as const, icon: '💰' },
  { id: 'management', labelKey: 'chat_management' as const, icon: '📊' },
]

// Deterministic color per user name
const AVATAR_COLORS = [
  '#5BA3A0', '#E07B5A', '#7B8FA1', '#A07BC4', '#5A8A6A',
  '#C47B7B', '#7BA8C4', '#C4A07B', '#8A7BC4', '#7BC47B',
]
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

interface Message {
  id: string
  channel: string | null
  sender_id: string | null
  recipient_id: string | null
  content: string
  created_at: string
  reply_to_id?: string | null
  sender?: { name: string; avatar_url?: string | null } | null
  reply_to?: { content: string; sender?: { name: string } | null } | null
}

interface StaffMember {
  id: string
  name: string
  role: string
  avatar_url?: string | null
}

function Avatar({ name, avatarUrl, size = 7, className = '' }: { name: string; avatarUrl?: string | null; size?: number; className?: string }) {
  const color = avatarColor(name)
  const sizeClass = `w-${size} h-${size}`
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`${sizeClass} rounded-full object-cover flex-shrink-0 ${className}`} />
  }
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${className}`}
      style={{ background: color, fontSize: size <= 6 ? '10px' : '12px' }}
    >
      {name[0].toUpperCase()}
    </div>
  )
}

export default function ChatPage() {
  const { t } = useLanguage()
  const CHANNELS = CHANNEL_KEYS.map(c => ({ ...c, label: t(c.labelKey) }))
  const sb = useRef(createClient()).current

  const [channel, setChannel] = useState('general')
  const [dmTarget, setDmTarget] = useState<StaffMember | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [myStaff, setMyStaff] = useState<StaffMember | null>(null)
  const [loading, setLoading] = useState(true)
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set())
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)

  // Starred channels stored in localStorage
  const [starred, setStarred] = useState<Set<string>>(new Set())
  // Unread tracking: { [channelKey]: lastReadTimestamp }
  const [lastRead, setLastRead] = useState<Record<string, string>>({})
  // Latest message timestamp per channel (for unread badges)
  const [latestTs, setLatestTs] = useState<Record<string, string>>({})

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load persisted state from localStorage
  useEffect(() => {
    try {
      const s = localStorage.getItem('chat_starred')
      if (s) setStarred(new Set(JSON.parse(s)))
      const lr = localStorage.getItem('chat_last_read')
      if (lr) setLastRead(JSON.parse(lr))
    } catch {}
  }, [])

  const toggleStar = (channelId: string) => {
    setStarred(prev => {
      const next = new Set(prev)
      next.has(channelId) ? next.delete(channelId) : next.add(channelId)
      localStorage.setItem('chat_starred', JSON.stringify([...next]))
      return next
    })
  }

  const markRead = useCallback((key: string) => {
    const ts = new Date().toISOString()
    setLastRead(prev => {
      const next = { ...prev, [key]: ts }
      localStorage.setItem('chat_last_read', JSON.stringify(next))
      return next
    })
  }, [])

  const viewKey = dmTarget ? `dm-${dmTarget.id}` : `ch-${channel}`

  // Mark current view as read when switching
  useEffect(() => { markRead(viewKey) }, [viewKey, markRead])

  const hasUnread = (key: string) => {
    const lr = lastRead[key]
    const lt = latestTs[key]
    if (!lt) return false
    if (!lr) return true
    return lt > lr
  }

  // Init staff + presence
  useEffect(() => {
    let presenceChannel: ReturnType<typeof sb.channel> | null = null
    const init = async () => {
      const { data: { user } } = await sb.auth.getUser()
      const [staffRes, myRes] = await Promise.all([
        sb.from('staff').select('id, name, role, avatar_url').eq('active', true).order('name'),
        user ? sb.from('staff').select('id, name, role, avatar_url').eq('auth_user_id', user.id).single() : Promise.resolve({ data: null }),
      ])
      let myStaffData = (myRes as any).data as StaffMember | null
      if (!myStaffData && user) {
        myStaffData = { id: user.id, name: user.email?.split('@')[0] ?? 'Me', role: '', avatar_url: null }
      }
      setStaff((staffRes.data ?? []) as StaffMember[])
      setMyStaff(myStaffData)

      if (myStaffData) {
        presenceChannel = sb.channel('presence-chat', { config: { presence: { key: myStaffData.id } } })
        presenceChannel
          .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel!.presenceState()
            setOnlineIds(new Set(Object.keys(state)))
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await presenceChannel!.track({ staff_id: myStaffData!.id, name: myStaffData!.name })
            }
          })
      }

      // Load latest message timestamps for all channels (for unread badges)
      const { data: latestMsgs } = await sb
        .from('chat_messages')
        .select('channel, created_at')
        .is('recipient_id', null)
        .order('created_at', { ascending: false })
        .limit(200)

      const ts: Record<string, string> = {}
      for (const m of (latestMsgs ?? [])) {
        if (m.channel && !ts[`ch-${m.channel}`]) ts[`ch-${m.channel}`] = m.created_at
      }
      setLatestTs(ts)
    }
    init()
    return () => { presenceChannel?.unsubscribe() }
  }, [])

  const loadMessages = useCallback(async () => {
    setLoading(true)
    let q = sb.from('chat_messages')
      .select('*, sender:staff!sender_id(name, avatar_url), reply_to:chat_messages!reply_to_id(content, sender:staff!sender_id(name))')
      .order('created_at', { ascending: true })
      .limit(150)

    if (dmTarget) {
      if (myStaff) {
        q = q.or(
          `and(sender_id.eq.${myStaff.id},recipient_id.eq.${dmTarget.id}),and(sender_id.eq.${dmTarget.id},recipient_id.eq.${myStaff.id})`
        )
      } else {
        q = q.eq('recipient_id', dmTarget.id)
      }
    } else {
      q = q.eq('channel', channel).is('recipient_id', null)
    }

    const { data } = await q
    setMessages((data ?? []) as Message[])
    setLoading(false)
  }, [channel, dmTarget, myStaff])

  useEffect(() => { loadMessages() }, [loadMessages])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Realtime subscription
  useEffect(() => {
    const sub = sb
      .channel(`chat-realtime-${viewKey}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as Message
        const isChannelMsg = !msg.recipient_id && msg.channel === channel && !dmTarget
        const isDM = dmTarget && myStaff && (
          (msg.sender_id === myStaff.id && msg.recipient_id === dmTarget.id) ||
          (msg.sender_id === dmTarget.id && msg.recipient_id === myStaff.id)
        )
        if (isChannelMsg || isDM) {
          const allStaff = [...staff, ...(myStaff ? [myStaff] : [])]
          const senderData = allStaff.find(s => s.id === msg.sender_id)
          const enriched: Message = {
            ...msg,
            sender: senderData ? { name: senderData.name, avatar_url: senderData.avatar_url } : null,
          }
          setMessages(prev => prev.some(m => m.id === enriched.id) ? prev : [...prev, enriched])
          markRead(viewKey)
        }
        // Update latestTs for unread badges
        if (!msg.recipient_id && msg.channel) {
          setLatestTs(prev => ({ ...prev, [`ch-${msg.channel}`]: msg.created_at }))
        }
      })
      .subscribe()
    return () => { sub.unsubscribe() }
  }, [channel, dmTarget, myStaff, staff, sb, viewKey, markRead])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    setSendError(null)
    setReplyTo(null)
    inputRef.current?.focus()
    const { error } = await sb.from('chat_messages').insert({
      channel: dmTarget ? null : channel,
      sender_id: myStaff?.id ?? null,
      recipient_id: dmTarget?.id ?? null,
      content: text,
      reply_to_id: replyTo?.id ?? null,
    })
    if (error) {
      setSendError(error.message)
      setInput(text)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
    if (e.key === 'Escape') setReplyTo(null)
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Group messages by date
  const groupedMessages: { date: string; msgs: Message[] }[] = []
  for (const msg of messages) {
    const date = new Date(msg.created_at).toDateString()
    const last = groupedMessages[groupedMessages.length - 1]
    if (last?.date === date) last.msgs.push(msg)
    else groupedMessages.push({ date, msgs: [msg] })
  }

  const currentTitle = dmTarget
    ? dmTarget.name
    : CHANNELS.find(c => c.id === channel)?.label ?? channel

  const starredChannels = CHANNELS.filter(c => starred.has(c.id))
  const unreadChannels = CHANNELS.filter(c => hasUnread(`ch-${c.id}`) && !starred.has(c.id))

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar title="nav_chat" titleIsKey />
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Chat sidebar */}
        <div className="w-56 bg-slate-900 text-white flex flex-col flex-shrink-0 select-none">

          {/* Starred */}
          {starredChannels.length > 0 && (
            <div className="px-3 pt-3 pb-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 mb-1">Starred</p>
              {starredChannels.map(ch => (
                <ChannelButton key={ch.id} ch={ch} active={!dmTarget && channel === ch.id}
                  starred unread={hasUnread(`ch-${ch.id}`)}
                  onClick={() => { setChannel(ch.id); setDmTarget(null) }}
                  onToggleStar={() => toggleStar(ch.id)} />
              ))}
            </div>
          )}

          {/* Unread */}
          {unreadChannels.length > 0 && (
            <div className="px-3 pt-2 pb-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 mb-1">Unread</p>
              {unreadChannels.map(ch => (
                <ChannelButton key={ch.id} ch={ch} active={!dmTarget && channel === ch.id}
                  starred={false} unread
                  onClick={() => { setChannel(ch.id); setDmTarget(null) }}
                  onToggleStar={() => toggleStar(ch.id)} />
              ))}
            </div>
          )}

          {/* All channels */}
          <div className="px-3 pt-2 pb-1 border-b border-slate-800">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 mb-1">{t('comms_channels')}</p>
            {CHANNELS.filter(c => !starred.has(c.id)).map(ch => (
              <ChannelButton key={ch.id} ch={ch} active={!dmTarget && channel === ch.id}
                starred={false} unread={hasUnread(`ch-${ch.id}`)}
                onClick={() => { setChannel(ch.id); setDmTarget(null) }}
                onToggleStar={() => toggleStar(ch.id)} />
            ))}
          </div>

          {/* Direct messages */}
          <div className="px-3 pt-2 flex-1 overflow-y-auto">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 mb-1">{t('comms_direct_messages')}</p>
            {staff.filter(s => s.id !== myStaff?.id).map(s => (
              <button key={s.id} onClick={() => setDmTarget(s)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors text-left group ${
                  dmTarget?.id === s.id ? 'bg-[#5BA3A0] text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}>
                <div className="relative flex-shrink-0">
                  <Avatar name={s.name} avatarUrl={s.avatar_url} size={6} />
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-900 ${
                    onlineIds.has(s.id) ? 'bg-emerald-400' : 'bg-slate-600'
                  }`} />
                </div>
                <span className="truncate flex-1 text-xs">{s.name}</span>
                {hasUnread(`dm-${s.id}`) && (
                  <span className="w-2 h-2 rounded-full bg-[#5BA3A0] flex-shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* Me */}
          {myStaff && (
            <div className="px-3 py-3 border-t border-slate-800 flex items-center gap-2">
              <div className="relative flex-shrink-0">
                <Avatar name={myStaff.name} avatarUrl={myStaff.avatar_url} size={6} />
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-slate-900" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">{myStaff.name}</p>
                <p className="text-[10px] text-emerald-400">Online</p>
              </div>
            </div>
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-white min-w-0">

          {/* Header */}
          <div className="border-b px-5 py-3 flex items-center gap-2.5">
            {dmTarget ? (
              <>
                <div className="relative">
                  <Avatar name={dmTarget.name} avatarUrl={dmTarget.avatar_url} size={7} />
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                    onlineIds.has(dmTarget.id) ? 'bg-emerald-400' : 'bg-slate-300'
                  }`} />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm leading-tight">{dmTarget.name}</p>
                  <p className="text-xs text-slate-400">{dmTarget.role} · {onlineIds.has(dmTarget.id) ? 'Online' : 'Offline'}</p>
                </div>
              </>
            ) : (
              <>
                <Hash className="w-4 h-4 text-slate-400" />
                <span className="font-semibold text-slate-800">{currentTitle}</span>
                <button onClick={() => toggleStar(channel)} className="ml-1 text-slate-300 hover:text-amber-400 transition-colors">
                  <Star className={`w-3.5 h-3.5 ${starred.has(channel) ? 'fill-amber-400 text-amber-400' : ''}`} />
                </button>
              </>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex justify-center pt-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageSquare className="w-10 h-10 text-slate-200 mb-3" />
                <p className="font-medium text-slate-400">{t('chat_no_messages')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedMessages.map(({ date, msgs }) => (
                  <div key={date}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 h-px bg-slate-100" />
                      <span className="text-xs text-slate-400 bg-white px-2">
                        {new Date(date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                      </span>
                      <div className="flex-1 h-px bg-slate-100" />
                    </div>
                    <div className="space-y-1">
                      {msgs.map((msg, i) => {
                        const isMe = msg.sender_id === myStaff?.id
                        const senderName = isMe ? (myStaff?.name ?? 'You') : ((msg.sender as any)?.name ?? 'Unknown')
                        const showSender = i === 0 || msgs[i - 1].sender_id !== msg.sender_id
                        const isLast = i === msgs.length - 1
                        const isHovered = hoveredMsgId === msg.id

                        return (
                          <div key={msg.id}
                            className={`flex gap-3 group relative ${isMe ? 'flex-row-reverse' : ''} ${showSender ? 'mt-3' : ''}`}
                            onMouseEnter={() => setHoveredMsgId(msg.id)}
                            onMouseLeave={() => setHoveredMsgId(null)}
                          >
                            {/* Avatar */}
                            {showSender ? (
                              <Avatar
                                name={senderName}
                                avatarUrl={isMe ? myStaff?.avatar_url : (msg.sender as any)?.avatar_url}
                                size={7}
                                className="mt-0.5"
                              />
                            ) : (
                              <div className="w-7 flex-shrink-0" />
                            )}

                            <div className={`max-w-[68%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                              {/* Sender + time */}
                              {showSender && (
                                <div className={`flex items-baseline gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                                  <span className="text-xs font-semibold text-slate-700">{isMe ? t('chat_you') : senderName}</span>
                                  <span className="text-[11px] text-slate-400">{formatTime(msg.created_at)}</span>
                                </div>
                              )}

                              {/* Reply preview */}
                              {msg.reply_to && (
                                <div className={`flex items-start gap-2 mb-1 px-3 py-1.5 rounded-lg bg-slate-50 border-l-2 border-[#5BA3A0] max-w-full ${isMe ? 'flex-row-reverse border-l-0 border-r-2' : ''}`}>
                                  <Reply className="w-3 h-3 text-[#5BA3A0] flex-shrink-0 mt-0.5" />
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold text-[#5BA3A0]">{(msg.reply_to.sender as any)?.name ?? 'Unknown'}</p>
                                    <p className="text-xs text-slate-500 truncate">{msg.reply_to.content}</p>
                                  </div>
                                </div>
                              )}

                              {/* Bubble */}
                              <div className={`rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                                isMe
                                  ? 'bg-[#5BA3A0] text-white rounded-tr-sm'
                                  : 'bg-slate-100 text-slate-800 rounded-tl-sm'
                              }`}>
                                {msg.content}
                              </div>

                              {/* Read receipt (last message from me in DM) */}
                              {isMe && isLast && dmTarget && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <CheckCheck className="w-3 h-3 text-[#5BA3A0]" />
                                  <span className="text-[10px] text-slate-400">Sent</span>
                                </div>
                              )}
                            </div>

                            {/* Hover reply button */}
                            {isHovered && (
                              <button
                                onClick={() => { setReplyTo(msg); inputRef.current?.focus() }}
                                className={`absolute top-0 ${isMe ? 'left-10' : 'right-10'} flex items-center gap-1 bg-white border border-slate-200 shadow-sm rounded-lg px-2 py-1 text-xs text-slate-500 hover:text-[#5BA3A0] hover:border-[#5BA3A0] transition-colors z-10`}
                              >
                                <Reply className="w-3 h-3" /> Reply
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Reply banner */}
          {replyTo && (
            <div className="mx-4 mb-0 border border-b-0 border-slate-200 rounded-t-xl bg-slate-50 px-4 py-2 flex items-center gap-3">
              <Reply className="w-3.5 h-3.5 text-[#5BA3A0] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-[#5BA3A0]">
                  Replying to {replyTo.sender_id === myStaff?.id ? 'yourself' : ((replyTo.sender as any)?.name ?? 'Unknown')}
                </p>
                <p className="text-xs text-slate-500 truncate">{replyTo.content}</p>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Input */}
          <div className={`px-4 pb-3 pt-3 ${replyTo ? 'pt-0' : ''}`}>
            {sendError && <p className="text-xs text-red-500 mb-2 px-1">Failed to send: {sendError}</p>}
            <div className={`flex items-center gap-3 bg-slate-50 border px-4 py-2.5 ${replyTo ? 'rounded-b-xl rounded-t-none border-t-0' : 'rounded-xl'}`}>
              {myStaff && <Avatar name={myStaff.name} avatarUrl={myStaff.avatar_url} size={6} />}
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-sm outline-none placeholder-slate-400"
                placeholder={t('chat_type_placeholder')}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button onClick={sendMessage} disabled={!input.trim()}
                className="text-[#5BA3A0] hover:text-[#4A8A87] disabled:text-slate-300 transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 text-center">Enter to send · Shift+Enter for new line · Esc to cancel reply</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Channel button component ────────────────────────────────────────────────
function ChannelButton({ ch, active, starred, unread, onClick, onToggleStar }: {
  ch: { id: string; label: string }
  active: boolean
  starred: boolean
  unread: boolean
  onClick: () => void
  onToggleStar: () => void
}) {
  return (
    <div className={`flex items-center group rounded-lg transition-colors ${active ? 'bg-[#5BA3A0]' : 'hover:bg-slate-800'}`}>
      <button onClick={onClick} className={`flex-1 flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-left ${
        active ? 'text-white' : 'text-slate-300'
      }`}>
        <Hash className="w-3 h-3 flex-shrink-0 opacity-60" />
        <span className="flex-1 truncate">{ch.label}</span>
        {unread && !active && <span className="w-1.5 h-1.5 rounded-full bg-[#5BA3A0] flex-shrink-0" />}
      </button>
      <button onClick={onToggleStar}
        className={`pr-2 transition-colors ${active ? 'text-white/60 hover:text-white' : 'text-slate-600 hover:text-amber-400'} opacity-0 group-hover:opacity-100`}>
        <Star className={`w-3 h-3 ${starred ? 'fill-amber-400 text-amber-400 opacity-100' : ''}`} />
      </button>
    </div>
  )
}
