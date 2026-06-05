'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import {
  Search, RefreshCw, Loader2, Pencil, X, ChevronDown, ChevronUp,
  Star, Reply, ReplyAll, Forward, Trash2, Archive, MoreHorizontal,
  ChevronLeft, ChevronRight, Send, LogIn, Check, Printer,
  MailOpen, Tag, Clock, Settings, Menu, MessageCircle, Mail,
  Phone, CheckCheck, Image, Paperclip, Smile, Mic, Plus, User,
  Hash, MessageSquare, Circle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ───────────────────────────────────────────────────────────────────

interface GmailThread {
  id: string; subject: string; from: string; to: string; date: string
  internalDate: string; snippet: string; unread: boolean; starred: boolean
  messageCount: number; labelIds: string[]
}

interface GmailMessage {
  id: string; threadId: string; subject: string; from: string; to: string
  date: string; messageId: string; inReplyTo: string; body: string; htmlBody: string
  unread: boolean; internalDate: string; labelIds: string[]
}

interface WAConversation {
  id: string; phone: string; contact_name: string | null; customer_id: string | null
  last_message: string | null; last_message_at: string | null; unread_count: number
  customer?: { name: string } | null
}

interface WAMessage {
  id: string; conversation_id: string; direction: 'inbound' | 'outbound'
  body: string; status: string; created_at: string
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
  if (diff < 86400 && now.getDate() === d.getDate()) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (diff < 86400 * 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fullDate(ms: string | number) {
  const d = new Date(typeof ms === 'string' && ms.length < 14 ? parseInt(ms) : ms)
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

function initials(name: string) {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

const AV_COLORS = ['#1a73e8','#d93025','#1e8e3e','#e37400','#7627bb','#0097a7','#c62828','#00897b','#3949ab','#6d4c41']
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

function waTimeStr(ts: string) {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000 && now.getDate() === d.getDate()) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (diff < 86400000 * 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ─── WhatsApp Tab ─────────────────────────────────────────────────────────────

function WhatsAppTab() {
  const [conversations, setConversations] = useState<WAConversation[]>([])
  const [selected, setSelected] = useState<WAConversation | null>(null)
  const [messages, setMessages] = useState<WAMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [msgInput, setMsgInput] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newName, setNewName] = useState('')
  const [customers, setCustomers] = useState<any[]>([])
  const [newCustomerId, setNewCustomerId] = useState('')
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [broadcasting, setBroadcasting] = useState(false)
  const [broadcastResult, setBroadcastResult] = useState<{sent: number; failed: number} | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const sb = createClient()

  const loadConversations = useCallback(async () => {
    setLoading(true)
    const { data } = await sb
      .from('whatsapp_conversations')
      .select('*, customer:customers(name)')
      .order('last_message_at', { ascending: false, nullsFirst: false })
    setConversations(data ?? [])
    setLoading(false)
  }, [])

  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true)
    const { data } = await sb
      .from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
    setMessages(data ?? [])
    setLoadingMsgs(false)
    // Mark as read
    await sb.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', convId)
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c))
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])
  useEffect(() => { if (selected) loadMessages(selected.id) }, [selected, loadMessages])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    const sb2 = createClient()
    if (!selected) return
    const channel = sb2
      .channel(`wa-msgs-${selected.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `conversation_id=eq.${selected.id}` }, (payload) => {
        setMessages(prev => [...prev, payload.new as WAMessage])
      })
      .subscribe()
    return () => { sb2.removeChannel(channel) }
  }, [selected?.id])

  const sendMessage = async () => {
    if (!msgInput.trim() || !selected || sending) return
    setSending(true)
    const body = msgInput.trim()
    setMsgInput('')
    // Optimistically add
    const optimistic: WAMessage = { id: crypto.randomUUID(), conversation_id: selected.id, direction: 'outbound', body, status: 'sending', created_at: new Date().toISOString() }
    setMessages(prev => [...prev, optimistic])

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selected.id, to: selected.phone, body }),
      })
      const data = await res.json()
      if (data.ok) {
        setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, id: data.id, status: 'sent' } : m))
        setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, last_message: body, last_message_at: new Date().toISOString() } : c))
      } else {
        setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, status: 'failed' } : m))
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, status: 'failed' } : m))
    }
    setSending(false)
  }

  const createConversation = async () => {
    if (!newPhone.trim()) return
    const { data } = await sb.from('whatsapp_conversations').insert({
      phone: newPhone.trim().startsWith('+') ? newPhone.trim() : `+${newPhone.trim()}`,
      contact_name: newName.trim() || null,
      customer_id: newCustomerId || null,
    }).select('*, customer:customers(name)').single()
    if (data) {
      setConversations(prev => [data, ...prev])
      setSelected(data)
      setMessages([])
    }
    setShowNew(false); setNewPhone(''); setNewName(''); setNewCustomerId('')
  }

  useEffect(() => {
    sb.from('customers').select('id, name').eq('active', true).order('name').then(({ data }) => setCustomers(data ?? []))
  }, [])

  const filtered = conversations.filter(c => {
    const s = search.toLowerCase()
    return !s || (c.contact_name?.toLowerCase().includes(s) || c.phone.includes(s) || (c.customer as any)?.name?.toLowerCase().includes(s))
  })

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim() || broadcasting) return
    setBroadcasting(true)
    try {
      const res = await fetch('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastMsg }),
      })
      const data = await res.json()
      setBroadcastResult({ sent: data.sent, failed: data.failed })
      setBroadcastMsg('')
      await loadConversations()
    } finally {
      setBroadcasting(false)
    }
  }

  const WA_GREEN = '#25D366'
  const WA_DARK = '#111b21'
  const WA_MID = '#202c33'
  const WA_PANEL = '#0b141a'
  const WA_BUBBLE_OUT = '#005c4b'
  const WA_BUBBLE_IN = '#202c33'
  const WA_TEXT = '#e9edef'
  const WA_MUTED = '#8696a0'

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: WA_DARK, fontFamily: 'Segoe UI, Helvetica Neue, sans-serif', minHeight: 0 }}>

      {/* Left panel — conversations */}
      <div style={{ width: 350, flexShrink: 0, display: 'flex', flexDirection: 'column', background: WA_PANEL, borderRight: `1px solid ${WA_MID}` }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: WA_MID, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 40, height: 40, background: WA_GREEN, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageCircle size={20} color="#fff" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: WA_TEXT }}>WhatsApp</p>
              <p style={{ margin: 0, fontSize: 12, color: WA_MUTED }}>Kembali Water</p>
            </div>
          </div>
          <button onClick={() => { setShowBroadcast(true); setBroadcastResult(null) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, borderRadius: '50%' }} title="Broadcast to all">
            <Send size={18} color={WA_MUTED} />
          </button>
          <button onClick={() => setShowNew(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, borderRadius: '50%', color: WA_MUTED }} title="New conversation">
            <Plus size={20} color={WA_MUTED} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '8px 12px', background: WA_PANEL, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', background: WA_MID, borderRadius: 8, padding: '6px 12px', gap: 8 }}>
            <Search size={16} color={WA_MUTED} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search or start new chat"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: WA_TEXT, fontFamily: 'inherit' }} />
          </div>
        </div>

        {/* Conversations */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Loader2 size={20} color={WA_MUTED} className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: WA_MUTED, fontSize: 14 }}>
              <MessageCircle size={40} color={WA_MID} style={{ margin: '0 auto 8px' }} />
              <p style={{ margin: 0 }}>No conversations yet</p>
              <p style={{ margin: '4px 0 0', fontSize: 12 }}>Click + to start a new chat</p>
            </div>
          ) : filtered.map(conv => {
            const name = conv.contact_name || (conv.customer as any)?.name || conv.phone
            const isActive = selected?.id === conv.id
            return (
              <div key={conv.id} onClick={() => setSelected(conv)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', background: isActive ? WA_MID : 'transparent', borderBottom: `1px solid ${WA_MID}` }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                <div style={{ width: 49, height: 49, background: avColor(name), borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>
                  {initials(name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: WA_TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{name}</span>
                    {conv.last_message_at && <span style={{ fontSize: 12, color: conv.unread_count > 0 ? WA_GREEN : WA_MUTED, flexShrink: 0 }}>{waTimeStr(conv.last_message_at)}</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: WA_MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{conv.last_message || conv.phone}</span>
                    {conv.unread_count > 0 && (
                      <span style={{ background: WA_GREEN, color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{conv.unread_count}</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right panel — chat */}
      {!selected ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#222e35', gap: 16 }}>
          <div style={{ width: 200, height: 200, background: WA_MID, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={80} color={WA_MUTED} />
          </div>
          <p style={{ color: WA_TEXT, fontSize: 32, fontWeight: 300, margin: 0 }}>WhatsApp</p>
          <p style={{ color: WA_MUTED, fontSize: 14, margin: 0, textAlign: 'center', maxWidth: 400 }}>
            Send and receive messages to your customers via WhatsApp Business.<br />
            Select a conversation or start a new one.
          </p>
          {!process.env.NEXT_PUBLIC_TWILIO_CONFIGURED && (
            <div style={{ background: '#2a2f32', borderRadius: 8, padding: '12px 20px', maxWidth: 400, border: '1px solid #3a4044' }}>
              <p style={{ color: '#f6bf26', fontSize: 13, margin: 0, fontWeight: 500 }}>⚡ Setup Required</p>
              <p style={{ color: WA_MUTED, fontSize: 12, margin: '4px 0 0' }}>Add <code style={{ color: WA_TEXT }}>TWILIO_ACCOUNT_SID</code>, <code style={{ color: WA_TEXT }}>TWILIO_AUTH_TOKEN</code>, and <code style={{ color: WA_TEXT }}>TWILIO_WHATSAPP_FROM</code> to your .env to enable sending.</p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0b141a' }}>
          {/* Chat header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: WA_MID, flexShrink: 0 }}>
            <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: WA_MUTED, padding: 4 }}>
              <ChevronLeft size={20} color={WA_MUTED} />
            </button>
            <div style={{ width: 40, height: 40, background: avColor(selected.contact_name || selected.phone), borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
              {initials(selected.contact_name || (selected.customer as any)?.name || selected.phone)}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: WA_TEXT }}>
                {selected.contact_name || (selected.customer as any)?.name || selected.phone}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: WA_MUTED }}>{selected.phone}</p>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[Search, Phone, MoreHorizontal].map((Icon, i) => (
                <button key={i} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, borderRadius: '50%' }}>
                  <Icon size={20} color={WA_MUTED} />
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 4, backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\'%3E%3Crect width=\'50\' height=\'50\' fill=\'%23111b21\'/%3E%3C/svg%3E")' }}>
            {loadingMsgs ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 32 }}>
                <Loader2 size={24} color={WA_MUTED} className="animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: WA_MUTED, fontSize: 13, marginTop: 32 }}>
                No messages yet. Say hi! 👋
              </div>
            ) : (
              messages.map((msg, i) => {
                const isOut = msg.direction === 'outbound'
                const showDateSep = i === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[i-1].created_at).toDateString()
                return (
                  <div key={msg.id}>
                    {showDateSep && (
                      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
                        <span style={{ background: '#182229', color: WA_MUTED, fontSize: 12, padding: '4px 12px', borderRadius: 8 }}>
                          {new Date(msg.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
                      <div style={{ maxWidth: '65%', background: isOut ? WA_BUBBLE_OUT : WA_BUBBLE_IN, borderRadius: isOut ? '8px 0 8px 8px' : '0 8px 8px 8px', padding: '6px 10px 8px', position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                        <p style={{ margin: 0, fontSize: 14.2, color: WA_TEXT, lineHeight: 1.5, wordBreak: 'break-word' }}>{msg.body}</p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <span style={{ fontSize: 11, color: WA_MUTED }}>{waTimeStr(msg.created_at)}</span>
                          {isOut && (
                            <span style={{ color: msg.status === 'failed' ? '#ef4444' : WA_MUTED }}>
                              {msg.status === 'sending' ? '🕐' : msg.status === 'failed' ? '⚠' : <CheckCheck size={14} color="#53bdeb" />}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: WA_MID, flexShrink: 0 }}>
            <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8 }}>
              <Smile size={22} color={WA_MUTED} />
            </button>
            <div style={{ flex: 1, background: '#2a3942', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '6px 12px', gap: 8 }}>
              <input
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Type a message"
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: WA_TEXT, fontFamily: 'inherit' }}
              />
            </div>
            <button onClick={sendMessage} disabled={!msgInput.trim() || sending}
              style={{ background: WA_GREEN, border: 'none', cursor: msgInput.trim() ? 'pointer' : 'default', padding: 10, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: msgInput.trim() ? 1 : 0.5 }}>
              {sending ? <Loader2 size={20} color="#fff" className="animate-spin" /> : <Send size={20} color="#fff" />}
            </button>
          </div>
        </div>
      )}

      {/* Broadcast modal */}
      {showBroadcast && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#233138', borderRadius: 12, padding: 24, width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: WA_TEXT, fontSize: 17, fontWeight: 600 }}>📢 Broadcast Message</h3>
              <button onClick={() => setShowBroadcast(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} color={WA_MUTED} />
              </button>
            </div>
            <p style={{ color: WA_MUTED, fontSize: 13, marginBottom: 16 }}>
              Send a message to <strong style={{ color: WA_TEXT }}>{conversations.length} conversation{conversations.length !== 1 ? 's' : ''}</strong>. Use for announcements, price changes, holiday notices, etc.
            </p>
            <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)}
              placeholder="Type your broadcast message..."
              rows={4}
              style={{ width: '100%', background: '#2a3942', border: '1px solid #3a4a54', borderRadius: 8, padding: '10px 12px', color: WA_TEXT, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
            {broadcastResult && (
              <div style={{ background: broadcastResult.failed > 0 ? '#2a1a1a' : '#1a2a1a', borderRadius: 8, padding: '10px 12px', marginTop: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: broadcastResult.failed > 0 ? '#f6bf26' : WA_GREEN }}>
                  ✅ Sent to {broadcastResult.sent} contacts{broadcastResult.failed > 0 ? ` · ❌ ${broadcastResult.failed} failed` : ''}
                </p>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowBroadcast(false)} style={{ padding: '10px 20px', borderRadius: 8, background: 'transparent', border: '1px solid #3a4a54', color: WA_MUTED, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button onClick={sendBroadcast} disabled={!broadcastMsg.trim() || broadcasting}
                style={{ padding: '10px 20px', borderRadius: 8, background: WA_GREEN, border: 'none', color: '#fff', cursor: broadcastMsg.trim() && !broadcasting ? 'pointer' : 'default', fontSize: 14, fontWeight: 600, opacity: broadcastMsg.trim() && !broadcasting ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                {broadcasting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send Broadcast
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New conversation modal */}
      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#233138', borderRadius: 12, padding: 24, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: WA_TEXT, fontSize: 18, fontWeight: 600 }}>New Conversation</h3>
              <button onClick={() => setShowNew(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={20} color={WA_MUTED} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: WA_MUTED, marginBottom: 4 }}>WhatsApp Number *</label>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+628123456789"
                  style={{ width: '100%', background: '#2a3942', border: '1px solid #3a4a54', borderRadius: 8, padding: '10px 12px', color: WA_TEXT, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: WA_MUTED, marginBottom: 4 }}>Contact Name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Budi Santoso"
                  style={{ width: '100%', background: '#2a3942', border: '1px solid #3a4a54', borderRadius: 8, padding: '10px 12px', color: WA_TEXT, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: WA_MUTED, marginBottom: 4 }}>Link to Customer (optional)</label>
                <select value={newCustomerId} onChange={e => setNewCustomerId(e.target.value)}
                  style={{ width: '100%', background: '#2a3942', border: '1px solid #3a4a54', borderRadius: 8, padding: '10px 12px', color: newCustomerId ? WA_TEXT : WA_MUTED, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}>
                  <option value="">— No customer link —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button onClick={() => setShowNew(false)} style={{ padding: '10px 20px', borderRadius: 8, background: 'transparent', border: '1px solid #3a4a54', color: WA_MUTED, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
                <button onClick={createConversation} disabled={!newPhone.trim()}
                  style={{ padding: '10px 20px', borderRadius: 8, background: WA_GREEN, border: 'none', color: '#fff', cursor: newPhone.trim() ? 'pointer' : 'default', fontSize: 14, fontWeight: 600, opacity: newPhone.trim() ? 1 : 0.5 }}>
                  Start Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Gmail Tab ────────────────────────────────────────────────────────────────

function GmailTab() {
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
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<GmailMessage | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [replyAttachments, setReplyAttachments] = useState<{ name: string; type: string; data: string; size: number }[]>([])
  const replyAttachInputRef = useRef<HTMLInputElement>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const handleReplyAttachFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        const result = ev.target?.result as string
        const base64 = result.split(',')[1]
        setReplyAttachments(prev => [...prev, { name: file.name, type: file.type || 'application/octet-stream', data: base64, size: file.size }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }
  const [composing, setComposing] = useState(false)
  const [composeMin, setComposeMin] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composeSending, setComposeSending] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [composeAttachments, setComposeAttachments] = useState<{ name: string; type: string; data: string; size: number }[]>([])
  const attachInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const handleAttachFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        const result = ev.target?.result as string
        // result is "data:mime/type;base64,XXXX"
        const base64 = result.split(',')[1]
        setComposeAttachments(prev => [...prev, { name: file.name, type: file.type || 'application/octet-stream', data: base64, size: file.size }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeAttachment = (idx: number) => setComposeAttachments(prev => prev.filter((_, i) => i !== idx))

  const checkAuth = useCallback(async () => {
    const res = await fetch('/api/gmail/threads?maxResults=1')
    setAuthenticated(res.status !== 401)
  }, [])
  useEffect(() => { checkAuth() }, [checkAuth])

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
    if (selected) { loadThread(selected.id); setReplyOpen(false); setReplyBody(''); setSendError(null); setReplyTo(null) }
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
        attachments: replyAttachments.length > 0 ? replyAttachments : undefined,
      }),
    })
    const data = await res.json()
    if (!data.ok) setSendError(data.error ?? 'Send failed')
    else { setReplyOpen(false); setReplyBody(''); setReplyAttachments([]); await loadThread(selected.id); await loadThreads(folder) }
    setSending(false)
  }

  const sendCompose = async () => {
    if (!composeTo.trim() || !composeBody.trim()) return
    setComposeSending(true); setComposeError(null)
    const res = await fetch('/api/gmail/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: composeTo,
        subject: composeSubject || '(no subject)',
        body: composeBody,
        attachments: composeAttachments.length > 0 ? composeAttachments : undefined,
      }),
    })
    const data = await res.json()
    if (!data.ok) setComposeError(data.error ?? 'Send failed')
    else {
      setComposing(false)
      setComposeTo(''); setComposeSubject(''); setComposeBody('')
      setComposeAttachments([])
      loadThreads(folder)
    }
    setComposeSending(false)
  }

  const archiveThread = async (id: string) => {
    await fetch(`/api/gmail/thread?id=${id}&action=archive`, { method: 'DELETE' })
    setThreads(prev => prev.filter(t => t.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchInput.trim()) { setFolder(searchInput); setFolderLabel(`Search: ${searchInput}`) }
  }

  const navFolder = (q: string, label: string) => { setFolder(q); setFolderLabel(label); setSelected(null) }
  const unreadCount = threads.filter(t => t.unread).length

  if (authenticated === false) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f8fc' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '40px 32px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, background: '#e8f0fe', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="36" height="36" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" fill="#1a73e8"/></svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#202124', marginBottom: 8, fontFamily: 'Google Sans, sans-serif' }}>Connect Gmail</h2>
          <p style={{ fontSize: 14, color: '#5f6368', marginBottom: 24, lineHeight: 1.6 }}>Connect <strong>contact@kembaliwater.com</strong> to use Gmail directly inside your ERP.</p>
          <a href="/api/gmail/auth" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#1a73e8', color: '#fff', borderRadius: 4, padding: '10px 24px', fontSize: 14, fontWeight: 500, textDecoration: 'none', fontFamily: 'Google Sans, sans-serif' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/></svg>
            Sign in with Google
          </a>
        </div>
      </div>
    )
  }

  if (authenticated === null) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 style={{ width: 24, height: 24, color: '#9aa0a6' }} className="animate-spin" />
      </div>
    )
  }

  const SIDEBAR_W = 256

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: '#f6f8fc', fontFamily: 'Google Sans, Roboto, Arial, sans-serif', minHeight: 0 }}>
      {/* ── LEFT SIDEBAR ── */}
      <div style={{ width: SIDEBAR_W, flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '8px 0', overflowY: 'auto' }}>
        <div style={{ padding: '4px 16px 16px' }}>
          <button onClick={() => { setComposing(true); setComposeMin(false) }}
            style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#c2e7ff', border: 'none', borderRadius: 16, padding: '16px 24px 16px 18px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, color: '#001d35' }}>
            <Pencil style={{ width: 22, height: 22 }} />Compose
          </button>
        </div>
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
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 4px 26px', height: 36, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: folder === item.q ? 700 : 400, color: '#202124', background: folder === item.q ? '#d3e3fd' : 'transparent', borderRadius: '0 16px 16px 0', marginRight: 16 }}>
            <span>{item.label}</span>
            {item.count ? <span style={{ fontSize: 12, fontWeight: 700, color: '#444746' }}>{item.count}</span> : null}
          </button>
        ))}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, margin: '0 8px 8px 0', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
        {!selected ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', borderBottom: '1px solid #e0e0e0', flexShrink: 0 }}>
              <input type="checkbox" style={{ width: 16, height: 16, cursor: 'pointer' }}
                onChange={e => setCheckedThreads(e.target.checked ? new Set(threads.map(t => t.id)) : new Set())}
                checked={checkedThreads.size === threads.length && threads.length > 0} />
              <button style={{ padding: '6px 8px', borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#444746' }}>
                <ChevronDown style={{ width: 14, height: 14 }} />
              </button>
              <div style={{ width: 1, height: 20, background: '#e0e0e0', margin: '0 4px' }} />
              <button onClick={() => loadThreads(folder)} style={{ padding: 6, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <RefreshCw style={{ width: 18, height: 18, color: '#444746' }} />
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
              ) : threads.map((thread) => {
                const { name } = parseFrom(thread.from)
                const isChecked = checkedThreads.has(thread.id)
                return (
                  <div key={thread.id} onClick={() => setSelected(thread)}
                    style={{ display: 'flex', alignItems: 'center', padding: '0 16px', height: 52, cursor: 'pointer', background: thread.unread ? '#fff' : '#f2f6fc', borderBottom: '1px solid #e0e0e0', fontWeight: thread.unread ? 700 : 400 }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.12)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                    <div onClick={e => { e.stopPropagation(); setCheckedThreads(prev => { const n = new Set(prev); n.has(thread.id) ? n.delete(thread.id) : n.add(thread.id); return n }) }}
                      style={{ width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <input type="checkbox" checked={isChecked} onChange={() => {}} style={{ width: 16, height: 16 }} />
                    </div>
                    <div style={{ width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Star style={{ width: 16, height: 16, color: thread.starred ? '#f6bf26' : '#c4c7c5', fill: thread.starred ? '#f6bf26' : 'none' }} />
                    </div>
                    <div style={{ width: 180, flexShrink: 0, overflow: 'hidden', paddingRight: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: thread.unread ? 700 : 400, color: '#202124', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                        {name || thread.from}{thread.messageCount > 1 && <span style={{ color: '#5f6368', fontWeight: 400 }}> ({thread.messageCount})</span>}
                      </span>
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 4, paddingRight: 8 }}>
                      <span style={{ fontSize: 14, color: '#202124', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '40%' }}>{thread.subject || '(no subject)'}</span>
                      <span style={{ fontSize: 14, color: '#5f6368', fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{' — '}{thread.snippet}</span>
                    </div>
                    <div style={{ flexShrink: 0, fontSize: 12, color: thread.unread ? '#202124' : '#5f6368', fontWeight: thread.unread ? 700 : 400, minWidth: 60, textAlign: 'right' }}>
                      {formatDate(thread.internalDate)}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #e0e0e0', flexShrink: 0 }}>
              <button onClick={() => setSelected(null)} style={{ padding: 8, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <ChevronLeft style={{ width: 20, height: 20, color: '#5f6368' }} />
              </button>
              <h1 style={{ fontSize: 22, fontWeight: 400, color: '#202124', flex: 1, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected.subject || '(no subject)'}
              </h1>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {[{ icon: Archive, title: 'Archive', action: () => archiveThread(selected.id) }, { icon: MailOpen, title: 'Mark unread', action: () => {} }, { icon: Clock, title: 'Snooze', action: () => {} }, { icon: MoreHorizontal, title: 'More', action: () => {} }].map(({ icon: Icon, title, action }) => (
                  <button key={title} onClick={action} title={title} style={{ padding: 8, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <Icon style={{ width: 20, height: 20, color: '#5f6368' }} />
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, borderLeft: '1px solid #e0e0e0', paddingLeft: 8 }}>
                <button style={{ padding: 8, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }}><ChevronLeft style={{ width: 18, height: 18, color: '#5f6368' }} /></button>
                <button style={{ padding: 8, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }}><ChevronRight style={{ width: 18, height: 18, color: '#5f6368' }} /></button>
              </div>
            </div>
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
                    <div onClick={() => toggleExpand(msg.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: isExpanded ? '12px 16px 8px' : '12px 16px', cursor: 'pointer' }}>
                      <Avatar name={displayName} size={40} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#202124' }}>{displayName}</span>
                          {!isExpanded && <span style={{ fontSize: 13, color: '#5f6368', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{msg.body?.slice(0, 100)}</span>}
                        </div>
                        {isExpanded && <div style={{ fontSize: 12, color: '#5f6368', marginTop: 2 }}>to {isOutbound ? parseFrom(selected.from).email : 'contact@kembaliwater.com'}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, color: '#5f6368' }}>{isExpanded ? fullDate(msg.internalDate) : formatDate(msg.internalDate)}</span>
                        {isExpanded ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button title="Reply" onClick={e => { e.stopPropagation(); setReplyTo(msg); setReplyOpen(true) }} style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '50%' }}>
                              <Reply style={{ width: 18, height: 18, color: '#5f6368' }} />
                            </button>
                            <button title="More" style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '50%' }}>
                              <MoreHorizontal style={{ width: 18, height: 18, color: '#5f6368' }} />
                            </button>
                          </div>
                        ) : <ChevronDown style={{ width: 16, height: 16, color: '#9aa0a6' }} />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ padding: '0 16px 16px 68px', borderTop: '1px solid #e0e0e0', paddingTop: 16 }}>
                        {msg.htmlBody ? (
                          <div dangerouslySetInnerHTML={{ __html: msg.htmlBody }} style={{ fontSize: 14, color: '#202124', lineHeight: 1.6, maxWidth: '100%', overflow: 'hidden' }} />
                        ) : (
                          <pre style={{ fontSize: 14, color: '#202124', whiteSpace: 'pre-wrap', fontFamily: 'Roboto, Arial, sans-serif', margin: 0, lineHeight: 1.6 }}>{msg.body}</pre>
                        )}
                        {isLast && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
                            {[{ label: 'Reply', icon: Reply, action: () => { setReplyTo(msg); setReplyOpen(true) } }, { label: 'Reply all', icon: ReplyAll, action: () => { setReplyTo(msg); setReplyOpen(true) } }, { label: 'Forward', icon: Forward, action: () => {} }].map(({ label, icon: Icon, action }) => (
                              <button key={label} onClick={action} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '1px solid #dadce0', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 14, color: '#444746', fontFamily: 'inherit' }}>
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
              {replyOpen && replyTo && (
                <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,0.15)', marginTop: 8 }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0', fontSize: 14, color: '#5f6368', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Reply to <strong style={{ color: '#202124' }}>{parseFrom(replyTo.from).email}</strong></span>
                    <button onClick={() => { setReplyOpen(false); setReplyBody('') }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4 }}>
                      <X style={{ width: 16, height: 16, color: '#5f6368' }} />
                    </button>
                  </div>
                  <textarea autoFocus value={replyBody} onChange={e => setReplyBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply() } }} placeholder="Write your reply…"
                    style={{ width: '100%', minHeight: 140, border: 'none', outline: 'none', padding: 16, fontSize: 14, fontFamily: 'Roboto, Arial, sans-serif', resize: 'vertical', boxSizing: 'border-box', color: '#202124', lineHeight: 1.6 }} />
                  {/* Reply attachment chips */}
                  {replyAttachments.length > 0 && (
                    <div style={{ padding: '6px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {replyAttachments.map((att, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f1f3f4', borderRadius: 16, padding: '4px 10px', fontSize: 12, color: '#3c4043' }}>
                          <Paperclip style={{ width: 12, height: 12 }} />
                          <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                          <span style={{ color: '#80868b' }}>({(att.size / 1024).toFixed(0)}KB)</span>
                          <button onClick={() => setReplyAttachments(prev => prev.filter((_, j) => j !== i))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, lineHeight: 1, marginLeft: 2 }}>
                            <X style={{ width: 12, height: 12, color: '#5f6368' }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {sendError && <p style={{ margin: '0 16px 8px', fontSize: 12, color: '#d93025' }}>{sendError}</p>}
                  <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f3f4', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={sendReply} disabled={sending || !replyBody.trim()}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: sending || !replyBody.trim() ? '#f1f3f4' : '#0b57d0', color: sending || !replyBody.trim() ? '#9aa0a6' : '#fff', border: 'none', borderRadius: 20, padding: '10px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {sending ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : <Send style={{ width: 16, height: 16 }} />} Send
                    </button>
                    {/* Reply attach button */}
                    <button type="button" onClick={() => replyAttachInputRef.current?.click()} title="Attach files"
                      style={{ padding: 8, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Paperclip style={{ width: 18, height: 18, color: '#5f6368' }} />
                    </button>
                    <input ref={replyAttachInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleReplyAttachFiles} />
                    <button onClick={() => { setReplyOpen(false); setReplyBody(''); setReplyAttachments([]) }} style={{ padding: 8, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer' }}>
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

      {/* ── FLOATING COMPOSE ── */}
      {composing && (
        <div style={{ position: 'fixed', bottom: 0, right: 32, zIndex: 50, width: 520, background: '#fff', borderRadius: '8px 8px 0 0', boxShadow: '0 8px 10px 1px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', height: composeMin ? 48 : 520, transition: 'height 0.15s ease' }}>
          <div onClick={() => setComposeMin(!composeMin)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#404040', borderRadius: '8px 8px 0 0', cursor: 'pointer', flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#fff', fontFamily: 'inherit' }}>New Message</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={e => { e.stopPropagation(); setComposeMin(!composeMin) }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 4px' }}>
                {composeMin ? <ChevronUp style={{ width: 18, height: 18, color: '#fff' }} /> : <ChevronDown style={{ width: 18, height: 18, color: '#fff' }} />}
              </button>
              <button onClick={e => { e.stopPropagation(); setComposing(false) }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 4px' }}>
                <X style={{ width: 18, height: 18, color: '#fff' }} />
              </button>
            </div>
          </div>
          {!composeMin && (
            <>
              <div style={{ borderBottom: '1px solid #e0e0e0', padding: '0 12px' }}>
                <input autoFocus value={composeTo} onChange={e => setComposeTo(e.target.value)} placeholder="To" style={{ width: '100%', padding: '8px 0', border: 'none', outline: 'none', fontSize: 14, fontFamily: 'inherit', color: '#202124' }} />
              </div>
              <div style={{ borderBottom: '1px solid #e0e0e0', padding: '0 12px' }}>
                <input value={composeSubject} onChange={e => setComposeSubject(e.target.value)} placeholder="Subject" style={{ width: '100%', padding: '8px 0', border: 'none', outline: 'none', fontSize: 14, fontFamily: 'inherit', color: '#202124', fontWeight: 500 }} />
              </div>
              <textarea value={composeBody} onChange={e => setComposeBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendCompose() } }} placeholder="Write your message..."
                style={{ flex: 1, minHeight: 200, border: 'none', outline: 'none', padding: 12, fontSize: 14, fontFamily: 'inherit', resize: 'none', color: '#202124', lineHeight: 1.6 }} />
              {/* Attachment chips */}
              {composeAttachments.length > 0 && (
                <div style={{ padding: '6px 12px', borderTop: '1px solid #f0f0f0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {composeAttachments.map((att, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f1f3f4', borderRadius: 16, padding: '4px 10px', fontSize: 12, color: '#3c4043' }}>
                      <Paperclip style={{ width: 12, height: 12 }} />
                      <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                      <span style={{ color: '#80868b' }}>({(att.size / 1024).toFixed(0)}KB)</span>
                      <button onClick={() => removeAttachment(i)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, lineHeight: 1, marginLeft: 2 }}>
                        <X style={{ width: 12, height: 12, color: '#5f6368' }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {composeError && <p style={{ margin: '0 12px 4px', fontSize: 12, color: '#d93025' }}>{composeError}</p>}
              <div style={{ padding: '8px 12px', borderTop: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={sendCompose} disabled={composeSending || !composeTo.trim() || !composeBody.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: composeSending || !composeTo.trim() || !composeBody.trim() ? '#f1f3f4' : '#0b57d0', color: composeSending || !composeTo.trim() || !composeBody.trim() ? '#9aa0a6' : '#fff', border: 'none', borderRadius: 20, padding: '10px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {composeSending ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : null} Send
                </button>
                {/* Attach file button */}
                <button type="button" onClick={() => attachInputRef.current?.click()}
                  title="Attach files"
                  style={{ padding: 8, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Paperclip style={{ width: 18, height: 18, color: '#5f6368' }} />
                </button>
                <input ref={attachInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleAttachFiles} />
                <div style={{ marginLeft: 'auto' }}>
                  <button onClick={() => { setComposing(false); setComposeAttachments([]) }} style={{ padding: 8, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '50%' }}>
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

// ─── Internal Chat Tab ────────────────────────────────────────────────────────

const CHAT_CHANNELS = [
  { id: 'general', label: 'General', icon: '💬' },
  { id: 'operations', label: 'Operations', icon: '🚛' },
  { id: 'drivers', label: 'Drivers', icon: '🚚' },
  { id: 'finance', label: 'Finance', icon: '💰' },
  { id: 'management', label: 'Management', icon: '📊' },
]

interface ChatMessage {
  id: string
  channel: string
  sender_id: string | null
  recipient_id: string | null
  content: string
  created_at: string
  sender?: { name: string } | null
}
interface ChatStaff { id: string; name: string; role: string }

function InternalChatTab() {
  const sbRef = useRef(createClient())
  const sb = sbRef.current
  const [channel, setChannel] = useState('general')
  const [dmTarget, setDmTarget] = useState<ChatStaff | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [staff, setStaff] = useState<ChatStaff[]>([])
  const [myStaff, setMyStaff] = useState<ChatStaff | null>(null)
  const [loading, setLoading] = useState(true)
  const [sendError, setSendError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let presenceChannel: any = null
    const init = async () => {
      const { data: { user } } = await sb.auth.getUser()
      const [staffRes, myRes] = await Promise.all([
        sb.from('staff').select('id, name, role').eq('active', true).order('name'),
        user ? sb.from('staff').select('id, name, role').eq('auth_user_id', user.id).single() : Promise.resolve({ data: null }),
      ])
      let me = (myRes as any).data as ChatStaff | null
      if (!me && user) me = { id: user.id, name: user.email?.split('@')[0] ?? 'Me', role: '' }
      setStaff((staffRes.data ?? []) as ChatStaff[])
      setMyStaff(me)
      if (me) {
        presenceChannel = sb.channel('presence-comms', { config: { presence: { key: me.id } } })
        presenceChannel.subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') await presenceChannel.track({ staff_id: me!.id })
        })
      }
    }
    init()
    return () => { presenceChannel?.unsubscribe() }
  }, [])

  const loadMessages = useCallback(async () => {
    setLoading(true)
    let q = sb.from('chat_messages').select('*, sender:staff!sender_id(name)').order('created_at', { ascending: true }).limit(100)
    if (dmTarget && myStaff) {
      q = q.or(`and(sender_id.eq.${myStaff.id},recipient_id.eq.${dmTarget.id}),and(sender_id.eq.${dmTarget.id},recipient_id.eq.${myStaff.id})`)
    } else {
      q = q.eq('channel', channel).is('recipient_id', null)
    }
    const { data } = await q
    setMessages((data ?? []) as ChatMessage[])
    setLoading(false)
  }, [channel, dmTarget, myStaff])

  useEffect(() => { loadMessages() }, [loadMessages])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    const viewKey = dmTarget ? `dm-${dmTarget.id}` : `ch-${channel}`
    const sub = sb.channel(`comms-chat-${viewKey}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as ChatMessage
        const isChannelMsg = !msg.recipient_id && msg.channel === channel && !dmTarget
        const isDM = dmTarget && myStaff && ((msg.sender_id === myStaff.id && msg.recipient_id === dmTarget.id) || (msg.sender_id === dmTarget.id && msg.recipient_id === myStaff.id))
        if (isChannelMsg || isDM) {
          const senderName = [...staff, ...(myStaff ? [myStaff] : [])].find(s => s.id === msg.sender_id)?.name ?? null
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, { ...msg, sender: senderName ? { name: senderName } : null }])
        }
      })
      .subscribe()
    return () => { sub.unsubscribe() }
  }, [channel, dmTarget, myStaff, staff])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text) return
    setInput(''); setSendError(null); inputRef.current?.focus()
    const { error } = await sb.from('chat_messages').insert({ channel: dmTarget ? null : channel, sender_id: myStaff?.id ?? null, recipient_id: dmTarget?.id ?? null, content: text })
    if (error) { setSendError(error.message); setInput(text) }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso), now = new Date()
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const groupedMessages: { date: string; msgs: ChatMessage[] }[] = []
  for (const msg of messages) {
    const date = new Date(msg.created_at).toDateString()
    const last = groupedMessages[groupedMessages.length - 1]
    if (last && last.date === date) last.msgs.push(msg)
    else groupedMessages.push({ date, msgs: [msg] })
  }

  const currentTitle = dmTarget ? `DM · ${dmTarget.name}` : `#${CHAT_CHANNELS.find(c => c.id === channel)?.label ?? channel}`

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {/* Sidebar */}
      <div className="w-56 bg-slate-900 text-white flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-slate-700">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Channels</p>
          {CHAT_CHANNELS.map(ch => (
            <button key={ch.id} onClick={() => { setChannel(ch.id); setDmTarget(null) }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${!dmTarget && channel === ch.id ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
              <Hash className="w-3.5 h-3.5 flex-shrink-0" />{ch.label}
            </button>
          ))}
        </div>
        <div className="p-3 flex-1 overflow-y-auto">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Direct Messages</p>
          {staff.filter(s => s.id !== myStaff?.id).map(s => (
            <button key={s.id} onClick={() => setDmTarget(s)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${dmTarget?.id === s.id ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
              <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold flex-shrink-0">{s.name[0]}</div>
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
        <div className="border-b px-5 py-3 flex items-center gap-2">
          {dmTarget ? <User className="w-4 h-4 text-slate-400" /> : <Hash className="w-4 h-4 text-slate-400" />}
          <span className="font-semibold text-slate-800">{currentTitle}</span>
          {dmTarget && <span className="text-xs text-slate-400 ml-1">· {dmTarget.role}</span>}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? <div className="flex justify-center pt-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageSquare className="w-10 h-10 text-slate-200 mb-3" />
                <p className="font-medium text-slate-400">No messages yet</p>
                <p className="text-sm text-slate-300 mt-1">Be the first to say something in {currentTitle}</p>
              </div>
            ) : groupedMessages.map(({ date, msgs }) => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="text-xs text-slate-400 bg-white px-2">{new Date(date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
                <div className="space-y-3">
                  {msgs.map((msg, i) => {
                    const isMe = msg.sender_id === myStaff?.id
                    const showSender = i === 0 || msgs[i - 1].sender_id !== msg.sender_id
                    return (
                      <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                        {showSender && <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1 ${isMe ? 'bg-cyan-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{((msg.sender as any)?.name ?? '?')[0].toUpperCase()}</div>}
                        {!showSender && <div className="w-7 flex-shrink-0" />}
                        <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                          {showSender && <div className={`flex items-baseline gap-2 mb-0.5 ${isMe ? 'flex-row-reverse' : ''}`}><span className="text-xs font-semibold text-slate-700">{isMe ? 'You' : (msg.sender as any)?.name ?? 'Unknown'}</span><span className="text-xs text-slate-400">{formatTime(msg.created_at)}</span></div>}
                          <div className={`rounded-2xl px-4 py-2 text-sm ${isMe ? 'bg-cyan-600 text-white rounded-tr-sm' : 'bg-slate-100 text-slate-800 rounded-tl-sm'}`}>{msg.content}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          <div ref={bottomRef} />
        </div>
        <div className="border-t px-4 py-3">
          {sendError && <p className="text-xs text-red-500 mb-2 px-1">Failed to send: {sendError}</p>}
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl border px-4 py-2.5">
            <input ref={inputRef} className="flex-1 bg-transparent text-sm outline-none placeholder-slate-400" placeholder={`Message ${currentTitle}…`} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }} />
            <button onClick={sendMessage} disabled={!input.trim()} className="text-cyan-600 hover:text-cyan-700 disabled:text-slate-300 transition-colors"><Send className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 text-center">Press Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type CommTab = 'email' | 'whatsapp' | 'internal'

const COMM_TABS: { id: CommTab; label: string; icon: string }[] = [
  { id: 'email', label: 'Email', icon: '✉️' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { id: 'internal', label: 'Internal Communication', icon: '🔒' },
]

export default function CommunicationsPage() {
  const [tab, setTab] = useState<CommTab>('email')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <Topbar title="Communications" />
      {/* Tab bar */}
      <div className="bg-white border-b border-slate-200 px-6 flex-shrink-0">
        <div className="flex gap-1">
          {COMM_TABS.map(({ id, label, icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === id ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>
      {/* Content */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {tab === 'email' && <GmailTab />}
        {tab === 'whatsapp' && <WhatsAppTab />}
        {tab === 'internal' && <InternalChatTab />}
      </div>
    </div>
  )
}
