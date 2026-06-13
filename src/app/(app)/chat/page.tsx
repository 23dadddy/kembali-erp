'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { useLanguage } from '@/components/providers/language-provider'
import { createClient } from '@/lib/supabase/client'
import {
  Send, Hash, Loader2, Star, Reply, X, Smile,
  MoreHorizontal, ChevronDown, ChevronRight, Plus, Pencil, Check,
  Trash2, Users,
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
  // reactions: msgId -> emoji -> count
  const [reactions, setReactions] = useState<Record<string, Record<string, number>>>({})
  const [myReactions, setMyReactions] = useState<Record<string, Set<string>>>({})

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
  const [deletingChannel, setDeletingChannel] = useState<Channel | null>(null)
  const [manageMembersChannel, setManageMembersChannel] = useState<Channel | null>(null)
  const [manageMembersSearch, setManageMembersSearch] = useState('')
  const [pendingMembers, setPendingMembers] = useState<Set<string>>(new Set())
  const [savingMembers, setSavingMembers] = useState(false)

  // ── channel access control ──
  const [channelMembers, setChannelMembers] = useState<Record<string, string[]>>({})
  const [deletedChannels, setDeletedChannels] = useState<Set<string>>(new Set())

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const newChannelInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  // mirror messages in a ref so realtime callback can read latest state
  const messagesRef = useRef<Message[]>([])

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
      const dc = localStorage.getItem('chat_deleted_channels')
      if (dc) setDeletedChannels(new Set(JSON.parse(dc)))
    } catch {}
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
  const commitRename = async (id: string) => {
    const trimmed = renameValue.trim()
    if (!trimmed) { setRenamingChannel(null); return }
    const oldName = channels.find(c => c.id === id)?.name ?? id
    setChannels(prev => prev.map(c => c.id === id ? { ...c, name: trimmed } : c))
    const next = { ...channelNames, [id]: trimmed }
    setChannelNames(next)
    localStorage.setItem('chat_channel_names', JSON.stringify(next))
    setRenamingChannel(null)
    // Post system message into the channel
    const actor = myStaff?.name ?? 'Someone'
    await sb.from('chat_messages').insert({
      channel: id,
      sender_id: null,
      recipient_id: null,
      content: `__system__ ${actor} renamed this channel from "${oldName}" to "${trimmed}"`,
    })
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

  // ── delete channel (admin only) ──
  const deleteChannel = (id: string) => {
    setDeletedChannels(prev => {
      const next = new Set(prev)
      next.add(id)
      localStorage.setItem('chat_deleted_channels', JSON.stringify([...next]))
      return next
    })
    if (channel === id) {
      const fallback = channels.find(c => c.id !== id && !deletedChannels.has(c.id))
      if (fallback) setChannel(fallback.id)
    }
    setDeletingChannel(null)
  }

  // ── save channel membership ──
  const saveMembership = async () => {
    if (!manageMembersChannel) return
    setSavingMembers(true)
    const channelId = manageMembersChannel.id
    await sb.from('channel_members').delete().eq('channel_id', channelId)
    if (pendingMembers.size > 0) {
      await sb.from('channel_members').insert(
        [...pendingMembers].map(staffId => ({ channel_id: channelId, staff_id: staffId, added_by: myStaff?.id ?? null }))
      )
    }
    setChannelMembers(prev => ({ ...prev, [channelId]: [...pendingMembers] }))
    setSavingMembers(false)
    setManageMembersChannel(null)
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

      // Load channel membership map
      const { data: memberRows } = await sb.from('channel_members').select('channel_id, staff_id')
      if (memberRows) {
        const map: Record<string, string[]> = {}
        for (const row of memberRows as { channel_id: string; staff_id: string }[]) {
          if (!map[row.channel_id]) map[row.channel_id] = []
          map[row.channel_id].push(row.staff_id)
        }
        setChannelMembers(map)
      }

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
      .select('id, channel, sender_id, recipient_id, content, created_at, reply_to_id, sender:staff!sender_id(name, avatar_url)')
      .order('created_at', { ascending: true }).limit(200)
    if (dmTarget && myStaff) {
      q = q.or(`and(sender_id.eq.${myStaff.id},recipient_id.eq.${dmTarget.id}),and(sender_id.eq.${dmTarget.id},recipient_id.eq.${myStaff.id})`)
    } else if (dmTarget) {
      q = q.eq('recipient_id', dmTarget.id)
    } else {
      q = q.eq('channel', channel).is('recipient_id', null)
    }
    const { data } = await q
    let msgs = (data ?? []) as unknown as Message[]

    // Fetch reply_to data separately (self-referential join returns array in PostgREST)
    const replyIds = [...new Set(msgs.filter(m => m.reply_to_id).map(m => m.reply_to_id!))]
    if (replyIds.length > 0) {
      const { data: parents } = await sb.from('chat_messages')
        .select('id, content, sender_id, sender:staff!sender_id(name)')
        .in('id', replyIds)
      if (parents) {
        const parentMap = new Map(parents.map((p: any) => [p.id, p]))
        msgs = msgs.map(m => {
          if (!m.reply_to_id) return m
          const parent = parentMap.get(m.reply_to_id) as any
          if (!parent) return m
          const senderName = parent.sender?.name ?? staffMap.current.get(parent.sender_id ?? '')?.name ?? null
          return { ...m, reply_to: { content: parent.content, sender: senderName ? { name: senderName } : null } }
        })
      }
    }

    messagesRef.current = msgs
    setMessages(msgs)
    setLoading(false)
  }, [channel, dmTarget, myStaff])

  useEffect(() => { loadMessages() }, [loadMessages])
  useEffect(() => { setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50) }, [messages])

  // ── realtime ──
  useEffect(() => {
    const sub = sb.channel(`chat-${viewKey}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const msg = payload.new as Message
        const isChannelMsg = !msg.recipient_id && msg.channel === channel && !dmTarget
        const isDM = dmTarget && myStaff && (
          (msg.sender_id === myStaff.id && msg.recipient_id === dmTarget.id) ||
          (msg.sender_id === dmTarget.id && msg.recipient_id === myStaff.id)
        )
        if (isChannelMsg || isDM) {
          const senderData = staffMap.current.get(msg.sender_id ?? '')

          // resolve reply_to from local cache first, fallback to DB fetch
          let replyTo: Message['reply_to'] = null
          if (msg.reply_to_id) {
            const local = messagesRef.current.find(m => m.id === msg.reply_to_id)
            if (local) {
              const replySender = staffMap.current.get(local.sender_id ?? '')
              replyTo = { content: local.content, sender: replySender ? { name: replySender.name } : (local.sender ?? null) }
            } else {
              // fetch from DB
              const { data: rd } = await sb.from('chat_messages')
                .select('content, sender:staff!sender_id(name)')
                .eq('id', msg.reply_to_id)
                .single()
              if (rd) replyTo = rd as any
            }
          }

          const enriched: Message = {
            ...msg,
            sender: senderData ? { name: senderData.name, avatar_url: senderData.avatar_url } : null,
            reply_to: replyTo,
          }
          messagesRef.current = [...messagesRef.current.filter(m => m.id !== enriched.id), enriched]
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
    setContextMenuMsgId(null)
    setHoveredMsgId(null)
    const { error } = await sb.from('chat_messages').delete().eq('id', id)
    if (!error) {
      messagesRef.current = messagesRef.current.filter(m => m.id !== id)
      setMessages(prev => prev.filter(m => m.id !== id))
    }
  }

  const copyText = (content: string) => {
    navigator.clipboard.writeText(content).catch(() => {
      // fallback for browsers that block clipboard
      const el = document.createElement('textarea')
      el.value = content
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    })
    setCopyToast(true)
    setTimeout(() => setCopyToast(false), 2000)
    setContextMenuMsgId(null)
    setHoveredMsgId(null)
  }

  const addReaction = (msgId: string, emoji: string) => {
    setReactions(prev => {
      const msgR = { ...(prev[msgId] ?? {}) }
      const alreadyMine = myReactions[msgId]?.has(emoji)
      msgR[emoji] = Math.max(0, (msgR[emoji] ?? 0) + (alreadyMine ? -1 : 1))
      if (msgR[emoji] === 0) delete msgR[emoji]
      return { ...prev, [msgId]: msgR }
    })
    setMyReactions(prev => {
      const s = new Set(prev[msgId] ?? [])
      s.has(emoji) ? s.delete(emoji) : s.add(emoji)
      return { ...prev, [msgId]: s }
    })
    setEmojiPickerMsgId(null)
    setHoveredMsgId(null)
  }

  // close popups when clicking outside — but NOT when clicking inside them
  const popupRefs = useRef<Map<string, HTMLElement>>(new Map())
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      let inside = false
      popupRefs.current.forEach(el => { if (el?.contains(target)) inside = true })
      if (!inside) {
        setEmojiPickerMsgId(null)
        setContextMenuMsgId(null)
      }
    }
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

  const isAdmin = myStaff?.role?.toLowerCase() === 'admin'
  const canManageMembers = isAdmin || myStaff?.role?.toLowerCase() === 'manager'

  const visibleChannels = channels.filter(ch => {
    if (deletedChannels.has(ch.id)) return false
    if (canManageMembers) return true
    const members = channelMembers[ch.id]
    if (!members || members.length === 0) return true
    return members.includes(myStaff?.id ?? '')
  })

  const currentChannelName = visibleChannels.find(c => c.id === channel)?.name ?? channel
  const currentTitle = dmTarget ? dmTarget.name : currentChannelName
  const starredChannels = visibleChannels.filter(c => starred.has(c.id))
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
        <div className="w-64 flex flex-col flex-shrink-0 overflow-y-auto select-none" style={{ background: '#1B2A3B', color: '#C8D1DC' }}>

          {/* Starred */}
          {starredChannels.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-bold uppercase tracking-widest px-4 mb-1 text-[#7A8FA6]">Starred</p>
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
                  onRename={() => { setRenamingChannel(ch.id); setRenameValue(ch.name) }}
                  isAdmin={isAdmin}
                  canManageMembers={canManageMembers}
                  memberCount={channelMembers[ch.id]?.length ?? 0}
                  onDelete={() => setDeletingChannel(ch)}
                  onManageMembers={() => {
                    setManageMembersChannel(ch)
                    setPendingMembers(new Set(channelMembers[ch.id] ?? []))
                    setManageMembersSearch('')
                  }} />
              ))}
            </div>
          )}

          {/* Channels */}
          <div className="mt-4">
            <div className="flex items-center px-3 mb-0.5">
              <button className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-[#7A8FA6] hover:text-white flex-1 text-left"
                onClick={() => setChannelsOpen(v => !v)}>
                {channelsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Channels
              </button>
              <button onClick={() => setNewChannelOpen(true)}
                className="text-[#7A8FA6] hover:text-white p-0.5 rounded transition-colors" title="Add channel">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* New channel input */}
            {newChannelOpen && (
              <div className="mx-2 mb-2 bg-[#243447] rounded-lg p-2">
                <p className="text-[11px] text-[#7A8FA6] mb-1.5 px-1">Channel name</p>
                <input
                  ref={newChannelInputRef}
                  className="w-full bg-[#1B2A3B] text-white text-[13px] rounded px-2 py-1.5 outline-none border border-[#3A4F63] focus:border-[#5BA3A0] placeholder-[#4E6478]"
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

            {channelsOpen && visibleChannels.map(ch => (
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
                onRename={() => { setRenamingChannel(ch.id); setRenameValue(ch.name) }}
                isAdmin={isAdmin}
                canManageMembers={canManageMembers}
                memberCount={channelMembers[ch.id]?.length ?? 0}
                onDelete={() => setDeletingChannel(ch)}
                onManageMembers={() => {
                  setManageMembersChannel(ch)
                  setPendingMembers(new Set(channelMembers[ch.id] ?? []))
                  setManageMembersSearch('')
                }} />
            ))}
          </div>

          {/* Direct Messages */}
          <div className="mt-4 flex-1">
            <div className="flex items-center px-3 mb-0.5">
              <button className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-[#7A8FA6] hover:text-white flex-1 text-left"
                onClick={() => setDmsOpen(v => !v)}>
                {dmsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Direct Messages
              </button>
              <button onClick={() => { setNewDmOpen(true); setDmSearch('') }}
                className="text-[#7A8FA6] hover:text-white p-0.5 rounded transition-colors" title="New message">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {dmsOpen && dmList.map(s => (
              <button key={s.id} onClick={() => { setDmTarget(s); activeDmIds.current.add(s.id) }}
                className={`w-full flex items-center gap-2.5 px-3 py-1 text-[13px] transition-colors text-left rounded mx-1 ${
                  dmTarget?.id === s.id ? 'text-white' : 'text-[#A8BDCF] hover:bg-white/8 hover:text-white'
                }`} style={{ width: 'calc(100% - 8px)', background: dmTarget?.id === s.id ? 'rgba(91,163,160,0.25)' : undefined }}>
                <div className="relative flex-shrink-0">
                  <Avatar name={s.name} avatarUrl={s.avatar_url} size={6} />
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#1B2A3B] ${onlineIds.has(s.id) ? 'bg-emerald-400' : 'bg-[#4E6478]'}`} />
                </div>
                <span className="truncate flex-1">{s.name}</span>
                {hasUnread(`dm-${s.id}`) && <span className="w-2 h-2 rounded-full bg-[#5BA3A0] flex-shrink-0" />}
              </button>
            ))}

            {dmsOpen && dmList.length === 0 && (
              <p className="text-[12px] text-[#4E6478] px-4 py-1.5 italic">No conversations yet</p>
            )}
          </div>

          {/* My profile */}
          {myStaff && (
            <div className="px-3 py-3 flex items-center gap-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.15)' }}>
              <div className="relative flex-shrink-0">
                <Avatar name={myStaff.name} avatarUrl={myStaff.avatar_url} size={8} />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#1B2A3B]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-white truncate">{myStaff.name}</p>
                <p className="text-[11px] text-emerald-400 font-medium">● Active</p>
              </div>
            </div>
          )}
        </div>

        {/* ══ Main chat area ═══════════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col min-w-0" style={{ background: '#F4F6F8' }}>

          {/* Header */}
          <div className="px-5 h-14 flex items-center gap-3 flex-shrink-0 bg-white" style={{ borderBottom: '1px solid #E2E8EF' }}>
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
                    {canManageMembers && (
                      <button
                        onClick={() => {
                          const ch = visibleChannels.find(c => c.id === channel)
                          if (ch) { setManageMembersChannel(ch); setPendingMembers(new Set(channelMembers[channel] ?? [])); setManageMembersSearch('') }
                        }}
                        className="ml-1 text-slate-300 hover:text-slate-600 transition-colors flex items-center gap-1 text-[12px]" title="Manage members">
                        <Users className="w-3.5 h-3.5" />
                        {(channelMembers[channel]?.length ?? 0) > 0 && (
                          <span className="text-slate-400">{channelMembers[channel].length}</span>
                        )}
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => { const ch = visibleChannels.find(c => c.id === channel); if (ch) setDeletingChannel(ch) }}
                        className="ml-1 text-slate-300 hover:text-red-500 transition-colors" title="Delete channel">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto pb-2" style={{ scrollbarWidth: 'thin', background: '#F4F6F8' }}>
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
                      <span className="text-[11px] font-semibold text-slate-400 border border-slate-200 rounded-full px-3 py-0.5 mx-3 bg-white shadow-sm">
                        {formatDateDivider(date)}
                      </span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                    {msgs.map((msg, i) => {
                      // ── System message ──
                      if (msg.content.startsWith('__system__')) {
                        const text = msg.content.replace('__system__ ', '')
                        return (
                          <div key={msg.id} className="flex items-center gap-3 px-5 py-1.5">
                            <div className="flex-1 h-px bg-slate-200" />
                            <span className="text-[12px] text-slate-400 whitespace-nowrap">{text}</span>
                            <div className="flex-1 h-px bg-slate-200" />
                          </div>
                        )
                      }

                      const compact = isCompact(msgs, i)
                      const senderName = resolveSenderName(msg)
                      const avatarUrl = resolveSenderAvatar(msg)
                      const hasPopup = emojiPickerMsgId === msg.id || contextMenuMsgId === msg.id
                      const showBar = hoveredMsgId === msg.id || hasPopup
                      const msgReactions = reactions[msg.id] ?? {}

                      return (
                        <div key={msg.id}
                          className={`relative px-5 flex gap-3 ${compact ? 'py-0.5' : 'pt-3 pb-0.5'}`}
                          style={{ background: showBar ? 'rgba(0,0,0,0.04)' : 'transparent' }}
                          onMouseEnter={() => setHoveredMsgId(msg.id)}
                          onMouseLeave={() => { if (!hasPopup) setHoveredMsgId(null) }}>

                          {compact ? (
                            <div className="w-9 flex-shrink-0 flex items-center justify-end">
                              {showBar && (
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
                              <div className="flex items-start gap-2 mb-1 pl-2 border-l-2 border-slate-400 cursor-pointer hover:border-slate-500">
                                <div className="min-w-0">
                                  {(msg.reply_to.sender as any)?.name && (
                                    <span className="text-[11px] font-bold text-slate-700 mr-1.5">
                                      {(msg.reply_to.sender as any).name}
                                    </span>
                                  )}
                                  <span className="text-[12px] text-slate-500 truncate">{msg.reply_to.content}</span>
                                </div>
                              </div>
                            )}

                            <p className="text-[14px] text-slate-800 leading-relaxed break-words whitespace-pre-wrap">{msg.content}</p>

                            {/* Emoji reactions row */}
                            {Object.keys(msgReactions).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {Object.entries(msgReactions).map(([emoji, count]) => count > 0 && (
                                  <button key={emoji}
                                    onClick={() => addReaction(msg.id, emoji)}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] border transition-colors ${
                                      myReactions[msg.id]?.has(emoji)
                                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                                        : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                                    }`}>
                                    {emoji} <span className="font-medium">{count}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Hover action bar — stays visible while popup is open */}
                          {showBar && (
                            <div
                              ref={el => { if (el) popupRefs.current.set(`bar-${msg.id}`, el); else popupRefs.current.delete(`bar-${msg.id}`) }}
                              className="absolute right-4 top-2 flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg shadow-lg px-1 py-0.5 z-10">

                              {/* Emoji picker */}
                              <div className="relative">
                                <ActionBtn icon={<Smile className="w-3.5 h-3.5" />} title="Add reaction"
                                  onClick={() => setEmojiPickerMsgId(p => p === msg.id ? null : msg.id)} />
                                {emojiPickerMsgId === msg.id && (
                                  <div
                                    ref={el => { if (el) popupRefs.current.set(`emoji-${msg.id}`, el); else popupRefs.current.delete(`emoji-${msg.id}`) }}
                                    className="absolute bottom-9 right-0 bg-white border border-slate-200 rounded-xl shadow-xl p-2 flex gap-1 z-30">
                                    {['👍','❤️','😂','😮','😢','🎉','🔥','✅'].map(emoji => (
                                      <button key={emoji}
                                        className="text-xl hover:bg-slate-100 rounded-lg w-9 h-9 flex items-center justify-center transition-colors"
                                        onClick={() => addReaction(msg.id, emoji)}>
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Reply */}
                              <ActionBtn icon={<Reply className="w-3.5 h-3.5" />} title="Reply"
                                onClick={() => { setReplyTo(msg); setHoveredMsgId(null); inputRef.current?.focus() }} />

                              {/* More menu */}
                              <div className="relative">
                                <ActionBtn icon={<MoreHorizontal className="w-3.5 h-3.5" />} title="More actions"
                                  onClick={() => setContextMenuMsgId(p => p === msg.id ? null : msg.id)} />
                                {contextMenuMsgId === msg.id && (
                                  <div
                                    ref={el => { if (el) popupRefs.current.set(`ctx-${msg.id}`, el); else popupRefs.current.delete(`ctx-${msg.id}`) }}
                                    className="absolute bottom-9 right-0 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 min-w-[170px] z-30">
                                    <MenuBtn label="Reply" onClick={() => { setReplyTo(msg); setContextMenuMsgId(null); setHoveredMsgId(null); inputRef.current?.focus() }} />
                                    <MenuBtn label="Copy text" onClick={() => copyText(msg.content)} />
                                    {msg.sender_id === myStaff?.id && <>
                                      <div className="my-1 border-t border-slate-100" />
                                      <MenuBtn label="Delete message" danger onClick={() => deleteMessage(msg.id)} />
                                    </>}
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
          <div className="px-5 pb-4 pt-3 flex-shrink-0 bg-white" style={{ borderTop: '1px solid #E2E8EF' }}>
            {sendError && <p className="text-xs text-red-500 mb-2">Failed to send: {sendError}</p>}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
              {replyTo && (
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
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

      {/* ══ New DM Modal ════════════════════════════════════════════════════ */}
      {newDmOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setNewDmOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-[17px] font-bold text-slate-900">New Direct Message</h2>
              <button onClick={() => setNewDmOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 border-b border-slate-100">
              <input
                autoFocus
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[#5BA3A0] placeholder-slate-400 transition-colors"
                placeholder="Search for people..."
                value={dmSearch}
                onChange={e => setDmSearch(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && setNewDmOpen(false)}
              />
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
              {filteredStaff.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Users className="w-8 h-8 mb-3 opacity-40" />
                  <p className="text-[14px]">{dmSearch ? 'No people match your search' : 'No other team members found'}</p>
                </div>
              ) : filteredStaff.map(s => (
                <button key={s.id}
                  onClick={() => { setDmTarget(s); activeDmIds.current.add(s.id); setNewDmOpen(false); setDmSearch('') }}
                  className="w-full flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0">
                  <div className="relative flex-shrink-0">
                    <Avatar name={s.name} avatarUrl={s.avatar_url} size={10} />
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${onlineIds.has(s.id) ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-[14px]">{s.name}</p>
                    <p className="text-[12px] text-slate-500 mt-0.5">{s.role || 'Staff'}</p>
                  </div>
                  {onlineIds.has(s.id) && (
                    <span className="text-[12px] text-emerald-500 font-medium flex-shrink-0">Active now</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ Delete Channel Confirmation ══════════════════════════════════════ */}
      {deletingChannel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeletingChannel(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <h2 className="text-[17px] font-bold text-slate-900 mb-2">Delete #{deletingChannel.name}?</h2>
            <p className="text-[13px] text-slate-500 mb-6 leading-relaxed">
              This removes the channel from the sidebar for everyone. Message history is preserved in the database but the channel won't be accessible.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingChannel(null)}
                className="flex-1 border border-slate-200 text-slate-700 text-[13px] font-medium rounded-xl py-2.5 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteChannel(deletingChannel.id)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white text-[13px] font-medium rounded-xl py-2.5 transition-colors">
                Delete Channel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Manage Members Modal ════════════════════════════════════════════ */}
      {manageMembersChannel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setManageMembersChannel(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-[17px] font-bold text-slate-900">Manage Members</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">#{manageMembersChannel.name}</p>
              </div>
              <button onClick={() => setManageMembersChannel(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 py-3 border-b border-slate-100">
              <input
                autoFocus
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#5BA3A0] transition-colors"
                placeholder="Search staff..."
                value={manageMembersSearch}
                onChange={e => setManageMembersSearch(e.target.value)}
              />
            </div>
            <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-100">
              <p className="text-[11px] text-slate-500">
                {pendingMembers.size === 0
                  ? 'No restrictions — all staff can see this channel'
                  : `${pendingMembers.size} member${pendingMembers.size !== 1 ? 's' : ''} — only selected staff can see this channel`}
              </p>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 300 }}>
              {staff
                .filter(s => s.name.toLowerCase().includes(manageMembersSearch.toLowerCase()))
                .map(s => {
                  const checked = pendingMembers.has(s.id)
                  const isMe = s.id === myStaff?.id
                  return (
                    <button key={s.id}
                      onClick={() => {
                        if (isMe) return
                        setPendingMembers(prev => {
                          const next = new Set(prev)
                          checked ? next.delete(s.id) : next.add(s.id)
                          return next
                        })
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0 ${isMe ? 'opacity-50 cursor-default' : ''}`}>
                      <Avatar name={s.name} avatarUrl={s.avatar_url} size={9} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-slate-900">{s.name}{isMe ? ' (you)' : ''}</p>
                        <p className="text-[11px] text-slate-500">{s.role || 'Staff'}</p>
                      </div>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-[#007A5A] border-[#007A5A]' : 'border-slate-300'}`}>
                        {checked && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  )
                })}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setManageMembersChannel(null)}
                className="flex-1 border border-slate-200 text-slate-700 text-[13px] font-medium rounded-xl py-2.5 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={saveMembership} disabled={savingMembers}
                className="flex-1 bg-[#007A5A] hover:bg-[#006849] text-white text-[13px] font-medium rounded-xl py-2.5 transition-colors disabled:opacity-60">
                {savingMembers ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sidebar channel row ──────────────────────────────────────────────────────
function SidebarChannel({ channel, active, unread, starred, renaming, renameValue, onRenameChange, onRenameCommit, onRenameCancel, renameInputRef, onClick, onToggleStar, onRename, isAdmin, canManageMembers, memberCount, onDelete, onManageMembers }: {
  channel: Channel; active: boolean; unread: boolean; starred: boolean
  renaming: boolean; renameValue: string
  onRenameChange: (v: string) => void; onRenameCommit: () => void; onRenameCancel: () => void
  renameInputRef?: React.RefObject<HTMLInputElement | null>
  onClick: () => void; onToggleStar: () => void; onRename: () => void
  isAdmin?: boolean; canManageMembers?: boolean; memberCount?: number
  onDelete?: () => void; onManageMembers?: () => void
}) {
  return (
    <div className={`flex items-center mx-1 rounded group`}
      style={{ width: 'calc(100% - 8px)', background: active ? 'rgba(91,163,160,0.22)' : undefined }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '' }}>
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
          <button onClick={onClick} className={`flex-1 flex items-center gap-2 px-3 py-1.5 text-[13px] text-left ${
            active ? 'text-white font-semibold' : unread ? 'text-white font-semibold' : 'text-[#A8BDCF]'
          }`}>
            <Hash className={`w-3.5 h-3.5 flex-shrink-0 ${active ? 'opacity-90' : 'opacity-50'}`} />
            <span className="flex-1 truncate">{channel.name}</span>
            {(memberCount ?? 0) > 0 && !active && (
              <span className="text-[10px] text-[#4E6478] flex-shrink-0 mr-0.5"><Users className="w-2.5 h-2.5 inline opacity-60" />{memberCount}</span>
            )}
            {unread && !active && <span className="w-2 h-2 rounded-full bg-[#5BA3A0] flex-shrink-0" />}
          </button>
          <div className="flex items-center gap-0.5 pr-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={e => { e.stopPropagation(); onRename() }} className="p-0.5 text-[#7A8FA6] hover:text-white rounded" title="Rename">
              <Pencil className="w-2.5 h-2.5" />
            </button>
            {canManageMembers && onManageMembers && (
              <button onClick={e => { e.stopPropagation(); onManageMembers() }} className="p-0.5 text-[#7A8FA6] hover:text-white rounded" title="Manage members">
                <Users className="w-2.5 h-2.5" />
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); onToggleStar() }} className="p-0.5 rounded" title="Star">
              <Star className={`w-2.5 h-2.5 ${starred ? 'fill-amber-400 text-amber-400' : 'text-[#7A8FA6] hover:text-amber-400'}`} />
            </button>
            {isAdmin && onDelete && (
              <button onClick={e => { e.stopPropagation(); onDelete() }} className="p-0.5 text-[#7A8FA6] hover:text-red-400 rounded" title="Delete channel">
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            )}
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
