'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/client'
import {
  Mail, Search, Send, Archive, RefreshCw, Loader2, Inbox,
  Pencil, X, ChevronDown, ChevronUp, Smartphone, Star,
  Reply, MoreHorizontal, Trash2, Tag,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  thread_id: string
  channel: 'email' | 'whatsapp'
  from_address: string
  from_name: string | null
  subject: string | null
  last_body: string
  last_at: string
  status: string
  customer_id: string | null
  customer_name: string | null
  unread_count: number
}

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  body: string
  html_body: string | null
  subject: string | null
  from_address: string | null
  from_name: string | null
  to_address: string | null
  status: string
  sent_by: string | null
  created_at: string
  channel: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const d = new Date(iso); const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 172800) return 'Yesterday'
  if (diff < 604800) return d.toLocaleDateString('en-GB', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function initials(name: string | null, email: string) {
  if (name) return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return email.slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-amber-500', 'bg-cyan-500',
]
function avatarColor(str: string) {
  let h = 0; for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, email, size = 'md' }: { name: string | null; email: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs'
  return (
    <div className={`${sz} ${avatarColor(email)} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials(name, email)}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CommunicationsPage() {
  const sb = useRef(createClient()).current
  const [tab, setTab] = useState<'email' | 'whatsapp'>('email')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [myStaff, setMyStaff] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'starred' | 'archived'>('all')
  const [expandedMsgs, setExpandedMsgs] = useState<Set<string>>(new Set())

  // Reply
  const [reply, setReply] = useState('')
  const [replySubject, setReplySubject] = useState('')
  const [replyOpen, setReplyOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Compose
  const [composing, setComposing] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composeSending, setComposeSending] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [composeMin, setComposeMin] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)

  // Load staff
  useEffect(() => {
    sb.auth.getUser().then(({ data: { user } }) => {
      if (user) sb.from('staff').select('id, name, role').eq('auth_user_id', user.id).single().then(({ data }) => setMyStaff(data))
    })
  }, [sb])

  // Load conversations
  const loadConversations = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('communications').select('*, customer:customers(name)').order('created_at', { ascending: false }).limit(300)
    if (!data) { setLoading(false); return }

    const map = new Map<string, Conversation>()
    for (const m of data) {
      const tid = m.thread_id
      if (!map.has(tid)) {
        map.set(tid, {
          thread_id: tid,
          channel: m.channel,
          from_address: m.direction === 'inbound' ? (m.from_address ?? '') : (m.to_address ?? ''),
          from_name: m.direction === 'inbound' ? m.from_name : (m.customer as any)?.name ?? null,
          subject: m.subject,
          last_body: m.body,
          last_at: m.created_at,
          status: m.status,
          customer_id: m.customer_id,
          customer_name: (m.customer as any)?.name ?? null,
          unread_count: 0,
        })
      }
      if (m.direction === 'inbound' && m.status === 'unread') map.get(tid)!.unread_count++
    }
    setConversations(Array.from(map.values()))
    setLoading(false)
  }, [sb])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Realtime
  useEffect(() => {
    const sub = sb.channel('comms-rt').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'communications' }, () => {
      loadConversations()
      if (selected) loadThread(selected.thread_id)
    }).subscribe()
    return () => { sub.unsubscribe() }
  }, [sb, selected, loadConversations])

  const loadThread = useCallback(async (threadId: string) => {
    setLoadingMsgs(true)
    const { data } = await sb.from('communications').select('*').eq('thread_id', threadId).order('created_at', { ascending: true })
    const msgs = (data ?? []) as Message[]
    setMessages(msgs)
    // Auto-expand latest message
    if (msgs.length > 0) setExpandedMsgs(new Set([msgs[msgs.length - 1].id]))
    await sb.from('communications').update({ status: 'read' }).eq('thread_id', threadId).eq('direction', 'inbound').eq('status', 'unread')
    setConversations(prev => prev.map(c => c.thread_id === threadId ? { ...c, unread_count: 0 } : c))
    setLoadingMsgs(false)
  }, [sb])

  useEffect(() => {
    if (selected) {
      loadThread(selected.thread_id)
      setReplySubject(selected.subject ? `Re: ${selected.subject.replace(/^Re:\s*/i, '')}` : '')
      setReply(''); setReplyOpen(false); setSendError(null)
    }
  }, [selected, loadThread])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, replyOpen])

  // When switching tabs, clear selection
  useEffect(() => { setSelected(null) }, [tab])

  const toggleExpand = (id: string) => setExpandedMsgs(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  const sendReply = async () => {
    if (!reply.trim() || !selected) return
    setSending(true); setSendError(null)
    const res = await fetch('/api/communications/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: selected.channel, to: selected.from_address, toName: selected.from_name, subject: replySubject, body: reply, threadId: selected.thread_id, customerId: selected.customer_id, staffId: myStaff?.id ?? null }),
    })
    const data = await res.json()
    if (!res.ok && res.status !== 207) setSendError(data.error ?? 'Failed to send')
    else { setReply(''); setReplyOpen(false); loadThread(selected.thread_id) }
    setSending(false)
  }

  const sendCompose = async () => {
    if (!composeTo.trim() || !composeBody.trim()) return
    setComposeSending(true); setComposeError(null)
    const newThreadId = `compose-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const res = await fetch('/api/communications/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'email', to: composeTo.trim(), subject: composeSubject.trim() || '(No subject)', body: composeBody, threadId: newThreadId, customerId: null, staffId: myStaff?.id ?? null }),
    })
    const data = await res.json()
    if (!res.ok && res.status !== 207) setComposeError(data.error ?? 'Failed to send')
    else {
      setComposing(false); setComposeTo(''); setComposeSubject(''); setComposeBody(''); setComposeError(null)
      await loadConversations()
    }
    setComposeSending(false)
  }

  const archiveThread = async (threadId: string) => {
    await sb.from('communications').update({ status: 'archived' }).eq('thread_id', threadId)
    setConversations(prev => prev.map(c => c.thread_id === threadId ? { ...c, status: 'archived' } : c))
    if (selected?.thread_id === threadId) setSelected(null)
  }

  const filtered = conversations.filter(c => {
    if (c.channel !== tab) return false
    if (statusFilter === 'unread' && c.unread_count === 0) return false
    if (statusFilter === 'archived' && c.status !== 'archived') return false
    if (statusFilter === 'all' && c.status === 'archived') return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.from_name?.toLowerCase().includes(q) && !c.from_address?.toLowerCase().includes(q) && !c.last_body?.toLowerCase().includes(q) && !c.subject?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const emailUnread = conversations.filter(c => c.channel === 'email' && c.unread_count > 0 && c.status !== 'archived').reduce((s, c) => s + c.unread_count, 0)
  const waUnread = conversations.filter(c => c.channel === 'whatsapp' && c.unread_count > 0 && c.status !== 'archived').reduce((s, c) => s + c.unread_count, 0)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar title="Communications" />

      {/* ── Tab bar ── */}
      <div className="flex items-center border-b bg-white px-4 gap-1 flex-shrink-0">
        <button onClick={() => setTab('email')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'email' ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Mail className="w-4 h-4" />
          Email
          {emailUnread > 0 && <span className="bg-cyan-500 text-white text-xs px-1.5 py-0.5 rounded-full font-semibold">{emailUnread}</span>}
        </button>
        <button onClick={() => setTab('whatsapp')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'whatsapp' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Smartphone className="w-4 h-4" />
          WhatsApp
          {waUnread > 0 && <span className="bg-emerald-500 text-white text-xs px-1.5 py-0.5 rounded-full font-semibold">{waUnread}</span>}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── LEFT SIDEBAR ── */}
        <div className="w-72 flex-shrink-0 flex flex-col border-r bg-white">

          {tab === 'email' && (
            <div className="p-3 border-b">
              <button onClick={() => { setComposing(true); setComposeMin(false) }}
                className="w-full flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-2xl shadow-sm transition-colors">
                <Pencil className="w-3.5 h-3.5" /> Compose
              </button>
            </div>
          )}

          {/* Search */}
          <div className="px-3 py-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={tab === 'email' ? 'Search mail…' : 'Search chats…'}
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:bg-white" />
            </div>
          </div>

          {/* Filters */}
          <div className="px-3 py-1.5 border-b flex gap-1 flex-wrap">
            {(['all', 'unread', 'archived'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-0.5 text-xs font-medium rounded-full transition-colors capitalize ${statusFilter === s ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                {s}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center text-slate-400">
                <Inbox className="w-8 h-8 mb-2 text-slate-200" />
                <p className="text-sm font-medium">No {tab === 'email' ? 'emails' : 'chats'}</p>
              </div>
            ) : tab === 'email' ? (
              /* ── Gmail-style email list ── */
              filtered.map(conv => {
                const isSelected = selected?.thread_id === conv.thread_id
                const hasUnread = conv.unread_count > 0
                return (
                  <button key={conv.thread_id} onClick={() => setSelected(conv)}
                    className={`w-full text-left px-3 py-2.5 border-b border-slate-50 transition-colors hover:bg-slate-50 group ${isSelected ? 'bg-cyan-50' : hasUnread ? 'bg-white' : 'bg-white'}`}>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={conv.from_name} email={conv.from_address} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-1 mb-0.5">
                          <p className={`text-sm truncate ${hasUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                            {conv.from_name || conv.from_address}
                          </p>
                          <span className={`text-xs flex-shrink-0 ${hasUnread ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>{timeAgo(conv.last_at)}</span>
                        </div>
                        <p className={`text-xs truncate ${hasUnread ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>
                          {conv.subject || '(no subject)'}
                        </p>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{conv.last_body}</p>
                      </div>
                    </div>
                    {hasUnread && <div className="w-2 h-2 bg-cyan-500 rounded-full absolute left-1 top-1/2 -translate-y-1/2" />}
                  </button>
                )
              })
            ) : (
              /* ── WhatsApp chat list ── */
              filtered.map(conv => {
                const isSelected = selected?.thread_id === conv.thread_id
                const hasUnread = conv.unread_count > 0
                return (
                  <button key={conv.thread_id} onClick={() => setSelected(conv)}
                    className={`w-full text-left px-3 py-3 border-b border-slate-50 transition-colors hover:bg-slate-50 ${isSelected ? 'bg-emerald-50' : ''}`}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Smartphone className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-1">
                          <p className={`text-sm truncate ${hasUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                            {conv.from_name || conv.from_address}
                          </p>
                          <span className="text-xs text-slate-400 flex-shrink-0">{timeAgo(conv.last_at)}</span>
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{conv.last_body}</p>
                        {hasUnread && <span className="text-xs bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-semibold mt-1 inline-block">{conv.unread_count}</span>}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400">
            {tab === 'email' ? <Mail className="w-14 h-14 mb-3 text-slate-200" /> : <Smartphone className="w-14 h-14 mb-3 text-slate-200" />}
            <p className="font-medium text-slate-500">{tab === 'email' ? 'Select an email' : 'Select a chat'}</p>
            <p className="text-sm mt-1">{tab === 'email' ? 'Or compose a new message' : 'WhatsApp messages will appear here'}</p>
          </div>
        ) : tab === 'email' ? (

          /* ══════════════════════════════════════════════════════
             EMAIL THREAD VIEW (Gmail style)
          ══════════════════════════════════════════════════════ */
          <div className="flex-1 flex flex-col bg-white min-w-0">
            {/* Thread header */}
            <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-slate-800 truncate">
                  {selected.subject?.replace(/^Re:\s*/i, '') || '(no subject)'}
                </h2>
                {selected.customer_name && (
                  <p className="text-xs text-slate-400 mt-0.5">Customer: {selected.customer_name}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
                <button onClick={() => loadThread(selected.thread_id)} className="p-1.5 hover:bg-slate-100 rounded-full" title="Refresh">
                  <RefreshCw className="w-4 h-4 text-slate-400" />
                </button>
                <button onClick={() => archiveThread(selected.thread_id)} className="p-1.5 hover:bg-slate-100 rounded-full" title="Archive">
                  <Archive className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 bg-white">
              {loadingMsgs ? (
                <div className="flex justify-center pt-12"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
              ) : messages.map((msg, i) => {
                const isOut = msg.direction === 'outbound'
                const isExpanded = expandedMsgs.has(msg.id)
                const isLast = i === messages.length - 1
                const senderName = isOut ? (myStaff?.name ?? 'Kembali Water') : (msg.from_name || msg.from_address)
                const senderEmail = isOut ? 'contact@kembaliwater.com' : (msg.from_address ?? '')
                return (
                  <div key={msg.id} className={`border rounded-xl overflow-hidden transition-shadow ${isExpanded ? 'shadow-sm' : 'hover:shadow-sm'}`}>
                    {/* Message header — always visible */}
                    <button onClick={() => toggleExpand(msg.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors">
                      <Avatar name={isOut ? (myStaff?.name ?? 'Kembali Water') : msg.from_name} email={senderEmail} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold text-slate-800">{senderName}</span>
                          {!isExpanded && <span className="text-xs text-slate-400 truncate flex-1">{msg.body?.slice(0, 80)}</span>}
                        </div>
                        {isExpanded && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {isOut ? 'to ' + selected.from_address : 'to contact@kembaliwater.com'}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-400">{isExpanded ? fullDate(msg.created_at) : timeAgo(msg.created_at)}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-300" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />}
                      </div>
                    </button>

                    {/* Message body */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t bg-white">
                        {msg.html_body && !isOut ? (
                          <div dangerouslySetInnerHTML={{ __html: msg.html_body }}
                            className="prose prose-sm max-w-none text-slate-700 [&_*]:max-w-full" />
                        ) : (
                          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                        )}
                        {/* Quick actions on last message */}
                        {isLast && (
                          <div className="flex gap-2 mt-4">
                            <button onClick={() => setReplyOpen(true)}
                              className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                              <Reply className="w-3.5 h-3.5" /> Reply
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Reply box */}
            {replyOpen && (
              <div className="border-t bg-white px-6 py-4">
                <div className="border rounded-xl overflow-hidden shadow-sm">
                  <div className="px-4 py-2 border-b bg-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <span className="font-medium text-slate-700">Reply to</span>
                      <span>{selected.from_address}</span>
                    </div>
                    <button onClick={() => setReplyOpen(false)} className="p-1 hover:bg-slate-200 rounded">
                      <X className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </div>
                  <input value={replySubject} onChange={e => setReplySubject(e.target.value)}
                    className="w-full px-4 py-2 border-b text-sm text-slate-600 focus:outline-none bg-white"
                    placeholder="Subject" />
                  <textarea value={reply} onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply() } }}
                    placeholder="Write your reply…"
                    rows={5}
                    className="w-full px-4 py-3 text-sm resize-none focus:outline-none" />
                  {sendError && <p className="px-4 pb-2 text-xs text-red-500">{sendError}</p>}
                  <div className="px-4 pb-3 flex items-center gap-3 border-t pt-2">
                    <button onClick={sendReply} disabled={sending || !reply.trim()}
                      className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-full transition-colors">
                      {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Send
                    </button>
                    <span className="text-xs text-slate-400">⌘Enter to send</span>
                  </div>
                </div>
              </div>
            )}

            {/* Reply trigger if not open */}
            {!replyOpen && selected && (
              <div className="border-t px-6 py-3 bg-white">
                <button onClick={() => setReplyOpen(true)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 border rounded-full text-sm text-slate-400 hover:border-slate-300 hover:text-slate-500 transition-colors text-left">
                  <Reply className="w-4 h-4" />
                  Reply to {selected.from_name || selected.from_address}…
                </button>
              </div>
            )}
          </div>

        ) : (

          /* ══════════════════════════════════════════════════════
             WHATSAPP THREAD VIEW (chat bubbles)
          ══════════════════════════════════════════════════════ */
          <div className="flex-1 flex flex-col bg-white min-w-0">
            <div className="border-b px-5 py-3 flex items-center justify-between gap-3 bg-white">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{selected.from_name || selected.from_address}</p>
                  <p className="text-xs text-slate-400 truncate">{selected.from_address}</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => loadThread(selected.thread_id)} className="p-1.5 hover:bg-slate-100 rounded-full">
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                </button>
                <button onClick={() => archiveThread(selected.thread_id)} className="p-1.5 hover:bg-slate-100 rounded-full">
                  <Archive className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-slate-50">
              {loadingMsgs ? (
                <div className="flex justify-center pt-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
              ) : messages.map(msg => {
                const isOut = msg.direction === 'outbound'
                return (
                  <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] flex flex-col ${isOut ? 'items-end' : 'items-start'}`}>
                      <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isOut ? 'bg-emerald-500 text-white rounded-br-sm' : 'bg-white border border-slate-100 text-slate-800 shadow-sm rounded-bl-sm'}`}>
                        <p style={{ whiteSpace: 'pre-wrap' }}>{msg.body}</p>
                      </div>
                      <span className="text-xs text-slate-400 mt-1 px-1">{timeAgo(msg.created_at)}</span>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            <div className="border-t p-4 bg-white">
              {sendError && <p className="text-xs text-red-500 mb-2">{sendError}</p>}
              <div className="flex gap-2 items-end">
                <textarea value={reply} onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply() } }}
                  placeholder="Type a WhatsApp message… (⌘Enter to send)"
                  rows={2}
                  className="flex-1 border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                <button onClick={sendReply} disabled={sending || !reply.trim()}
                  className="h-10 w-10 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 text-white rounded-xl flex items-center justify-center transition-colors">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          FLOATING COMPOSE WINDOW (Gmail style)
      ══════════════════════════════════════════════════════ */}
      {composing && (
        <div className={`fixed bottom-0 right-6 z-50 w-[520px] bg-white rounded-t-xl shadow-2xl border border-slate-200 flex flex-col transition-all ${composeMin ? 'h-12' : 'h-[480px]'}`}>
          {/* Compose header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800 rounded-t-xl flex-shrink-0 cursor-pointer"
            onClick={() => setComposeMin(!composeMin)}>
            <span className="text-sm font-semibold text-white">New Message</span>
            <div className="flex gap-2">
              <button onClick={e => { e.stopPropagation(); setComposeMin(!composeMin) }}
                className="text-slate-300 hover:text-white">
                {composeMin ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <button onClick={e => { e.stopPropagation(); setComposing(false); setComposeTo(''); setComposeSubject(''); setComposeBody('') }}
                className="text-slate-300 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!composeMin && (
            <>
              <div className="border-b px-3">
                <input value={composeTo} onChange={e => setComposeTo(e.target.value)} placeholder="To"
                  className="w-full py-2 text-sm focus:outline-none placeholder-slate-400" autoFocus />
              </div>
              <div className="border-b px-3">
                <input value={composeSubject} onChange={e => setComposeSubject(e.target.value)} placeholder="Subject"
                  className="w-full py-2 text-sm focus:outline-none placeholder-slate-400" />
              </div>
              <textarea value={composeBody} onChange={e => setComposeBody(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendCompose() } }}
                placeholder="Write your message…"
                className="flex-1 px-3 py-2 text-sm resize-none focus:outline-none" />
              {composeError && <p className="px-4 text-xs text-red-500">{composeError}</p>}
              <div className="px-3 py-2.5 border-t flex items-center gap-3">
                <button onClick={sendCompose} disabled={composeSending || !composeTo.trim() || !composeBody.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-full transition-colors">
                  {composeSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send
                </button>
                <span className="text-xs text-slate-400">⌘Enter</span>
                <button onClick={() => { setComposing(false); setComposeTo(''); setComposeSubject(''); setComposeBody('') }}
                  className="ml-auto p-1.5 hover:bg-slate-100 rounded text-slate-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
