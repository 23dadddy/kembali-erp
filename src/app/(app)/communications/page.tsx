'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import {
  Mail, Search, Send, Archive, RefreshCw, Loader2, Inbox,
  Pencil, X, ChevronDown, ChevronUp, Smartphone, Star,
  Reply, Trash2, LogIn, Check, AlertCircle,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GmailThread {
  id: string
  subject: string
  from: string
  to: string
  date: string
  internalDate: string
  snippet: string
  unread: boolean
  starred: boolean
  messageCount: number
  labelIds: string[]
}

interface GmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  to: string
  date: string
  messageId: string
  inReplyTo: string
  body: string
  htmlBody: string
  unread: boolean
  internalDate: string
  labelIds: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^(.*?)\s*<(.+?)>$/)
  if (m) return { name: m[1].replace(/"/g, '').trim(), email: m[2] }
  return { name: from, email: from }
}

function timeAgo(ms: string | number) {
  const d = new Date(typeof ms === 'string' && ms.length < 14 ? parseInt(ms) : ms)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 172800) return 'Yesterday'
  if (diff < 604800) return d.toLocaleDateString('en-GB', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fullDate(ms: string | number) {
  const d = new Date(typeof ms === 'string' && ms.length < 14 ? parseInt(ms) : ms)
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

const COLORS = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-amber-600', 'bg-cyan-500']
function avatarColor(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs'
  return <div className={`${sz} ${avatarColor(name)} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>{initials(name)}</div>
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CommunicationsPage() {
  const [tab, setTab] = useState<'email' | 'whatsapp'>('email')
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [threads, setThreads] = useState<GmailThread[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [selected, setSelected] = useState<GmailThread | null>(null)
  const [messages, setMessages] = useState<GmailMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [expandedMsgs, setExpandedMsgs] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [folder, setFolder] = useState('in:inbox')

  // Reply
  const [replyOpen, setReplyOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState(false)

  // Compose
  const [composing, setComposing] = useState(false)
  const [composeMin, setComposeMin] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composeSending, setComposeSending] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)

  // Check auth status
  const checkAuth = useCallback(async () => {
    const res = await fetch('/api/gmail/threads?maxResults=1')
    if (res.status === 401) setAuthenticated(false)
    else setAuthenticated(true)
  }, [])

  useEffect(() => { checkAuth() }, [checkAuth])

  // Load threads
  const loadThreads = useCallback(async (q = folder, token?: string) => {
    setLoading(true)
    const params = new URLSearchParams({ q, maxResults: '50' })
    if (token) params.set('pageToken', token)
    const res = await fetch(`/api/gmail/threads?${params}`)
    if (res.status === 401) { setAuthenticated(false); setLoading(false); return }
    const data = await res.json()
    if (token) setThreads(prev => [...prev, ...(data.threads ?? [])])
    else setThreads(data.threads ?? [])
    setNextPageToken(data.nextPageToken ?? null)
    setLoading(false)
  }, [folder])

  useEffect(() => {
    if (authenticated) loadThreads(folder)
  }, [authenticated, folder, loadThreads])

  // Load thread messages
  const loadThread = useCallback(async (threadId: string) => {
    setLoadingMsgs(true)
    const res = await fetch(`/api/gmail/thread?id=${threadId}`)
    const data = await res.json()
    const msgs: GmailMessage[] = data.messages ?? []
    setMessages(msgs)
    if (msgs.length > 0) setExpandedMsgs(new Set([msgs[msgs.length - 1].id]))
    // Mark thread as read locally
    setThreads(prev => prev.map(t => t.id === threadId ? { ...t, unread: false } : t))
    setLoadingMsgs(false)
  }, [])

  useEffect(() => {
    if (selected) {
      loadThread(selected.id)
      setReply(''); setReplyOpen(false); setSendError(null); setSendSuccess(false)
    }
  }, [selected, loadThread])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, replyOpen])

  const toggleExpand = (id: string) => setExpandedMsgs(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  // Send reply
  const sendReply = async () => {
    if (!reply.trim() || !selected) return
    setSending(true); setSendError(null)
    const lastMsg = messages[messages.length - 1]
    const res = await fetch('/api/gmail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: parseFrom(selected.from).email,
        subject: selected.subject.startsWith('Re:') ? selected.subject : `Re: ${selected.subject}`,
        body: reply,
        threadId: selected.id,
        inReplyTo: lastMsg?.messageId,
        references: lastMsg?.messageId,
      }),
    })
    const data = await res.json()
    if (!data.ok) setSendError(data.error ?? 'Failed to send')
    else {
      setReply(''); setReplyOpen(false); setSendSuccess(true)
      await loadThread(selected.id)
      await loadThreads(folder)
    }
    setSending(false)
  }

  // Send compose
  const sendCompose = async () => {
    if (!composeTo.trim() || !composeBody.trim()) return
    setComposeSending(true); setComposeError(null)
    const res = await fetch('/api/gmail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: composeTo, subject: composeSubject || '(no subject)', body: composeBody }),
    })
    const data = await res.json()
    if (!data.ok) setComposeError(data.error ?? 'Failed to send')
    else {
      setComposing(false); setComposeTo(''); setComposeSubject(''); setComposeBody('')
      await loadThreads(folder)
    }
    setComposeSending(false)
  }

  // Archive
  const archiveThread = async (id: string) => {
    await fetch(`/api/gmail/thread?id=${id}&action=archive`, { method: 'DELETE' })
    setThreads(prev => prev.filter(t => t.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  // Search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setFolder(searchInput ? `in:inbox ${searchInput}` : 'in:inbox')
    setSearch(searchInput)
  }

  const unreadCount = threads.filter(t => t.unread).length

  // ── Not authenticated ────────────────────────────────────────────────────────
  if (authenticated === false) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar title="Communications" />
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 gap-6">
          <div className="bg-white border rounded-2xl p-8 shadow-sm max-w-sm w-full text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-7 h-7 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Connect Gmail</h2>
            <p className="text-sm text-slate-500 mb-6">
              Connect <strong>contact@kembaliwater.com</strong> to use Gmail directly inside the ERP — send, receive, and thread emails natively.
            </p>
            <a href="/api/gmail/auth"
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-lg transition-colors">
              <LogIn className="w-4 h-4" /> Connect Gmail Account
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ── Loading auth check ────────────────────────────────────────────────────────
  if (authenticated === null) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar title="Communications" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Topbar title="Communications" />

      {/* Tab bar */}
      <div className="flex items-center border-b bg-white px-4 gap-1 flex-shrink-0">
        <button onClick={() => setTab('email')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'email' ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Mail className="w-4 h-4" /> Email
          {unreadCount > 0 && <span className="bg-cyan-500 text-white text-xs px-1.5 py-0.5 rounded-full font-semibold">{unreadCount}</span>}
        </button>
        <button onClick={() => setTab('whatsapp')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'whatsapp' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Smartphone className="w-4 h-4" /> WhatsApp
        </button>
      </div>

      {tab === 'whatsapp' ? (
        <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-400">
          <div className="text-center">
            <Smartphone className="w-12 h-12 mx-auto mb-3 text-slate-200" />
            <p className="font-medium text-slate-500">WhatsApp coming soon</p>
            <p className="text-sm mt-1">Connect your WhatsApp Business number in Settings</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ── LEFT SIDEBAR ── */}
          <div className="w-72 flex-shrink-0 flex flex-col border-r bg-white">
            {/* Compose + search */}
            <div className="p-3 border-b space-y-2">
              <button onClick={() => { setComposing(true); setComposeMin(false) }}
                className="w-full flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-2xl shadow-sm transition-colors">
                <Pencil className="w-3.5 h-3.5" /> Compose
              </button>
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                  placeholder="Search mail…"
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:bg-white" />
              </form>
            </div>

            {/* Folders */}
            <div className="px-2 py-2 border-b space-y-0.5">
              {[
                { label: 'Inbox', q: 'in:inbox' },
                { label: 'Sent', q: 'in:sent' },
                { label: 'Starred', q: 'is:starred' },
                { label: 'All Mail', q: 'in:all' },
              ].map(f => (
                <button key={f.q} onClick={() => { setFolder(f.q); setSelected(null) }}
                  className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors ${folder === f.q ? 'bg-cyan-50 text-cyan-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
                  {f.label}
                  {f.q === 'in:inbox' && unreadCount > 0 && (
                    <span className="float-right text-xs bg-cyan-500 text-white px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Thread list */}
            <div className="flex-1 overflow-y-auto">
              {loading && threads.length === 0 ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
              ) : threads.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center text-slate-400">
                  <Inbox className="w-8 h-8 mb-2 text-slate-200" />
                  <p className="text-sm font-medium">No emails</p>
                </div>
              ) : (
                <>
                  {threads.map(thread => {
                    const { name } = parseFrom(thread.from)
                    const isSelected = selected?.id === thread.id
                    return (
                      <button key={thread.id} onClick={() => setSelected(thread)}
                        className={`w-full text-left px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-cyan-50' : thread.unread ? 'bg-white' : 'bg-white'}`}>
                        <div className="flex items-start gap-2.5">
                          {thread.unread && <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full mt-2 flex-shrink-0" />}
                          {!thread.unread && <div className="w-1.5 h-1.5 mt-2 flex-shrink-0" />}
                          <Avatar name={name} size="md" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-1 mb-0.5">
                              <p className={`text-sm truncate ${thread.unread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{name}</p>
                              <span className={`text-xs flex-shrink-0 ${thread.unread ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>{timeAgo(thread.internalDate)}</span>
                            </div>
                            <p className={`text-xs truncate ${thread.unread ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>{thread.subject}</p>
                            <p className="text-xs text-slate-400 truncate mt-0.5">{thread.snippet}</p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                  {nextPageToken && (
                    <button onClick={() => loadThreads(folder, nextPageToken)}
                      className="w-full py-3 text-xs text-cyan-600 hover:bg-slate-50 font-medium">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Load more'}
                    </button>
                  )}
                  <div className="py-2 px-3 flex items-center justify-between">
                    <button onClick={() => loadThreads(folder)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> Refresh
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── RIGHT PANEL ── */}
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400">
              <Mail className="w-14 h-14 mb-3 text-slate-200" />
              <p className="font-medium text-slate-500">Select an email</p>
              <p className="text-sm mt-1">Or compose a new message</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col bg-white min-w-0">
              {/* Thread header */}
              <div className="px-6 py-4 border-b flex items-start justify-between gap-4 flex-shrink-0">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-slate-800">{selected.subject || '(no subject)'}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{selected.messageCount} message{selected.messageCount !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
                  <button onClick={() => loadThread(selected.id)} className="p-1.5 hover:bg-slate-100 rounded-full" title="Refresh">
                    <RefreshCw className="w-4 h-4 text-slate-400" />
                  </button>
                  <button onClick={() => archiveThread(selected.id)} className="p-1.5 hover:bg-slate-100 rounded-full" title="Archive">
                    <Archive className="w-4 h-4 text-slate-400" />
                  </button>
                  <button onClick={() => { setSelected(null) }} className="p-1.5 hover:bg-slate-100 rounded-full">
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
                {loadingMsgs ? (
                  <div className="flex justify-center pt-12"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
                ) : messages.map((msg, i) => {
                  const { name, email } = parseFrom(msg.from)
                  const isExpanded = expandedMsgs.has(msg.id)
                  const isLast = i === messages.length - 1
                  const isOutbound = email === 'contact@kembaliwater.com'
                  return (
                    <div key={msg.id} className="border rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
                      <button onClick={() => toggleExpand(msg.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors">
                        <Avatar name={isOutbound ? 'KW' : name} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold text-slate-800">{isOutbound ? 'Kembali Water' : name}</span>
                            {!isExpanded && <span className="text-xs text-slate-400 truncate flex-1">{msg.body?.slice(0, 80)}</span>}
                          </div>
                          {isExpanded && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              {isOutbound ? `to ${parseFrom(msg.to).email || selected.from}` : `to contact@kembaliwater.com`}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-slate-400">{isExpanded ? fullDate(msg.internalDate) : timeAgo(msg.internalDate)}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-300" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 border-t">
                          {msg.htmlBody ? (
                            <div dangerouslySetInnerHTML={{ __html: msg.htmlBody }}
                              className="prose prose-sm max-w-none text-slate-700 [&_*]:max-w-full [&_blockquote]:border-l-2 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_blockquote]:text-slate-400" />
                          ) : (
                            <pre className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">{msg.body}</pre>
                          )}
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
                <div className="border-t px-6 py-4 flex-shrink-0">
                  <div className="border rounded-xl overflow-hidden shadow-sm">
                    <div className="px-4 py-2 border-b bg-slate-50 flex items-center justify-between">
                      <span className="text-sm text-slate-600">
                        <span className="font-medium">Reply to</span> {parseFrom(selected.from).email}
                      </span>
                      <button onClick={() => setReplyOpen(false)} className="p-1 hover:bg-slate-200 rounded">
                        <X className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    </div>
                    <textarea value={reply} onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply() } }}
                      placeholder="Write your reply…"
                      rows={5}
                      className="w-full px-4 py-3 text-sm resize-none focus:outline-none" />
                    {sendError && <p className="px-4 pb-2 text-xs text-red-500">{sendError}</p>}
                    {sendSuccess && <p className="px-4 pb-2 text-xs text-emerald-600 flex items-center gap-1"><Check className="w-3 h-3" /> Sent!</p>}
                    <div className="px-4 pb-3 flex items-center gap-3 border-t pt-2">
                      <button onClick={sendReply} disabled={sending || !reply.trim()}
                        className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-full transition-colors">
                        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Send
                      </button>
                      <span className="text-xs text-slate-400">⌘Enter</span>
                    </div>
                  </div>
                </div>
              )}

              {!replyOpen && (
                <div className="border-t px-6 py-3 flex-shrink-0">
                  <button onClick={() => setReplyOpen(true)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 border rounded-full text-sm text-slate-400 hover:border-slate-300 hover:text-slate-500 transition-colors text-left">
                    <Reply className="w-4 h-4" />
                    Reply to {parseFrom(selected.from).name || parseFrom(selected.from).email}…
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Compose Window */}
      {composing && (
        <div className={`fixed bottom-0 right-6 z-50 w-[520px] bg-white rounded-t-xl shadow-2xl border border-slate-200 flex flex-col transition-all ${composeMin ? 'h-12' : 'h-[480px]'}`}>
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800 rounded-t-xl flex-shrink-0 cursor-pointer"
            onClick={() => setComposeMin(!composeMin)}>
            <span className="text-sm font-semibold text-white">New Message</span>
            <div className="flex gap-2">
              <button onClick={e => { e.stopPropagation(); setComposeMin(!composeMin) }} className="text-slate-300 hover:text-white">
                {composeMin ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <button onClick={e => { e.stopPropagation(); setComposing(false) }} className="text-slate-300 hover:text-white">
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
              {composeError && <p className="px-4 text-xs text-red-500 pb-1">{composeError}</p>}
              <div className="px-3 py-2.5 border-t flex items-center gap-3">
                <button onClick={sendCompose} disabled={composeSending || !composeTo.trim() || !composeBody.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-full transition-colors">
                  {composeSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send
                </button>
                <span className="text-xs text-slate-400">⌘Enter</span>
                <button onClick={() => setComposing(false)} className="ml-auto p-1.5 hover:bg-slate-100 rounded text-slate-400">
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
