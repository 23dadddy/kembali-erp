'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { useLanguage } from '@/components/providers/language-provider'
import { createClient } from '@/lib/supabase/client'
import { Send, Hash, MessageSquare, Loader2, Star, Reply, X, Smile, MoreHorizontal, ChevronDown, ChevronRight } from 'lucide-react'

const CHANNEL_KEYS = [
  { id: 'general',    labelKey: 'chat_general'    as const },
  { id: 'operations', labelKey: 'chat_operations' as const },
  { id: 'drivers',    labelKey: 'chat_drivers'    as const },
  { id: 'finance',    labelKey: 'chat_finance'    as const },
  { id: 'management', labelKey: 'chat_management' as const },
]

const AVATAR_COLORS = [
  '#E8A87C', '#85C1E9', '#82E0AA', '#F1948A', '#BB8FCE',
  '#F8C471', '#76D7C4', '#F0B27A', '#AED6F1', '#A9DFBF',
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

function Avatar({ name, avatarUrl, size = 9 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const color = avatarColor(name)
  const px = size * 4
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} style={{ width: px, height: px }} className="rounded-lg object-cover flex-shrink-0" />
  }
  return (
    <div
      className="rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0 select-none"
      style={{ width: px, height: px, background: color, fontSize: px * 0.38 }}
    >
      {name[0]?.toUpperCase()}
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
  const [starred, setStarred] = useState<Set<string>>(new Set())
  const [lastRead, setLastRead] = useState<Record<string, string>>({})
  const [latestTs, setLatestTs] = useState<Record<string, string>>({})
  const [channelsOpen, setChannelsOpen] = useState(true)
  const [dmsOpen, setDmsOpen] = useState(true)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const staffMap = useRef<Map<string, StaffMember>>(new Map())

  useEffect(() => {
    try {
      const s = localStorage.getItem('chat_starred')
      if (s) setStarred(new Set(JSON.parse(s)))
      const lr = localStorage.getItem('chat_last_read')
      if (lr) setLastRead(JSON.parse(lr))
    } catch {}
  }, [])

  const toggleStar = (id: string) => {
    setStarred(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
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
  useEffect(() => { markRead(viewKey) }, [viewKey, markRead])

  const hasUnread = (key: string) => {
    const lt = latestTs[key]
    const lr = lastRead[key]
    if (!lt) return false
    if (!lr) return true
    return lt > lr
  }

  useEffect(() => {
    let presenceChannel: ReturnType<typeof sb.channel> | null = null
    const init = async () => {
      const { data: { user } } = await sb.auth.getUser()
      const [staffRes, myRes] = await Promise.all([
        sb.from('staff').select('id, name, role, avatar_url').eq('active', true).order('name'),
        user ? sb.from('staff').select('id, name, role, avatar_url').eq('auth_user_id', user.id).single() : Promise.resolve({ data: null }),
      ])
      const staffList = (staffRes.data ?? []) as StaffMember[]
      setStaff(staffList)
      staffList.forEach(s => staffMap.current.set(s.id, s))

      let myStaffData = (myRes as any).data as StaffMember | null
      if (!myStaffData && user) {
        myStaffData = { id: user.id, name: user.email?.split('@')[0] ?? 'Me', role: '', avatar_url: null }
      }
      if (myStaffData) staffMap.current.set(myStaffData.id, myStaffData)
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
              await presenceChannel!.track({ staff_id: myStaffData!.id })
            }
          })
      }

      const { data: latestMsgs } = await sb
        .from('chat_messages').select('channel, created_at')
        .is('recipient_id', null).order('created_at', { ascending: false }).limit(200)
      const ts: Record<string, string> = {}
      for (const m of (latestMsgs ?? [])) {
        if (m.channel && !ts[`ch-${m.channel}`]) ts[`ch-${m.channel}`] = m.created_at
      }
      setLatestTs(ts)
    }
    init()
    return () => { presenceChannel?.unsubscribe() }
  }, [])

  const resolveSenderName = (msg: Message): string => {
    if (msg.sender_id === myStaff?.id) return myStaff?.name ?? 'You'
    const fromStaff = staffMap.current.get(msg.sender_id ?? '')
    if (fromStaff) return fromStaff.name
    return (msg.sender as any)?.name ?? 'Unknown'
  }

  const resolveSenderAvatar = (msg: Message): string | null => {
    if (msg.sender_id === myStaff?.id) return myStaff?.avatar_url ?? null
    const fromStaff = staffMap.current.get(msg.sender_id ?? '')
    if (fromStaff) return fromStaff.avatar_url ?? null
    return (msg.sender as any)?.avatar_url ?? null
  }

  const loadMessages = useCallback(async () => {
    setLoading(true)
    let q = sb.from('chat_messages')
      .select('id, channel, sender_id, recipient_id, content, created_at, reply_to_id, sender:staff!sender_id(name, avatar_url), reply_to:chat_messages!reply_to_id(content, sender:staff!sender_id(name))')
      .order('created_at', { ascending: true })
      .limit(200)

    if (dmTarget && myStaff) {
      q = q.or(
        `and(sender_id.eq.${myStaff.id},recipient_id.eq.${dmTarget.id}),and(sender_id.eq.${dmTarget.id},recipient_id.eq.${myStaff.id})`
      )
    } else if (dmTarget) {
      q = q.eq('recipient_id', dmTarget.id)
    } else {
      q = q.eq('channel', channel).is('recipient_id', null)
    }

    const { data } = await q
    setMessages((data ?? []) as unknown as Message[])
    setLoading(false)
  }, [channel, dmTarget, myStaff])

  useEffect(() => { loadMessages() }, [loadMessages])
  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [messages])

  useEffect(() => {
    const sub = sb.channel(`chat-${viewKey}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as Message
        const isChannelMsg = !msg.recipient_id && msg.channel === channel && !dmTarget
        const isDM = dmTarget && myStaff && (
          (msg.sender_id === myStaff.id && msg.recipient_id === dmTarget.id) ||
          (msg.sender_id === dmTarget.id && msg.recipient_id === myStaff.id)
        )
        if (isChannelMsg || isDM) {
          const senderData = staffMap.current.get(msg.sender_id ?? '')
          const enriched: Message = { ...msg, sender: senderData ? { name: senderData.name, avatar_url: senderData.avatar_url } : null }
          setMessages(prev => prev.some(m => m.id === enriched.id) ? prev : [...prev, enriched])
          markRead(viewKey)
        }
        if (!msg.recipient_id && msg.channel) {
          setLatestTs(prev => ({ ...prev, [`ch-${msg.channel}`]: msg.created_at }))
        }
      })
      .subscribe()
    return () => { sub.unsubscribe() }
  }, [channel, dmTarget, myStaff, sb, viewKey, markRead])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    setSendError(null)
    const savedReply = replyTo
    setReplyTo(null)
    inputRef.current?.focus()
    const { error } = await sb.from('chat_messages').insert({
      channel: dmTarget ? null : channel,
      sender_id: myStaff?.id ?? null,
      recipient_id: dmTarget?.id ?? null,
      content: text,
      reply_to_id: savedReply?.id ?? null,
    })
    if (error) { setSendError(error.message); setInput(text) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
    if (e.key === 'Escape') setReplyTo(null)
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  const formatDateDivider = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
    if (d.toDateString() === now.toDateString()) return 'Today'
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  }

  // Group consecutive messages by sender (within 5 min)
  const grouped: { date: string; msgs: Message[] }[] = []
  for (const msg of messages) {
    const date = new Date(msg.created_at).toDateString()
    const last = grouped[grouped.length - 1]
    if (last?.date === date) last.msgs.push(msg)
    else grouped.push({ date, msgs: [msg] })
  }

  const isCompact = (msgs: Message[], i: number) => {
    if (i === 0) return false
    const prev = msgs[i - 1]
    const curr = msgs[i]
    if (prev.sender_id !== curr.sender_id) return false
    const diff = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime()
    return diff < 5 * 60 * 1000 && !curr.reply_to_id
  }

  const currentTitle = dmTarget
    ? dmTarget.name
    : CHANNELS.find(c => c.id === channel)?.label ?? channel

  const starredChannels = CHANNELS.filter(c => starred.has(c.id))

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar title="nav_chat" titleIsKey />
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── Sidebar ── */}
        <div className="w-60 flex flex-col flex-shrink-0 overflow-y-auto" style={{ background: '#1A1D21', color: '#D1D2D3' }}>

          {/* Starred */}
          {starredChannels.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-bold uppercase tracking-widest px-4 mb-1 text-[#9B9C9D]">Starred</p>
              {starredChannels.map(ch => (
                <SidebarChannel key={ch.id} label={ch.label} active={!dmTarget && channel === ch.id}
                  unread={hasUnread(`ch-${ch.id}`)} starred
                  onClick={() => { setChannel(ch.id); setDmTarget(null) }}
                  onToggleStar={() => toggleStar(ch.id)} />
              ))}
            </div>
          )}

          {/* Channels */}
          <div className="mt-4">
            <button
              className="flex items-center gap-1 px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest text-[#9B9C9D] hover:text-white w-full"
              onClick={() => setChannelsOpen(v => !v)}
            >
              {channelsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {t('comms_channels')}
            </button>
            {channelsOpen && CHANNELS.map(ch => (
              <SidebarChannel key={ch.id} label={ch.label} active={!dmTarget && channel === ch.id}
                unread={hasUnread(`ch-${ch.id}`)} starred={starred.has(ch.id)}
                onClick={() => { setChannel(ch.id); setDmTarget(null) }}
                onToggleStar={() => toggleStar(ch.id)} />
            ))}
          </div>

          {/* DMs */}
          <div className="mt-4 flex-1">
            <button
              className="flex items-center gap-1 px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest text-[#9B9C9D] hover:text-white w-full"
              onClick={() => setDmsOpen(v => !v)}
            >
              {dmsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {t('comms_direct_messages')}
            </button>
            {dmsOpen && staff.filter(s => s.id !== myStaff?.id).map(s => (
              <button key={s.id} onClick={() => setDmTarget(s)}
                className={`w-full flex items-center gap-2.5 px-4 py-1 text-sm transition-colors text-left rounded-sm mx-1 ${
                  dmTarget?.id === s.id ? 'bg-[#1164A3] text-white' : 'text-[#C9CACC] hover:bg-white/10'
                }`} style={{ width: 'calc(100% - 8px)' }}>
                <div className="relative flex-shrink-0">
                  <div className="w-5 h-5 rounded-sm overflow-hidden">
                    <Avatar name={s.name} avatarUrl={s.avatar_url} size={5} />
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#1A1D21] ${
                    onlineIds.has(s.id) ? 'bg-emerald-400' : 'bg-[#6B6F76]'
                  }`} />
                </div>
                <span className="truncate flex-1 text-[13px]">{s.name}</span>
                {hasUnread(`dm-${s.id}`) && <span className="w-2 h-2 rounded-full bg-white flex-shrink-0" />}
              </button>
            ))}
          </div>

          {/* My profile */}
          {myStaff && (
            <div className="px-3 py-3 border-t border-white/10 flex items-center gap-2.5 mt-auto">
              <div className="relative flex-shrink-0">
                <Avatar name={myStaff.name} avatarUrl={myStaff.avatar_url} size={8} />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#1A1D21]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-white truncate">{myStaff.name}</p>
                <p className="text-[11px] text-emerald-400">Active</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Main chat area ── */}
        <div className="flex-1 flex flex-col bg-white min-w-0">

          {/* Header */}
          <div className="border-b border-slate-200 px-5 h-12 flex items-center gap-3 flex-shrink-0">
            {dmTarget ? (
              <>
                <div className="relative flex-shrink-0">
                  <Avatar name={dmTarget.name} avatarUrl={dmTarget.avatar_url} size={7} />
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-white ${onlineIds.has(dmTarget.id) ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                </div>
                <span className="font-bold text-slate-900 text-[15px]">{dmTarget.name}</span>
                <span className="text-slate-400 text-xs">{dmTarget.role}</span>
              </>
            ) : (
              <>
                <Hash className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span className="font-bold text-slate-900 text-[15px]">{currentTitle}</span>
                <button onClick={() => toggleStar(channel)} className="ml-1 text-slate-300 hover:text-amber-400 transition-colors">
                  <Star className={`w-3.5 h-3.5 ${starred.has(channel) ? 'fill-amber-400 text-amber-400' : ''}`} />
                </button>
              </>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
            {loading ? (
              <div className="flex justify-center pt-12"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center pb-20">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <Hash className="w-7 h-7 text-slate-400" />
                </div>
                <p className="font-bold text-slate-800 text-lg">Welcome to #{currentTitle}</p>
                <p className="text-slate-400 text-sm mt-1">This is the beginning of the #{currentTitle} channel.</p>
              </div>
            ) : (
              <div className="pt-4">
                {grouped.map(({ date, msgs }) => (
                  <div key={date}>
                    {/* Date divider */}
                    <div className="flex items-center px-5 py-2">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-xs font-semibold text-slate-400 border border-slate-200 rounded-full px-3 py-0.5 mx-3 bg-white">
                        {formatDateDivider(date)}
                      </span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>

                    {msgs.map((msg, i) => {
                      const compact = isCompact(msgs, i)
                      const senderName = resolveSenderName(msg)
                      const avatarUrl = resolveSenderAvatar(msg)
                      const isHovered = hoveredMsgId === msg.id

                      return (
                        <div key={msg.id}
                          className={`relative group px-5 flex gap-3 ${compact ? 'py-0.5' : 'pt-3 pb-0.5'} ${isHovered ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                          onMouseEnter={() => setHoveredMsgId(msg.id)}
                          onMouseLeave={() => setHoveredMsgId(null)}
                        >
                          {/* Avatar or timestamp spacer */}
                          {compact ? (
                            <div className="w-9 flex-shrink-0 flex items-center justify-end">
                              {isHovered && (
                                <span className="text-[10px] text-slate-400 leading-none">{new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                              )}
                            </div>
                          ) : (
                            <div className="w-9 flex-shrink-0 mt-0.5">
                              <Avatar name={senderName} avatarUrl={avatarUrl} size={9} />
                            </div>
                          )}

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            {/* Header row */}
                            {!compact && (
                              <div className="flex items-baseline gap-2 mb-0.5">
                                <span className="font-bold text-slate-900 text-[14px] leading-none">{senderName}</span>
                                <span className="text-[11px] text-slate-400 leading-none">{formatTime(msg.created_at)}</span>
                              </div>
                            )}

                            {/* Reply preview */}
                            {msg.reply_to && (
                              <div className="flex items-start gap-2 mb-1 pl-3 border-l-2 border-slate-300">
                                <div className="min-w-0">
                                  <span className="text-[11px] font-bold text-slate-600 mr-1.5">
                                    {(msg.reply_to.sender as any)?.name ?? 'Unknown'}
                                  </span>
                                  <span className="text-[12px] text-slate-400 truncate">{msg.reply_to.content}</span>
                                </div>
                              </div>
                            )}

                            {/* Message text */}
                            <p className="text-[14px] text-slate-800 leading-relaxed break-words whitespace-pre-wrap">{msg.content}</p>
                          </div>

                          {/* Hover action bar */}
                          {isHovered && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md px-1 py-0.5 z-10">
                              <ActionBtn icon={<Smile className="w-3.5 h-3.5" />} title="React" onClick={() => {}} />
                              <ActionBtn icon={<Reply className="w-3.5 h-3.5" />} title="Reply" onClick={() => { setReplyTo(msg); inputRef.current?.focus() }} />
                              <ActionBtn icon={<MoreHorizontal className="w-3.5 h-3.5" />} title="More" onClick={() => {}} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
                <div ref={bottomRef} className="h-4" />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="px-5 pb-4 pt-2 flex-shrink-0">
            {sendError && <p className="text-xs text-red-500 mb-2">Failed to send: {sendError}</p>}
            <div className="border border-slate-300 rounded-xl overflow-hidden shadow-sm">
              {/* Reply banner */}
              {replyTo && (
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                  <Reply className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <p className="text-[12px] text-slate-500 flex-1 min-w-0 truncate">
                    Replying to <span className="font-semibold text-slate-700">{resolveSenderName(replyTo)}</span>:{' '}
                    {replyTo.content}
                  </p>
                  <button onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Text input */}
              <div className="flex items-end gap-3 px-4 py-3">
                <textarea
                  ref={inputRef}
                  rows={1}
                  className="flex-1 bg-transparent text-[14px] text-slate-800 outline-none placeholder-slate-400 resize-none leading-relaxed"
                  placeholder={`Message ${dmTarget ? dmTarget.name : '#' + currentTitle}`}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                  }}
                  onKeyDown={handleKeyDown}
                  style={{ maxHeight: 120 }}
                />
                <button onClick={sendMessage} disabled={!input.trim()}
                  className={`flex-shrink-0 mb-0.5 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    input.trim() ? 'bg-[#007A5A] hover:bg-[#006849] text-white' : 'bg-slate-100 text-slate-300'
                  }`}>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 px-1">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function SidebarChannel({ label, active, unread, starred, onClick, onToggleStar }: {
  label: string; active: boolean; unread: boolean; starred: boolean
  onClick: () => void; onToggleStar: () => void
}) {
  return (
    <div className={`flex items-center mx-1 rounded-sm group ${active ? 'bg-[#1164A3]' : 'hover:bg-white/10'}`}
      style={{ width: 'calc(100% - 8px)' }}>
      <button onClick={onClick} className={`flex-1 flex items-center gap-2 px-3 py-1 text-[13px] text-left ${
        active ? 'text-white font-medium' : unread ? 'text-white font-semibold' : 'text-[#C9CACC]'
      }`}>
        <Hash className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
        <span className="flex-1 truncate">{label}</span>
        {unread && !active && <span className="w-2 h-2 rounded-full bg-white flex-shrink-0" />}
      </button>
      <button onClick={onToggleStar}
        className={`pr-2 opacity-0 group-hover:opacity-100 transition-opacity ${starred ? 'opacity-100' : ''}`}>
        <Star className={`w-3 h-3 ${starred ? 'fill-amber-400 text-amber-400' : 'text-[#9B9C9D] hover:text-amber-400'}`} />
      </button>
    </div>
  )
}

function ActionBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title}
      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors">
      {icon}
    </button>
  )
}
