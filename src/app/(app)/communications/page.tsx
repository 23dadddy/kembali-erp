'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/client'
import {
  Mail, MessageSquare, Search, Send, Archive, RefreshCw,
  Phone, User, Circle, Loader2, ChevronDown, Inbox,
  AtSign, Smartphone,
} from 'lucide-react'

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

const CHANNEL_ICON = {
  email: Mail,
  whatsapp: Smartphone,
}
const CHANNEL_COLOR = {
  email: 'text-blue-600',
  whatsapp: 'text-emerald-600',
}
const CHANNEL_BG = {
  email: 'bg-blue-50',
  whatsapp: 'bg-emerald-50',
}

function timeAgo(iso: string) {
  const d = new Date(iso); const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function CommunicationsPage() {
  const sb = useRef(createClient()).current
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [myStaff, setMyStaff] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [reply, setReply] = useState('')
  const [replySubject, setReplySubject] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'whatsapp'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'archived'>('all')
  const [search, setSearch] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load current staff identity
  useEffect(() => {
    sb.auth.getUser().then(({ data: { user } }) => {
      if (user) sb.from('staff').select('id, name, role').eq('auth_user_id', user.id).single().then(({ data }) => setMyStaff(data))
    })
  }, [sb])

  // Load conversation list
  const loadConversations = useCallback(async () => {
    setLoading(true)
    // Get latest message per thread
    const { data } = await sb
      .from('communications')
      .select('*, customer:customers(name)')
      .order('created_at', { ascending: false })
      .limit(200)

    if (!data) { setLoading(false); return }

    // Group into conversations by thread_id
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
      if (m.direction === 'inbound' && m.status === 'unread') {
        map.get(tid)!.unread_count++
      }
    }
    setConversations(Array.from(map.values()))
    setLoading(false)
  }, [sb])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Realtime: new message comes in
  useEffect(() => {
    const sub = sb.channel('comms-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'communications' }, () => {
        loadConversations()
        if (selected) loadThread(selected.thread_id)
      })
      .subscribe()
    return () => { sub.unsubscribe() }
  }, [sb, selected, loadConversations])

  const loadThread = useCallback(async (threadId: string) => {
    setLoadingMsgs(true)
    const { data } = await sb.from('communications').select('*').eq('thread_id', threadId).order('created_at', { ascending: true })
    setMessages((data ?? []) as Message[])
    // Mark inbound as read
    await sb.from('communications').update({ status: 'read' }).eq('thread_id', threadId).eq('direction', 'inbound').eq('status', 'unread')
    setConversations(prev => prev.map(c => c.thread_id === threadId ? { ...c, unread_count: 0, status: c.status === 'unread' ? 'read' : c.status } : c))
    setLoadingMsgs(false)
  }, [sb])

  useEffect(() => {
    if (selected) {
      loadThread(selected.thread_id)
      setReplySubject(selected.subject ? `Re: ${selected.subject.replace(/^Re:\s*/i, '')}` : '')
    }
  }, [selected, loadThread])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendReply = async () => {
    if (!reply.trim() || !selected) return
    setSending(true); setSendError(null)
    const res = await fetch('/api/communications/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: selected.channel,
        to: selected.from_address,
        toName: selected.from_name,
        subject: replySubject,
        body: reply,
        threadId: selected.thread_id,
        customerId: selected.customer_id,
        staffId: myStaff?.id ?? null,
      }),
    })
    const data = await res.json()
    if (!res.ok && res.status !== 207) {
      setSendError(data.error ?? 'Failed to send')
    } else {
      if (data.warning) setSendError(`⚠️ ${data.warning} (message logged but not delivered)`)
      setReply('')
      loadThread(selected.thread_id)
    }
    setSending(false)
  }

  const archiveThread = async (threadId: string) => {
    await sb.from('communications').update({ status: 'archived' }).eq('thread_id', threadId)
    setConversations(prev => prev.map(c => c.thread_id === threadId ? { ...c, status: 'archived' } : c))
    if (selected?.thread_id === threadId) setSelected(null)
  }

  const filtered = conversations.filter(c => {
    if (channelFilter !== 'all' && c.channel !== channelFilter) return false
    if (statusFilter === 'unread' && c.unread_count === 0) return false
    if (statusFilter === 'archived' && c.status !== 'archived') return false
    if (statusFilter === 'all' && c.status === 'archived') return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.from_name?.toLowerCase().includes(q) && !c.from_address?.toLowerCase().includes(q) && !c.last_body?.toLowerCase().includes(q) && !c.subject?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const unreadTotal = conversations.filter(c => c.unread_count > 0 && c.status !== 'archived').reduce((s, c) => s + c.unread_count, 0)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar title={`Communications${unreadTotal > 0 ? ` (${unreadTotal})` : ''}`} />
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* LEFT — conversation list */}
        <div className="w-80 flex-shrink-0 flex flex-col border-r bg-white">
          {/* Filters */}
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations…"
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:bg-white" />
            </div>
            <div className="flex gap-1">
              {(['all','email','whatsapp'] as const).map(ch => (
                <button key={ch} onClick={() => setChannelFilter(ch)}
                  className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors capitalize ${channelFilter === ch ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {ch === 'all' ? 'All' : ch === 'email' ? '✉ Email' : '💬 WhatsApp'}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['all','unread','archived'] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors capitalize ${statusFilter === s ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center text-slate-400">
                <Inbox className="w-8 h-8 mb-2 text-slate-200" />
                <p className="text-sm font-medium">No conversations</p>
                <p className="text-xs mt-1">Inbound emails and WhatsApp<br />messages will appear here</p>
              </div>
            ) : (
              filtered.map(conv => {
                const Icon = CHANNEL_ICON[conv.channel]
                const isSelected = selected?.thread_id === conv.thread_id
                const hasUnread = conv.unread_count > 0
                return (
                  <button key={conv.thread_id} onClick={() => setSelected(conv)}
                    className={`w-full text-left px-3 py-3 border-b border-slate-50 transition-colors hover:bg-slate-50 ${isSelected ? 'bg-cyan-50 border-l-2 border-l-cyan-500' : ''}`}>
                    <div className="flex items-start gap-2.5">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${CHANNEL_BG[conv.channel]}`}>
                        <Icon className={`w-3.5 h-3.5 ${CHANNEL_COLOR[conv.channel]}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-sm truncate ${hasUnread ? 'font-semibold text-slate-800' : 'font-medium text-slate-700'}`}>
                            {conv.from_name || conv.from_address}
                          </p>
                          <span className="text-xs text-slate-400 flex-shrink-0">{timeAgo(conv.last_at)}</span>
                        </div>
                        {conv.subject && <p className="text-xs text-slate-500 truncate">{conv.subject}</p>}
                        <p className="text-xs text-slate-400 truncate mt-0.5">{conv.last_body}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {conv.customer_name && <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded truncate max-w-24">{conv.customer_name}</span>}
                          {hasUnread && <span className="text-xs bg-cyan-500 text-white px-1.5 py-0.5 rounded-full font-semibold">{conv.unread_count}</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* RIGHT — thread + reply */}
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
            <Inbox className="w-12 h-12 mb-3 text-slate-200" />
            <p className="font-medium">Select a conversation</p>
            <p className="text-sm mt-1">Emails and WhatsApp messages from customers</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col bg-white min-w-0">
            {/* Thread header */}
            <div className="border-b px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${CHANNEL_BG[selected.channel]}`}>
                  {selected.channel === 'email'
                    ? <AtSign className={`w-4 h-4 ${CHANNEL_COLOR[selected.channel]}`} />
                    : <Smartphone className={`w-4 h-4 ${CHANNEL_COLOR[selected.channel]}`} />}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{selected.from_name || selected.from_address}</p>
                  <p className="text-xs text-slate-400 truncate">{selected.from_address}{selected.customer_name ? ` · ${selected.customer_name}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => loadThread(selected.thread_id)} className="p-1.5 hover:bg-slate-100 rounded-lg" title="Refresh">
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                </button>
                <button onClick={() => archiveThread(selected.thread_id)} className="p-1.5 hover:bg-slate-100 rounded-lg" title="Archive">
                  <Archive className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-slate-50/40">
              {loadingMsgs ? (
                <div className="flex justify-center pt-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
              ) : messages.map(msg => {
                const isOut = msg.direction === 'outbound'
                return (
                  <div key={msg.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] ${isOut ? 'items-end' : 'items-start'} flex flex-col`}>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xs font-medium text-slate-500">{isOut ? (myStaff?.name ?? 'Kembali Water') : (msg.from_name || msg.from_address)}</span>
                        <span className="text-xs text-slate-300">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(msg.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                      </div>
                      {msg.subject && !isOut && <p className="text-xs font-semibold text-slate-600 mb-1 bg-white border rounded px-2 py-0.5">{msg.subject}</p>}
                      <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${isOut ? 'bg-cyan-600 text-white rounded-tr-sm' : 'bg-white border border-slate-100 text-slate-800 shadow-sm rounded-tl-sm'}`}>
                        {msg.html_body && !isOut ? (
                          <div dangerouslySetInnerHTML={{ __html: msg.html_body }} className="prose prose-sm max-w-none" />
                        ) : (
                          <p style={{ whiteSpace: 'pre-wrap' }}>{msg.body}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Reply box */}
            <div className="border-t p-4 bg-white space-y-2">
              {selected.channel === 'email' && (
                <input value={replySubject} onChange={e => setReplySubject(e.target.value)}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  placeholder="Subject" />
              )}
              {sendError && <p className="text-xs text-red-500">{sendError}</p>}
              <div className="flex gap-2 items-end">
                <textarea
                  ref={textareaRef}
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply() } }}
                  placeholder={selected.channel === 'email' ? 'Write your reply… (⌘Enter to send)' : 'Type a WhatsApp message… (⌘Enter to send)'}
                  rows={3}
                  className="flex-1 border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
                <button onClick={sendReply} disabled={sending || !reply.trim()}
                  className="h-10 w-10 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Replying via {selected.channel === 'email' ? '✉ email' : '💬 WhatsApp'} to {selected.from_address}
                {selected.channel === 'whatsapp' && !process.env.NEXT_PUBLIC_WA_CONFIGURED && ' · Configure WhatsApp in Settings to send'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
