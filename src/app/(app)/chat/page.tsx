'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { useLanguage } from '@/components/providers/language-provider'
import { createClient } from '@/lib/supabase/client'
import { Send, Hash, MessageSquare, User, Loader2, Circle } from 'lucide-react'

const CHANNEL_KEYS = [
  { id: 'general', labelKey: 'chat_general' as const, icon: '💬' },
  { id: 'operations', labelKey: 'chat_operations' as const, icon: '🚛' },
  { id: 'drivers', labelKey: 'chat_drivers' as const, icon: '🚚' },
  { id: 'finance', labelKey: 'chat_finance' as const, icon: '💰' },
  { id: 'management', labelKey: 'chat_management' as const, icon: '📊' },
]

interface Message {
  id: string
  channel: string
  sender_id: string | null
  recipient_id: string | null
  content: string
  created_at: string
  sender?: { name: string } | null
}

interface StaffMember {
  id: string
  name: string
  role: string
}

export default function ChatPage() {
  const { t } = useLanguage()
  const CHANNELS = CHANNEL_KEYS.map(c => ({ ...c, label: t(c.labelKey) }))
  // Single stable client for the component lifetime
  const sb = useRef(createClient()).current
  const [channel, setChannel] = useState('general')
  const [dmTarget, setDmTarget] = useState<StaffMember | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [myStaff, setMyStaff] = useState<StaffMember | null>(null)
  const [loading, setLoading] = useState(true)
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load staff and current user, then set up presence
  useEffect(() => {
    let presenceChannel: ReturnType<typeof sb.channel> | null = null
    const init = async () => {
      const { data: { user } } = await sb.auth.getUser()
      const [staffRes, myRes] = await Promise.all([
        sb.from('staff').select('id, name, role').eq('active', true).order('name'),
        user ? sb.from('staff').select('id, name, role').eq('auth_user_id', user.id).single() : Promise.resolve({ data: null }),
      ])
      let myStaffData = (myRes as any).data as StaffMember | null
      // Fallback: if no staff record linked, create a display-only identity from auth email
      if (!myStaffData && user) {
        myStaffData = { id: user.id, name: user.email?.split('@')[0] ?? 'Me', role: '' }
      }
      setStaff((staffRes.data ?? []) as StaffMember[])
      setMyStaff(myStaffData)

      // Presence tracking
      if (myStaffData) {
        presenceChannel = sb.channel('presence-chat', { config: { presence: { key: myStaffData.id } } })
        presenceChannel
          .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel!.presenceState()
            setOnlineIds(new Set(Object.keys(state)))
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await presenceChannel!.track({ staff_id: myStaffData.id, name: myStaffData.name })
            }
          })
      }
    }
    init()
    return () => { presenceChannel?.unsubscribe() }
  }, [])

  const loadMessages = useCallback(async () => {
    setLoading(true)
    let q = sb.from('chat_messages')
      .select('*, sender:staff!sender_id(name)')
      .order('created_at', { ascending: true })
      .limit(100)

    if (dmTarget) {
      // DM: chat_messages between me and target in both directions
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime subscription — unique channel name prevents conflicts on re-subscribe
  useEffect(() => {
    const viewKey = dmTarget ? `dm-${dmTarget.id}` : `ch-${channel}`
    const sub = sb
      .channel(`chat-realtime-${viewKey}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
      }, (payload) => {
        const msg = payload.new as Message
        const isChannelMsg = !msg.recipient_id && msg.channel === channel && !dmTarget
        const isDM = dmTarget && myStaff && (
          (msg.sender_id === myStaff.id && msg.recipient_id === dmTarget.id) ||
          (msg.sender_id === dmTarget.id && msg.recipient_id === myStaff.id)
        )
        if (isChannelMsg || isDM) {
          // Resolve sender name from already-loaded staff list — no extra DB round-trip
          const senderName = [...staff, ...(myStaff ? [myStaff] : [])].find(s => s.id === msg.sender_id)?.name ?? null
          const enriched: Message = { ...msg, sender: senderName ? { name: senderName } : null }
          setMessages(prev => {
            // Deduplicate: skip if a message with same id already exists
            if (prev.some(m => m.id === enriched.id)) return prev
            return [...prev, enriched]
          })
        }
      })
      .subscribe()
    return () => { sub.unsubscribe() }
  }, [channel, dmTarget, myStaff, staff, sb])

  const [sendError, setSendError] = useState<string | null>(null)

  const sendMessage = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    setSendError(null)
    inputRef.current?.focus()
    const { error } = await sb.from('chat_messages').insert({
      channel: dmTarget ? null : channel,
      sender_id: myStaff?.id ?? null,
      recipient_id: dmTarget?.id ?? null,
      content: text,
    })
    if (error) {
      console.error('[chat] insert failed:', error)
      setSendError(error.message)
      setInput(text) // restore so user can retry
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    return isToday
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Group messages by date
  const groupedMessages: { date: string; msgs: Message[] }[] = []
  for (const msg of messages) {
    const date = new Date(msg.created_at).toDateString()
    const last = groupedMessages[groupedMessages.length - 1]
    if (last && last.date === date) {
      last.msgs.push(msg)
    } else {
      groupedMessages.push({ date, msgs: [msg] })
    }
  }

  const currentTitle = dmTarget
    ? `DM · ${dmTarget.name}`
    : `#${CHANNELS.find(c => c.id === channel)?.label ?? channel}`

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar title="nav_chat" titleIsKey />
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Sidebar */}
        <div className="w-56 bg-slate-900 text-white flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-slate-700">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{t('comms_channels')}</p>
            {CHANNELS.map(ch => (
              <button
                key={ch.id}
                onClick={() => { setChannel(ch.id); setDmTarget(null) }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  !dmTarget && channel === ch.id ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Hash className="w-3.5 h-3.5 flex-shrink-0" />
                {ch.label}
              </button>
            ))}
          </div>

          <div className="p-3 flex-1 overflow-y-auto">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{t('comms_direct_messages')}</p>
            {staff.filter(s => s.id !== myStaff?.id).map(s => (
              <button
                key={s.id}
                onClick={() => setDmTarget(s)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  dmTarget?.id === s.id ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold">
                    {s.name[0]}
                  </div>
                </div>
                <span className="truncate">{s.name}</span>
              </button>
            ))}
          </div>

          {myStaff && (
            <div className="p-3 border-t border-slate-700">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500" />
                <span className="truncate">{myStaff.name}</span>
              </div>
            </div>
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-white min-w-0">
          {/* Header */}
          <div className="border-b px-5 py-3 flex items-center gap-2">
            {dmTarget ? <User className="w-4 h-4 text-slate-400" /> : <Hash className="w-4 h-4 text-slate-400" />}
            <span className="font-semibold text-slate-800">{currentTitle}</span>
            {dmTarget && <span className="text-xs text-slate-400 ml-1">· {dmTarget.role}</span>}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {loading ? (
              <div className="flex justify-center pt-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageSquare className="w-10 h-10 text-slate-200 mb-3" />
                <p className="font-medium text-slate-400">{t('chat_no_messages')}</p>
              </div>
            ) : (
              groupedMessages.map(({ date, msgs }) => (
                <div key={date}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 h-px bg-slate-100" />
                    <span className="text-xs text-slate-400 bg-white px-2">
                      {new Date(date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                    </span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  <div className="space-y-3">
                    {msgs.map((msg, i) => {
                      const isMe = msg.sender_id === myStaff?.id
                      const showSender = i === 0 || msgs[i - 1].sender_id !== msg.sender_id
                      return (
                        <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                          {showSender && (
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1 ${
                              isMe ? 'bg-cyan-600 text-white' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {((msg.sender as any)?.name ?? '?')[0].toUpperCase()}
                            </div>
                          )}
                          {!showSender && <div className="w-7 flex-shrink-0" />}
                          <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                            {showSender && (
                              <div className={`flex items-baseline gap-2 mb-0.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                                <span className="text-xs font-semibold text-slate-700">
                                  {isMe ? t('chat_you') : (msg.sender as any)?.name ?? 'Unknown'}
                                </span>
                                <span className="text-xs text-slate-400">{formatTime(msg.created_at)}</span>
                              </div>
                            )}
                            <div className={`rounded-2xl px-4 py-2 text-sm ${
                              isMe
                                ? 'bg-cyan-600 text-white rounded-tr-sm'
                                : 'bg-slate-100 text-slate-800 rounded-tl-sm'
                            }`}>
                              {msg.content}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t px-4 py-3">
            {sendError && (
              <p className="text-xs text-red-500 mb-2 px-1">Failed to send: {sendError}</p>
            )}
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl border px-4 py-2.5">
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-sm outline-none placeholder-slate-400"
                placeholder={t('chat_type_placeholder')}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                className="text-cyan-600 hover:text-cyan-700 disabled:text-slate-300 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5 text-center">Press Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </div>
  )
}
