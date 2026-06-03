'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import {
  Search, RefreshCw, Loader2, Pencil, X, ChevronDown, ChevronUp,
  Star, Reply, ReplyAll, Forward, Trash2, Archive, MoreHorizontal,
  ChevronLeft, ChevronRight, Send, LogIn, Check, Printer,
  MailOpen, Tag, Clock, Settings, Menu,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseFrom(from: string) {
  const m = from.match(/^(.*?)\s*<(.+?)>$/)
  if (m) return { name: m[1].replace(/"/g, '').trim(), email: m[2] }
  return { name: from, email: from }
}

function formatDate(ms: string | number) {
  const d = new Date(typeof ms === 'string' && ms.length < 14 ? parseInt(ms) : ms)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 86400 && now.getDate() === d.getDate()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }
  if (diff < 86400 * 7) {
    return d.toLocaleDateString('en-US', { weekday: 'short' })
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fullDate(ms: string | number) {
  const d = new Date(typeof ms === 'string' && ms.length < 14 ? parseInt(ms) : ms)
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function initials(name: string) {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

const AV_COLORS = [
  '#1a73e8','#d93025','#1e8e3e','#e37400','#7627bb',
  '#0097a7','#c62828','#00897b','#3949ab','#6d4c41',
]
function avColor(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return AV_COLORS[Math.abs(h) % AV_COLORS.length]
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, background: avColor(name), borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.38, fontWeight: 600, flexShrink: 0, fontFamily: 'Google Sans, Roboto, sans-serif' }}>
      {initials(name)}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function GmailPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [threads, setThreads] = useState<GmailThread[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [selected, setSelected] = useState<GmailThread | null>(null)
  const [messages, setMessages] = useState<GmailMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [expandedMsgs, setExpandedMsgs] = useState<Set<string>>(new Set())
  const [folder, setFolder] = useState('in:inbox')
  const [folderLabel, setFolderLabel] = useState('Inbox')
  const [searchInput, setSearchInput] = useState('')
  const [checkedThreads, setCheckedThreads] = useState<Set<string>>(new Set())

  // Reply / Compose
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<GmailMessage | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const [composing, setComposing] = useState(false)
  const [composeMin, setComposeMin] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composeSending, setComposeSending] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)

  // Check auth
  const checkAuth = useCallback(async () => {
    const res = await fetch('/api/gmail/threads?maxResults=1')
    setAuthenticated(res.status !== 401)
  }, [])
  useEffect(() => { checkAuth() }, [checkAuth])

  // Load threads
  const loadThreads = useCallback(async (q: string, token?: string) => {
    setLoading(true)
    const p = new URLSearchParams({ q, maxResults: '50' })
    if (token) p.set('pageToken', token)
    const res = await fetch(`/api/gmail/threads?${p}`)
    if (res.status === 401) { setAuthenticated(false); setLoading(false); return }
    const data = await res.json()
    if (token) setThreads(prev => [...prev, ...(data.threads ?? [])])
    else { setThreads(data.threads ?? []); setSelected(null) }
    setNextPageToken(data.nextPageToken ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { if (authenticated) loadThreads(folder) }, [authenticated, folder, loadThreads])

  // Load messages
  const loadThread = useCallback(async (id: string) => {
    setLoadingMsgs(true)
    const res = await fetch(`/api/gmail/thread?id=${id}`)
    const data = await res.json()
    const msgs: GmailMessage[] = data.messages ?? []
    setMessages(msgs)
    setExpandedMsgs(new Set([msgs[msgs.length - 1]?.id].filter(Boolean)))
    setThreads(prev => prev.map(t => t.id === id ? { ...t, unread: false } : t))
    setLoadingMsgs(false)
  }, [])

  useEffect(() => {
    if (selected) {
      loadThread(selected.id)
      setReplyOpen(false); setReplyBody(''); setSendError(null); setReplyTo(null)
    }
  }, [selected, loadThread])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, replyOpen])

  const toggleExpand = (id: string) => setExpandedMsgs(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const sendReply = async () => {
    if (!replyBody.trim() || !selected || !replyTo) return
    setSending(true); setSendError(null)
    const res = await fetch('/api/gmail/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: parseFrom(replyTo.from).email,
        subject: selected.subject.match(/^Re:/i) ? selected.subject : `Re: ${selected.subject}`,
        body: replyBody,
        threadId: selected.id,
        inReplyTo: replyTo.messageId,
        references: replyTo.messageId,
      }),
    })
    const data = await res.json()
    if (!data.ok) setSendError(data.error ?? 'Send failed')
    else { setReplyOpen(false); setReplyBody(''); await loadThread(selected.id); await loadThreads(folder) }
    setSending(false)
  }

  const sendCompose = async () => {
    if (!composeTo.trim() || !composeBody.trim()) return
    setComposeSending(true); setComposeError(null)
    const res = await fetch('/api/gmail/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: composeTo, subject: composeSubject || '(no subject)', body: composeBody }),
    })
    const data = await res.json()
    if (!data.ok) setComposeError(data.error ?? 'Send failed')
    else { setComposing(false); setComposeTo(''); setComposeSubject(''); setComposeBody(''); loadThreads(folder) }
    setComposeSending(false)
  }

  const archiveThread = async (id: string) => {
    await fetch(`/api/gmail/thread?id=${id}&action=archive`, { method: 'DELETE' })
    setThreads(prev => prev.filter(t => t.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchInput.trim()) {
      setFolder(searchInput)
      setFolderLabel(`Search: ${searchInput}`)
    }
  }

  const navFolder = (q: string, label: string) => {
    setFolder(q); setFolderLabel(label); setSelected(null)
  }

  const unreadCount = threads.filter(t => t.unread).length

  // ── Not authenticated ─────────────────────────────────────────────────────
  if (authenticated === false) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar title="Communications" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f8fc' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '40px 32px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', maxWidth: 400, width: '100%', textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, background: '#e8f0fe', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="36" height="36" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" fill="#1a73e8"/></svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#202124', marginBottom: 8, fontFamily: 'Google Sans, sans-serif' }}>Connect Gmail</h2>
            <p style={{ fontSize: 14, color: '#5f6368', marginBottom: 24, lineHeight: 1.6 }}>
              Connect <strong>contact@kembaliwater.com</strong> to use Gmail directly inside your ERP.
            </p>
            <a href="/api/gmail/auth" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#1a73e8', color: '#fff', borderRadius: 4, padding: '10px 24px', fontSize: 14, fontWeight: 500, textDecoration: 'none', fontFamily: 'Google Sans, sans-serif' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/></svg>
              Sign in with Google
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (authenticated === null) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar title="Communications" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 style={{ width: 24, height: 24, color: '#9aa0a6' }} className="animate-spin" />
        </div>
      </div>
    )
  }

  const SIDEBAR_W = 256

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: '#f6f8fc', fontFamily: 'Google Sans, Roboto, Arial, sans-serif' }}>

      {/* ── TOP BAR (Gmail style) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#f6f8fc', flexShrink: 0, borderBottom: '1px solid #e0e0e0' }}>
        {/* Gmail wordmark */}
        <div style={{ width: SIDEBAR_W - 24, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg height="28" viewBox="0 0 75 28" style={{ flexShrink: 0 }}>
            <g fill="none"><path d="M58.182 5.144c-3.36 0-5.844 1.176-7.98 3.024l2.28 2.712c1.548-1.38 3.288-2.244 5.58-2.244 3.708 0 6.468 2.4 6.468 6.816v.432c-1.344-.936-3.072-1.584-5.448-1.584-4.848 0-8.268 2.664-8.268 6.72 0 3.972 3.18 6.564 7.38 6.564 3.024 0 5.244-1.26 6.696-3.168v2.784h3.564V15.38c0-6.24-3.888-10.236-10.272-10.236zm.744 18.864c-2.256 0-4.14-1.26-4.14-3.384 0-2.196 1.884-3.528 4.86-3.528 2.016 0 3.648.468 4.788 1.224-.468 3.108-2.784 5.688-5.508 5.688zM43.2 5.52h-3.6v21.648h3.6V5.52zM28.8 27.168h3.6V5.52h-3.6v21.648zM21.6.48c-1.56 0-3.024.384-4.32 1.032L3.072 12.48A8.4 8.4 0 0 0 .48 18.96v2.4C.48 25.512 3.456 28 6.96 28h14.64c4.56 0 7.2-2.64 7.2-7.2V7.68C28.8 3.12 26.16.48 21.6.48zm3.6 20.32c0 2.64-1.44 3.6-3.6 3.6H6.96c-1.944 0-2.88-.984-2.88-2.88v-2.4c0-1.752.744-3.36 2.04-4.488L19.2 4.08c.744-.384 1.56-.6 2.4-.6 1.56 0 3.6.84 3.6 3.12v14.2z" fill="#EA4335"/></g>
          </svg>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 720 }}>
          <div style={{ display: 'flex', alignItems: 'center', background: '#eaf1fb', borderRadius: 24, padding: '0 16px', height: 46, gap: 8 }}>
            <Search style={{ width: 20, height: 20, color: '#5f6368', flexShrink: 0 }} />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search mail"
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: '#202124', fontFamily: 'inherit' }}
            />
            {searchInput && (
              <button type="button" onClick={() => { setSearchInput(''); navFolder('in:inbox', 'Inbox') }}>
                <X style={{ width: 18, height: 18, color: '#5f6368' }} />
              </button>
            )}
          </div>
        </form>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button onClick={() => loadThreads(folder)} style={{ padding: 8, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }} title="Refresh">
            <RefreshCw style={{ width: 20, height: 20, color: '#5f6368' }} />
          </button>
          <button style={{ padding: 8, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }} title="Settings">
            <Settings style={{ width: 20, height: 20, color: '#5f6368' }} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* ── LEFT SIDEBAR ── */}
        <div style={{ width: SIDEBAR_W, flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '8px 0', overflowY: 'auto' }}>

          {/* Compose button */}
          <div style={{ padding: '4px 16px 16px' }}>
            <button onClick={() => { setComposing(true); setComposeMin(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#c2e7ff', border: 'none', borderRadius: 16, padding: '16px 24px 16px 18px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, color: '#001d35' }}>
              <Pencil style={{ width: 22, height: 22 }} />
              Compose
            </button>
          </div>

          {/* Nav items */}
          {[
            { label: 'Inbox', q: 'in:inbox', count: unreadCount },
            { label: 'Starred', q: 'is:starred' },
            { label: 'Sent', q: 'in:sent' },
            { label: 'Drafts', q: 'in:drafts' },
            { label: 'All Mail', q: 'in:all' },
            { label: 'Spam', q: 'in:spam' },
            { label: 'Trash', q: 'in:trash' },
          ].map(item => (
            <button key={item.q} onClick={() => navFolder(item.q, item.label)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 16px 4px 26px', height: 36, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 14, fontWeight: folder === item.q ? 700 : 400,
                color: '#202124',
                background: folder === item.q ? '#d3e3fd' : 'transparent',
                borderRadius: '0 16px 16px 0', marginRight: 16,
              }}>
              <span>{item.label}</span>
              {item.count ? <span style={{ fontSize: 12, fontWeight: 700, color: '#444746' }}>{item.count}</span> : null}
            </button>
          ))}
        </div>

        {/* ── MAIN CONTENT ── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, margin: '0 8px 8px 0', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>

          {!selected ? (
            /* ══ THREAD LIST ══ */
            <>
              {/* Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', borderBottom: '1px solid #e0e0e0', flexShrink: 0 }}>
                <input type="checkbox" style={{ width: 16, height: 16, cursor: 'pointer' }}
                  onChange={e => setCheckedThreads(e.target.checked ? new Set(threads.map(t => t.id)) : new Set())}
                  checked={checkedThreads.size === threads.length && threads.length > 0} />
                <button style={{ padding: '6px 8px', borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#444746' }}>
                  <ChevronDown style={{ width: 14, height: 14 }} />
                </button>
                <div style={{ width: 1, height: 20, background: '#e0e0e0', margin: '0 4px' }} />
                <button onClick={() => loadThreads(folder)} style={{ padding: 6, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }} title="Refresh">
                  <RefreshCw style={{ width: 18, height: 18, color: '#444746' }} />
                </button>
                <button style={{ padding: 6, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                  <MoreHorizontal style={{ width: 18, height: 18, color: '#444746' }} />
                </button>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#5f6368' }}>
                  <span>1–{threads.length}</span>
                  <button style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={() => loadThreads(folder, undefined)}>
                    <ChevronLeft style={{ width: 18, height: 18, color: '#5f6368' }} />
                  </button>
                  {nextPageToken && (
                    <button style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={() => loadThreads(folder, nextPageToken)}>
                      <ChevronRight style={{ width: 18, height: 18, color: '#5f6368' }} />
                    </button>
                  )}
                </div>
              </div>

              {/* Thread rows */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                    <Loader2 style={{ width: 24, height: 24, color: '#9aa0a6' }} className="animate-spin" />
                  </div>
                ) : threads.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, color: '#5f6368' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                    <p style={{ fontSize: 16, fontWeight: 400 }}>No messages in {folderLabel}</p>
                  </div>
                ) : threads.map((thread, i) => {
                  const { name } = parseFrom(thread.from)
                  const isChecked = checkedThreads.has(thread.id)
                  return (
                    <div key={thread.id}
                      onClick={() => setSelected(thread)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 0,
                        padding: '0 16px', height: 52, cursor: 'pointer',
                        background: thread.unread ? '#fff' : '#f2f6fc',
                        borderBottom: '1px solid #e0e0e0',
                        fontWeight: thread.unread ? 700 : 400,
                        position: 'relative',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.12)')}
                      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                    >
                      {/* Checkbox */}
                      <div onClick={e => { e.stopPropagation(); setCheckedThreads(prev => { const n = new Set(prev); n.has(thread.id) ? n.delete(thread.id) : n.add(thread.id); return n }) }}
                        style={{ width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <input type="checkbox" checked={isChecked} onChange={() => {}} style={{ width: 16, height: 16 }} />
                      </div>

                      {/* Star */}
                      <div style={{ width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Star style={{ width: 16, height: 16, color: thread.starred ? '#f6bf26' : '#c4c7c5', fill: thread.starred ? '#f6bf26' : 'none' }} />
                      </div>

                      {/* Sender */}
                      <div style={{ width: 180, flexShrink: 0, overflow: 'hidden', paddingRight: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: thread.unread ? 700 : 400, color: '#202124', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                          {name || thread.from}
                          {thread.messageCount > 1 && <span style={{ color: '#5f6368', fontWeight: 400 }}> ({thread.messageCount})</span>}
                        </span>
                      </div>

                      {/* Subject + snippet */}
                      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 4, paddingRight: 8 }}>
                        <span style={{ fontSize: 14, color: '#202124', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '40%' }}>
                          {thread.subject || '(no subject)'}
                        </span>
                        <span style={{ fontSize: 14, color: '#5f6368', fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {' — '}{thread.snippet}
                        </span>
                      </div>

                      {/* Date */}
                      <div style={{ flexShrink: 0, fontSize: 12, color: thread.unread ? '#202124' : '#5f6368', fontWeight: thread.unread ? 700 : 400, minWidth: 60, textAlign: 'right' }}>
                        {formatDate(thread.internalDate)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            /* ══ THREAD VIEW ══ */
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* Thread header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #e0e0e0', flexShrink: 0 }}>
                <button onClick={() => setSelected(null)}
                  style={{ padding: 8, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                  <ChevronLeft style={{ width: 20, height: 20, color: '#5f6368' }} />
                </button>
                <h1 style={{ fontSize: 22, fontWeight: 400, color: '#202124', flex: 1, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selected.subject || '(no subject)'}
                </h1>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {[
                    { icon: Archive, title: 'Archive', action: () => archiveThread(selected.id) },
                    { icon: MailOpen, title: 'Mark unread', action: () => {} },
                    { icon: Clock, title: 'Snooze', action: () => {} },
                    { icon: MoreHorizontal, title: 'More', action: () => {} },
                  ].map(({ icon: Icon, title, action }) => (
                    <button key={title} onClick={action} title={title}
                      style={{ padding: 8, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                      <Icon style={{ width: 20, height: 20, color: '#5f6368' }} />
                    </button>
                  ))}
                </div>

                {/* Pagination */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, borderLeft: '1px solid #e0e0e0', paddingLeft: 8 }}>
                  <button style={{ padding: 8, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <ChevronLeft style={{ width: 18, height: 18, color: '#5f6368' }} />
                  </button>
                  <button style={{ padding: 8, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <ChevronRight style={{ width: 18, height: 18, color: '#5f6368' }} />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 16px' }}>
                {loadingMsgs ? (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}>
                    <Loader2 style={{ width: 24, height: 24, color: '#9aa0a6' }} className="animate-spin" />
                  </div>
                ) : messages.map((msg, i) => {
                  const { name, email } = parseFrom(msg.from)
                  const isExpanded = expandedMsgs.has(msg.id)
                  const isLast = i === messages.length - 1
                  const isOutbound = email === 'contact@kembaliwater.com'
                  const displayName = isOutbound ? 'Kembali Water' : name

                  return (
                    <div key={msg.id} style={{ marginBottom: 8, border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff', boxShadow: isExpanded ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                      {/* Message header */}
                      <div onClick={() => toggleExpand(msg.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: isExpanded ? '12px 16px 8px' : '12px 16px', cursor: 'pointer' }}>
                        <Avatar name={displayName} size={40} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#202124' }}>{displayName}</span>
                            {!isExpanded && <span style={{ fontSize: 13, color: '#5f6368', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{msg.body?.slice(0, 100)}</span>}
                          </div>
                          {isExpanded && (
                            <div style={{ fontSize: 12, color: '#5f6368', marginTop: 2 }}>
                              to {isOutbound ? parseFrom(selected.from).email : 'contact@kembaliwater.com'}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ fontSize: 12, color: '#5f6368' }}>{isExpanded ? fullDate(msg.internalDate) : formatDate(msg.internalDate)}</span>
                          {isExpanded ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button title="Star" style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '50%' }}>
                                <Star style={{ width: 18, height: 18, color: '#5f6368' }} />
                              </button>
                              <button title="Reply" onClick={e => { e.stopPropagation(); setReplyTo(msg); setReplyOpen(true) }}
                                style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '50%' }}>
                                <Reply style={{ width: 18, height: 18, color: '#5f6368' }} />
                              </button>
                              <button title="More" style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '50%' }}>
                                <MoreHorizontal style={{ width: 18, height: 18, color: '#5f6368' }} />
                              </button>
                            </div>
                          ) : (
                            <ChevronDown style={{ width: 16, height: 16, color: '#9aa0a6' }} />
                          )}
                        </div>
                      </div>

                      {/* Message body */}
                      {isExpanded && (
                        <div style={{ padding: '0 16px 16px 68px', borderTop: '1px solid #e0e0e0', paddingTop: 16 }}>
                          {msg.htmlBody ? (
                            <div dangerouslySetInnerHTML={{ __html: msg.htmlBody }}
                              style={{ fontSize: 14, color: '#202124', lineHeight: 1.6, maxWidth: '100%', overflow: 'hidden' }} />
                          ) : (
                            <pre style={{ fontSize: 14, color: '#202124', whiteSpace: 'pre-wrap', fontFamily: 'Roboto, Arial, sans-serif', margin: 0, lineHeight: 1.6 }}>{msg.body}</pre>
                          )}

                          {/* Reply/Forward buttons under last message */}
                          {isLast && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
                              {[
                                { label: 'Reply', icon: Reply, action: () => { setReplyTo(msg); setReplyOpen(true) } },
                                { label: 'Reply all', icon: ReplyAll, action: () => { setReplyTo(msg); setReplyOpen(true) } },
                                { label: 'Forward', icon: Forward, action: () => {} },
                              ].map(({ label, icon: Icon, action }) => (
                                <button key={label} onClick={action}
                                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '1px solid #dadce0', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 14, color: '#444746', fontFamily: 'inherit' }}>
                                  <Icon style={{ width: 16, height: 16 }} /> {label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Reply compose */}
                {replyOpen && replyTo && (
                  <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.15)', marginTop: 8 }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', fontSize: 14, color: '#5f6368', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Reply to <strong style={{ color: '#202124' }}>{parseFrom(replyTo.from).email}</strong></span>
                      <button onClick={() => { setReplyOpen(false); setReplyBody('') }}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4 }}>
                        <X style={{ width: 16, height: 16, color: '#5f6368' }} />
                      </button>
                    </div>
                    <textarea
                      autoFocus
                      value={replyBody}
                      onChange={e => setReplyBody(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply() } }}
                      placeholder="Write your reply…"
                      style={{ width: '100%', minHeight: 140, border: 'none', outline: 'none', padding: 16, fontSize: 14, fontFamily: 'Roboto, Arial, sans-serif', resize: 'vertical', boxSizing: 'border-box', color: '#202124', lineHeight: 1.6 }}
                    />
                    {sendError && <p style={{ margin: '0 16px 8px', fontSize: 12, color: '#d93025' }}>{sendError}</p>}
                    <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f3f4', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button onClick={sendReply} disabled={sending || !replyBody.trim()}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, background: sending || !replyBody.trim() ? '#f1f3f4' : '#0b57d0', color: sending || !replyBody.trim() ? '#9aa0a6' : '#fff', border: 'none', borderRadius: 20, padding: '10px 24px', fontSize: 14, fontWeight: 500, cursor: sending || !replyBody.trim() ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                        {sending ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : <Send style={{ width: 16, height: 16 }} />}
                        Send
                      </button>
                      <button onClick={() => { setReplyOpen(false); setReplyBody('') }}
                        style={{ padding: 8, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                        <Trash2 style={{ width: 18, height: 18, color: '#5f6368' }} />
                      </button>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── FLOATING COMPOSE (Gmail style) ── */}
      {composing && (
        <div style={{
          position: 'fixed', bottom: 0, right: 32, zIndex: 50,
          width: 500, background: '#fff', borderRadius: '8px 8px 0 0',
          boxShadow: '0 8px 10px 1px rgba(0,0,0,0.14), 0 3px 14px 2px rgba(0,0,0,0.12), 0 5px 5px -3px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column',
          height: composeMin ? 48 : 480,
          transition: 'height 0.15s ease',
        }}>
          {/* Compose header */}
          <div onClick={() => setComposeMin(!composeMin)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#404040', borderRadius: '8px 8px 0 0', cursor: 'pointer', flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#fff', fontFamily: 'inherit' }}>New Message</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={e => { e.stopPropagation(); setComposeMin(!composeMin) }}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 4px' }}>
                {composeMin ? <ChevronUp style={{ width: 18, height: 18, color: '#fff' }} /> : <ChevronDown style={{ width: 18, height: 18, color: '#fff' }} />}
              </button>
              <button onClick={e => { e.stopPropagation(); setComposing(false) }}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 4px' }}>
                <X style={{ width: 18, height: 18, color: '#fff' }} />
              </button>
            </div>
          </div>

          {!composeMin && (
            <>
              <div style={{ borderBottom: '1px solid #e0e0e0', padding: '0 12px' }}>
                <input autoFocus value={composeTo} onChange={e => setComposeTo(e.target.value)} placeholder="To"
                  style={{ width: '100%', padding: '8px 0', border: 'none', outline: 'none', fontSize: 14, fontFamily: 'inherit', color: '#202124' }} />
              </div>
              <div style={{ borderBottom: '1px solid #e0e0e0', padding: '0 12px' }}>
                <input value={composeSubject} onChange={e => setComposeSubject(e.target.value)} placeholder="Subject"
                  style={{ width: '100%', padding: '8px 0', border: 'none', outline: 'none', fontSize: 14, fontFamily: 'inherit', color: '#202124', fontWeight: 500 }} />
              </div>
              <textarea value={composeBody} onChange={e => setComposeBody(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendCompose() } }}
                placeholder="   "
                style={{ flex: 1, border: 'none', outline: 'none', padding: 12, fontSize: 14, fontFamily: 'inherit', resize: 'none', color: '#202124', lineHeight: 1.6 }} />
              {composeError && <p style={{ margin: '0 12px 4px', fontSize: 12, color: '#d93025' }}>{composeError}</p>}
              <div style={{ padding: '8px 12px', borderTop: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={sendCompose} disabled={composeSending || !composeTo.trim() || !composeBody.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: composeSending || !composeTo.trim() || !composeBody.trim() ? '#f1f3f4' : '#0b57d0', color: composeSending || !composeTo.trim() || !composeBody.trim() ? '#9aa0a6' : '#fff', border: 'none', borderRadius: 20, padding: '10px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {composeSending ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : null}
                  Send
                </button>
                <div style={{ marginLeft: 'auto' }}>
                  <button onClick={() => setComposing(false)} style={{ padding: 8, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '50%' }}>
                    <Trash2 style={{ width: 18, height: 18, color: '#5f6368' }} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
