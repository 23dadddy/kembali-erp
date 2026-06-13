'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { useLanguage } from '@/components/providers/language-provider'
import { createClient } from '@/lib/supabase/client'
import {
  Send, Hash, Loader2, Star, Reply, X, Smile,
  MoreHorizontal, ChevronDown, ChevronRight, Plus, Pencil, Check,
} from 'lucide-react'

// ─── Default channels ────────────────────────────────────────────────────────
const DEFAULT_CHANNELS = [
  { id: 'general',    name: 'General' },
  { id: 'operations', name: 'Operations' },
  { id: 'drivers',    name: 'Drivers' },
  { id: 'finance',    name: 'Finance' },
  { id: 'management', name: 'Management' },
]

// ─── Avatar helpers ──────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#E8A87C','#85C1E9','#82E0AA','#F1948A','#BB8FCE',
  '#F8C471','#76D7C4','#F0B27A','#AED6F1','#A9DFBF',
]
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

// ─── Types ───────────────────────────────────────────────────────────────────
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

interface Channel {
  id: string
  name: string
}

// ─── Avatar component ────────────────────────────────────────────────────────
function Avatar({ name, avatarUrl, size = 9 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const px = size * 4
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} style={{ width: px, height: px }} className="rounded-lg object-cover flex-shrink-0" />
  }
  return (
    <div className="rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0 select-none"
      style={{ width: px, height: px, background: avatarColor(name), fontSize: px * 0.38 }}>
      {name[0]?.toUpperCase()}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { t } = useLanguage()
  const sb = useRef(createClient()).current

  // ── channels (persisted to localStorage) ──
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_CHANNELS)
  const [channelNames, setChannelNames] = useState<Record<string, string>>({})

  // ── view state ──
  const [channel, setChannel] = useState('general')
  const [dmTarget, setDmTarget] = useState<StaffMember | null>(null)

  // ── messages ──
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sendError, setSendError] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<string | null>(null)
  const [contextMenuMsgId, setContextMenuMsgId] = useState<string | null>(null)
  const [copyToast, setCopyToast] = useState(false)

  // ── people ──
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [myStaff, setMyStaff] = useState<StaffMember | null>(null)
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set())
  const staffMap = useRef<Map<string, StaffMember>>(new Map())

  // ── sidebar UI ──
  const [channelsOpen, setChannelsOpen] = useState(true)
  const [dmsOpen, setDmsOpen] = useState(true)
  const [starred, setStarred] = useState<Set<string>>(new Set())

  // ── unread ──
  const [lastRead, setLastRead] = useState<Record<string, string>>({})
  const [latestTs, setLatestTs] = useState<Record<string, string>>({})

  // ── modals ──
  const [newChannelOpen, setNewChannelOpen] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newDmOpen, setNewDmOpen] = useState(false)
  const [dmSearch, setDmSearch] = useState('')
  const [renamingChannel, setRenamingChannel] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const newDmRef = useRef<HTMLDivElement>(null)
  const newChannelInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // ── load persisted state ──
  useEffect(() => {
    try {
      const s = localStorage.getItem('chat_starred')
      if (s) setStarred(new Set(JSON.parse(s)))
      const lr = localStorage.getItem('chat_last_read')
      if (lr) setLastRead(JSON.parse(lr))
      const cn = localStorage.getItem('chat_channel_names')
      if (cn) {
        const parsed: Record<string, string> = JSON.parse(cn)
        setChannelNames(parsed)
        setChannels(prev => prev.map(c => parsed[c.id] ? { ...c, name: parsed[c.id] } : c))
      }
      const cc = localStorage.getItem('chat_custom_channels')
      if (cc) {
        const custom: Channel[] = JSON.parse(cc)
        setChannels(prev => {
          const existingIds = new Set(prev.map(c => c.id))
          return [...prev, ...custom.filter(c => !existingIds.has(c.id))]
        })
      }
    } catch {}
  }, [])

  // ── close DM picker on outside click ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (newDmRef.current && !newDmRef.current.contains(e.target as Node)) setNewDmOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // focus rename input when editing starts
  useEffect(() => {
    if (renamingChannel) setTimeout(() => renameInputRef.current?.focus(), 30)
  }, [renamingChannel])

  // focus new channel input
  useEffect(() => {
    if (newChannelOpen) setTimeout(() => newChannelInputRef.current?.focus(), 30)
  }, [newChannelOpen])

  // ── helpers ──
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
    const lt = latestTs[key]; const lr = lastRead[key]
    if (!lt) return false; if (!lr) return true; return lt > lr
  }

  // ── rename channel ──
  const commitRename = (id: string) => {
    const trimmed = renameValue.trim()
    if (!trimmed) { setRenamingChannel(null); return }
    setChannels(prev => prev.map(c => c.id === id ? { ...c, name: trimmed } : c))
    const next = { ...channelNames, [id]: trimmed }
    setChannelNames(next)
    localStorage.setItem('chat_channel_names', JSON.stringify(next))
    setRenamingChannel(null)
  }

  // ── create new channel ──
  const createChannel = () => {
    const name = newChannelName.trim()
    if (!name) return
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (channels.find(c => c.id === id)) { setNewChannelName(''); setNewChannelOpen(false); return }
    const newCh: Channel = { id, name }
    setChannels(prev => {
      const updated = [...prev, newCh]
      const customs = updated.filter(c => !DEFAULT_CHANNELS.find(d => d.id === c.id))
      localStorage.setItem('chat_custom_channels', JSON.stringify(customs))
      return updated
    })
    setNewChannelName('')
    setNewChannelOpen(false)
    setChannel(id)
    setDmTarget(null)
  }

  // ── init staff + presence ──
  useEffect(() => {
    let presenceChannel: ReturnType<typeof sb.channel> | null = null
    const init = async () => {
      const { data: { user } } = await sb.auth.getUser()
      const [staffRes, myRes] = await Promise.all([
        sb.from('staff').select('id, name, role, avatar_url').order('name'),
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
            if (status === 'SUBSCRIBED') await presenceChannel!.track({ staff_id: myStaffData!.id })
          })
      }

      const { data: latestMsgs } = await sb.from('chat_messages').select('channel, created_at')
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

  const resolveSenderName = (msg: Message) => {
    if (msg.sender_id === myStaff?.id) return myStaff?.name ?? 'You'
    const s = staffMap.current.get(msg.sender_id ?? '')
    return s?.name ?? (msg.sender as any)?.name ?? 'Unknown'
  }
  const resolveSenderAvatar = (msg: Message) => {
    if (msg.sender_id === myStaff?.id) return myStaff?.avatar_url ?? null
    const s = staffMap.current.get(msg.sender_id ?? '')
    return s?.avatar_url ?? (msg.sender as any)?.avatar_url ?? null
  }

  // ── load messages ──
  const loadMessages = useCallback(async () => {
    setLoading(true)
    let q = sb.from('chat_messages')
      .select('id, channel, sender_id, recipient_id, content, created_at, reply_to_id, sender:staff!sender_id(name, avatar_url), reply_to:chat_messages!reply_to_id(content, sender:staff!sender_id(name))')
      .order('created_at', { ascending: true }).limit(200)
    if (dmTarget && myStaff) {
      q = q.or(`and(sender_id.eq.${myStaff.id},recipient_id.eq.${dmTarget.id}),and(sender_id.eq.${dmTarget.id},recipient_id.eq.${myStaff.id})`)
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
  useEffect(() => { setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50) }, [messages])

  // ── realtime ──
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

  // ── send ──
  const deleteMessage = async (id: string) => {
    await sb.from('chat_messages').delete().eq('id', id)
    setMessages(prev => prev.filter(m => m.id !== id))
    setContextMenuMsgId(null)
  }

  const copyText = (content: string) => {
    navigator.clipboard.writeText(content)
    setCopyToast(true)
    setTimeout(() => setCopyToast(false), 2000)
    setContextMenuMsgId(null)
  }

  // close popups on outside click
  useEffect(() => {
    const handler = () => { setEmojiPickerMsgId(null); setContextMenuMsgId(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
    const d = new Date(iso), now = new Date()
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  const formatDateDivider = (dateStr: string) => {
    const d = new Date(dateStr), now = new Date()
    const yest = new Date(now); yest.setDate(now.getDate() - 1)
    if (d.toDateString() === now.toDateString()) return 'Today'
    if (d.toDateString() === yest.toDateString()) return 'Yesterday'
    return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  }

  const isCompact = (msgs: Message[], i: number) => {
    if (i === 0 || msgs[i].reply_to_id) return false
    const diff = new Date(msgs[i].created_at).getTime() - new Date(msgs[i - 1].created_at).getTime()
    return msgs[i].sender_id === msgs[i - 1].sender_id && diff < 5 * 60 * 1000
  }

  const grouped: { date: string; msgs: Message[] }[] = []
  for (const msg of messages) {
    const date = new Date(msg.created_at).toDateString()
    const last = grouped[grouped.length - 1]
    if (last?.date === date) last.msgs.push(msg)
    else grouped.push({ date, msgs: [msg] })
  }

  const currentChannelName = channels.find(c => c.id === channel)?.name ?? channel
  const currentTitle = dmTarget ? dmTarget.name : currentChannelName
  const starredChannels = channels.filter(c => starred.has(c.id))
  const dmSearchLower = dmSearch.toLowerCase()
  const filteredStaff = staff.filter(s => s.id !== myStaff?.id && s.name.toLowerCase().includes(dmSearchLower))

  // ── active DM list (people we've DM'd or started conversation with) ──
  const activeDmIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (dmTarget) activeDmIds.current.add(dmTarget.id)
  }, [dmTarget])
  const dmList = staff.filter(s => s.id !== myStaff?.id && (activeDmIds.current.has(s.id) || dmTarget?.id === s.id || hasUnread(`dm-${s.id}`)))

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar title="nav_chat" titleIsKey />
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ══ Sidebar ══════════════════════════════════════════════════════ */}
        <div className="w-64 flex flex-col flex-shrink-0 overflow-y-auto select-none" style={{ background: '#1A1D21', color: '#D1D2D3' }}>

          {/* Starred */}
          {starredChannels.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-bold uppercase tracking-widest px-4 mb-1 text-[#9B9C9D]">Starred</p>
              {starredChannels.map(ch => (
                <SidebarChannel key={ch.id} channel={ch}
                  active={!dmTarget && channel === ch.id}
                  unread={hasUnread(`ch-${ch.id}`)} starred
                  renaming={renamingChannel === ch.id} renameValue={renameValue}
                  onRenameChange={setRenameValue}
                  onRenameCommit={() => commitRename(ch.id)}
                  onRenameCancel={() => setRenamingChannel(null)}
                  renameInputRef={renamingChannel === ch.id ? renameInputRef : undefined}
                  onClick={() => { setChannel(ch.id); setDmTarget(null) }}
                  onToggleStar={() => toggleStar(ch.id)}
                  onRename={() => { setRenamingChannel(ch.id); setRenameValue(ch.name) }} />
              ))}
            </div>
          )}

          {/* Channels */}
          <div className="mt-4">
            <div className="flex items-center px-3 mb-0.5">
              <button className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-[#9B9C9D] hover:text-white flex-1 text-left"
                onClick={() => setChannelsOpen(v => !v)}>
                {channelsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Channels
              </button>
              <button onClick={() => setNewChannelOpen(true)}
                className="text-[#9B9C9D] hover:text-white p-0.5 rounded transition-colors" title="Add channel">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* New channel input */}
            {newChannelOpen && (
              <div className="mx-2 mb-2 bg-[#27292D] rounded-lg p-2">
                <p className="text-[11px] text-[#9B9C9D] mb-1.5 px-1">Channel name</p>
                <input
                  ref={newChannelInputRef}
                  className="w-full bg-[#1A1D21] text-white text-[13px] rounded px-2 py-1.5 outline-none border border-[#424649] focus:border-[#5BA3A0] placeholder-[#6B6F76]"
                  placeholder="e.g. marketing"
                  value={newChannelName}
                  onChange={e => setNewChannelName(e.target.value.toLowerCase().replace(/\s/g, '-'))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') createChannel()
                    if (e.key === 'Escape') { setNewChannelOpen(false); setNewChannelName('') }
                  }}
                />
                <div className="flex gap-1.5 mt-2">
                  <button onClick={createChannel}
                    className="flex-1 bg-[#007A5A] hover:bg-[#006849] text-white text-[12px] font-medium rounded py-1 transition-colors">
                    Create
                  </button>
                  <button onClick={() => { setNewChannelOpen(false); setNewChannelName('') }}
                    className="px-2 text-[#9B9C9D] hover:text-white text-[12px] rounded transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {channelsOpen && channels.map(ch => (
              <SidebarChannel key={ch.id} channel={ch}
                active={!dmTarget && channel === ch.id}
                unread={hasUnread(`ch-${ch.id}`)} starred={starred.has(ch.id)}
                renaming={renamingChannel === ch.id} renameValue={renameValue}
                onRenameChange={setRenameValue}
                onRenameCommit={() => commitRename(ch.id)}
                onRenameCancel={() => setRenamingChannel(null)}
                renameInputRef={renamingChannel === ch.id ? renameInputRef : undefined}
                onClick={() => { setChannel(ch.id); setDmTarget(null) }}
                onToggleStar={() => toggleStar(ch.id)}
                onRename={() => { setRenamingChannel(ch.id); setRenameValue(ch.name) }} />
            ))}
          </div>

          {/* Direct Messages */}
          <div className="mt-4 flex-1">
            <div className="flex items-center px-3 mb-0.5">
              <button className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-[#9B9C9D] hover:text-white flex-1 text-left"
                onClick={() => setDmsOpen(v => !v)}>
                {dmsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Direct Messages
              </button>
              <div className="relative" ref={newDmRef}>
                <button onClick={() => { setNewDmOpen(v => !v); setDmSearch('') }}
                  className="text-[#9B9C9D] hover:text-white p-0.5 rounded transition-colors" title="New message">
                  <Plus className="w-3.5 h-3.5" />
                </button>

                {/* DM picker dropdown */}
                {newDmOpen && (
                  <div className="absolute left-0 top-6 w-60 bg-[#27292D] rounded-xl shadow-xl border border-[#424649] z-50 overflow-hidden">
                    <div className="p-2 border-b border-[#424649]">
                      <p className="text-[12px] font-semibold text-white mb-1.5 px-1">New direct message</p>
                      <input
                        autoFocus
                        className="w-full bg-[#1A1D21] text-white text-[13px] rounded px-2.5 py-1.5 outline-none border border-[#424649] focus:border-[#5BA3A0] placeholder-[#6B6F76]"
                        placeholder="Search people..."
                        value={dmSearch}
                        onChange={e => setDmSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Escape' && setNewDmOpen(false)}
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto py-1">
                      {filteredStaff.length === 0 ? (
                        <p className="text-[12px] text-[#9B9C9D] px-3 py-2">No people found</p>
                      ) : filteredStaff.map(s => (
                        <button key={s.id}
                          onClick={() => { setDmTarget(s); activeDmIds.current.add(s.id); setNewDmOpen(false); setDmSearch('') }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/10 transition-colors text-left">
                          <div className="relative flex-shrink-0">
                            <Avatar name={s.name} avatarUrl={s.avatar_url} size={7} />
                            <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#27292D] ${onlineIds.has(s.id) ? 'bg-emerald-400' : 'bg-[#6B6F76]'}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] text-white font-medium truncate">{s.name}</p>
                            <p className="text-[11px] text-[#9B9C9D] truncate">{s.role}</p>
                          </div>
                          {onlineIds.has(s.id) && <span className="ml-auto text-[10px] text-emerald-400 flex-shrink-0">Active</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {dmsOpen && dmList.map(s => (
              <button key={s.id} onClick={() => { setDmTarget(s); activeDmIds.current.add(s.id) }}
                className={`w-full flex items-center gap-2.5 px-3 py-1 text-[13px] transition-colors text-left rounded-sm mx-1 ${
                  dmTarget?.id === s.id ? 'bg-[#1164A3] text-white' : 'text-[#C9CACC] hover:bg-white/10'
                }`} style={{ width: 'calc(100% - 8px)' }}>
                <div className="relative flex-shrink-0">
                  <Avatar name={s.name} avatarUrl={s.avatar_url} size={6} />
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#1A1D21] ${onlineIds.has(s.id) ? 'bg-emerald-400' : 'bg-[#6B6F76]'}`} />
                </div>
                <span className="truncate flex-1">{s.name}</span>
                {hasUnread(`dm-${s.id}`) && <span className="w-2 h-2 rounded-full bg-white flex-shrink-0" />}
              </button>
            ))}

            {dmsOpen && dmList.length === 0 && (
              <p className="text-[12px] text-[#6B6F76] px-4 py-1.5 italic">No conversations yet</p>
            )}
          </div>

          {/* My profile */}
          {myStaff && (
            <div className="px-3 py-3 border-t border-white/10 flex items-center gap-2.5">
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

        {/* ══ Main chat area ═══════════════════════════════════════════════ */}
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
                <button onClick={() => setDmTarget(null)}
                  className="ml-auto text-slate-300 hover:text-slate-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <Hash className="w-4 h-4 text-slate-500 flex-shrink-0" />
                {renamingChannel === channel ? (
                  <form onSubmit={e => { e.preventDefault(); commitRename(channel) }} className="flex items-center gap-2">
                    <input
                      ref={renameInputRef}
                      className="text-[15px] font-bold text-slate-900 bg-transparent border-b-2 border-[#5BA3A0] outline-none"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => e.key === 'Escape' && setRenamingChannel(null)}
                    />
                    <button type="submit" className="text-[#5BA3A0]"><Check className="w-4 h-4" /></button>
                    <button type="button" onClick={() => setRenamingChannel(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
                  </form>
                ) : (
                  <>
                    <span className="font-bold text-slate-900 text-[15px]">{currentChannelName}</span>
                    <button onClick={() => { setRenamingChannel(channel); setRenameValue(currentChannelName) }}
                      className="text-slate-300 hover:text-slate-600 transition-colors" title="Rename channel">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => toggleStar(channel)} className="text-slate-300 hover:text-amber-400 transition-colors">
                      <Star className={`w-3.5 h-3.5 ${starred.has(channel) ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
            {loading ? (
              <div className="flex justify-center pt-12"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-start px-6 pt-8 pb-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: avatarColor(currentTitle) }}>
                  {dmTarget
                    ? <span className="text-white font-bold text-2xl">{currentTitle[0]?.toUpperCase()}</span>
                    : <Hash className="w-7 h-7 text-white" />}
                </div>
                <p className="font-bold text-slate-900 text-xl mb-1">
                  {dmTarget ? currentTitle : `#${currentTitle}`}
                </p>
                <p className="text-slate-500 text-sm">
                  {dmTarget
                    ? `This is the beginning of your direct message history with ${currentTitle}.`
                    : `This is the very beginning of the #${currentTitle} channel.`}
                </p>
              </div>
            ) : (
              <div className="pt-2">
                {grouped.map(({ date, msgs }) => (
                  <div key={date}>
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
                          onMouseLeave={() => setHoveredMsgId(null)}>

                          {compact ? (
                            <div className="w-9 flex-shrink-0 flex items-center justify-end">
                              {isHovered && (
                                <span className="text-[10px] text-slate-400 leading-none">
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="w-9 flex-shrink-0 mt-0.5">
                              <Avatar name={senderName} avatarUrl={avatarUrl} size={9} />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            {!compact && (
                              <div className="flex items-baseline gap-2 mb-0.5">
                                <span className="font-bold text-slate-900 text-[14px] leading-none">{senderName}</span>
                                <span className="text-[11px] text-slate-400 leading-none">{formatTime(msg.created_at)}</span>
                              </div>
                            )}

                            {msg.reply_to && (
                              <div className="flex items-start gap-2 mb-1 pl-2 border-l-2 border-slate-300">
                                <div className="min-w-0">
                                  <span className="text-[11px] font-bold text-slate-600 mr-1.5">
                                    {(msg.reply_to.sender as any)?.name ?? 'Unknown'}
                                  </span>
                                  <span className="text-[12px] text-slate-400 truncate">{msg.reply_to.content}</span>
                                </div>
                              </div>
                            )}

                            <p className="text-[14px] text-slate-800 leading-relaxed break-words whitespace-pre-wrap">{msg.content}</p>
                          </div>

                          {isHovered && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md px-1 py-0.5 z-10"
                              onMouseDown={e => e.stopPropagation()}>
                              {/* Emoji picker */}
                              <div className="relative">
                                <ActionBtn icon={<Smile className="w-3.5 h-3.5" />} title="React"
                                  onClick={() => setEmojiPickerMsgId(p => p === msg.id ? null : msg.id)} />
                                {emojiPickerMsgId === msg.id && (
                                  <div className="absolute bottom-8 right-0 bg-white border border-slate-200 rounded-xl shadow-xl p-2 flex gap-1 z-20"
                                    onMouseDown={e => e.stopPropagation()}>
                                    {['👍','❤️','😂','😮','😢','🎉','🔥','✅'].map(emoji => (
                                      <button key={emoji}
                                        className="text-lg hover:bg-slate-100 rounded-lg w-8 h-8 flex items-center justify-center transition-colors"
                                        onClick={() => setEmojiPickerMsgId(null)}
                                        title={emoji}>
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Reply */}
                              <ActionBtn icon={<Reply className="w-3.5 h-3.5" />} title="Reply"
                                onClick={() => { setReplyTo(msg); inputRef.current?.focus() }} />

                              {/* More menu */}
                              <div className="relative">
                                <ActionBtn icon={<MoreHorizontal className="w-3.5 h-3.5" />} title="More"
                                  onClick={() => setContextMenuMsgId(p => p === msg.id ? null : msg.id)} />
                                {contextMenuMsgId === msg.id && (
                                  <div className="absolute bottom-8 right-0 bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[160px] z-20"
                                    onMouseDown={e => e.stopPropagation()}>
                                    <MenuBtn label="Reply" onClick={() => { setReplyTo(msg); inputRef.current?.focus(); setContextMenuMsgId(null) }} />
                                    <MenuBtn label="Copy text" onClick={() => copyText(msg.content)} />
                                    {msg.sender_id === myStaff?.id && (
                                      <MenuBtn label="Delete message" danger onClick={() => deleteMessage(msg.id)} />
                                    )}
                                  </div>
                                )}
                              </div>
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

          {/* Copy toast */}
          {copyToast && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg z-50 pointer-events-none">
              Copied to clipboard
            </div>
          )}

          {/* Input */}
          <div className="px-5 pb-4 pt-2 flex-shrink-0">
            {sendError && <p className="text-xs text-red-500 mb-2">Failed to send: {sendError}</p>}
            <div className="border border-slate-300 rounded-xl overflow-hidden shadow-sm">
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
              <div className="flex items-end gap-3 px-4 py-3">
                <textarea
                  ref={inputRef}
                  rows={1}
                  className="flex-1 bg-transparent text-[14px] text-slate-800 outline-none placeholder-slate-400 resize-none leading-relaxed"
                  placeholder={`Message ${dmTarget ? dmTarget.name : '#' + currentChannelName}`}
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

// ─── Sidebar channel row ──────────────────────────────────────────────────────
function SidebarChannel({ channel, active, unread, starred, renaming, renameValue, onRenameChange, onRenameCommit, onRenameCancel, renameInputRef, onClick, onToggleStar, onRename }: {
  channel: Channel; active: boolean; unread: boolean; starred: boolean
  renaming: boolean; renameValue: string
  onRenameChange: (v: string) => void; onRenameCommit: () => void; onRenameCancel: () => void
  renameInputRef?: React.RefObject<HTMLInputElement | null>
  onClick: () => void; onToggleStar: () => void; onRename: () => void
}) {
  return (
    <div className={`flex items-center mx-1 rounded-sm group ${active ? 'bg-[#1164A3]' : 'hover:bg-white/10'}`}
      style={{ width: 'calc(100% - 8px)' }}>
      {renaming ? (
        <div className="flex items-center gap-1 flex-1 px-2 py-1">
          <Hash className="w-3.5 h-3.5 text-[#9B9C9D] flex-shrink-0" />
          <input
            ref={renameInputRef as React.RefObject<HTMLInputElement>}
            className="flex-1 bg-transparent text-white text-[13px] outline-none border-b border-[#5BA3A0] min-w-0"
            value={renameValue}
            onChange={e => onRenameChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onRenameCommit(); if (e.key === 'Escape') onRenameCancel() }}
          />
          <button onClick={onRenameCommit} className="text-emerald-400 hover:text-emerald-300 flex-shrink-0">
            <Check className="w-3 h-3" />
          </button>
          <button onClick={onRenameCancel} className="text-[#9B9C9D] hover:text-white flex-shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <>
          <button onClick={onClick} className={`flex-1 flex items-center gap-2 px-3 py-1 text-[13px] text-left ${
            active ? 'text-white font-medium' : unread ? 'text-white font-semibold' : 'text-[#C9CACC]'
          }`}>
            <Hash className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
            <span className="flex-1 truncate">{channel.name}</span>
            {unread && !active && <span className="w-2 h-2 rounded-full bg-white flex-shrink-0" />}
          </button>
          <div className="flex items-center gap-0.5 pr-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={e => { e.stopPropagation(); onRename() }} className="p-0.5 text-[#9B9C9D] hover:text-white rounded">
              <Pencil className="w-2.5 h-2.5" />
            </button>
            <button onClick={e => { e.stopPropagation(); onToggleStar() }} className="p-0.5 rounded">
              <Star className={`w-2.5 h-2.5 ${starred ? 'fill-amber-400 text-amber-400' : 'text-[#9B9C9D] hover:text-amber-400'}`} />
            </button>
          </div>
        </>
      )}
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

function MenuBtn({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-2 text-[13px] hover:bg-slate-50 transition-colors ${danger ? 'text-red-500 hover:bg-red-50' : 'text-slate-700'}`}>
      {label}
    </button>
  )
}
