'use client'

import { useState, useRef, useEffect } from 'react'
import { Sparkles, X, Send, Loader2, MessageSquare } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function FloatingAI() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      bottomRef.current?.scrollIntoView()
    }
  }, [open, messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const newMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setLoading(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply ?? data.message ?? 'No response' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error connecting to AI. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        style={{ background: 'linear-gradient(135deg, #0EA5A4 0%, #6366F1 100%)' }}
        title="AI Command Center"
      >
        {open ? <X className="w-6 h-6 text-white" /> : <Sparkles className="w-6 h-6 text-white" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-96 rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          style={{ height: '520px', background: '#0F172A' }}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3"
            style={{ background: 'linear-gradient(135deg, #0EA5A4 0%, #6366F1 100%)' }}>
            <Sparkles className="w-5 h-5 text-white flex-shrink-0" />
            <div>
              <p className="text-white font-semibold text-sm">AI Command Center</p>
              <p className="text-white/70 text-xs">Ask anything about your business</p>
            </div>
            <button onClick={() => setOpen(false)} className="ml-auto text-white/70 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <Sparkles className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-medium">How can I help today?</p>
                <div className="mt-4 space-y-2">
                  {[
                    'Show me today\'s delivery summary',
                    'Which invoices are overdue?',
                    'How much revenue this month?',
                  ].map(hint => (
                    <button key={hint} onClick={() => { setInput(hint) }}
                      className="block w-full text-left text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2 transition-colors">
                      {hint}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-cyan-500 text-white rounded-br-sm'
                    : 'bg-slate-800 text-slate-200 rounded-bl-sm'
                }`}>
                  {m.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles className="w-3 h-3 text-cyan-400" />
                      <span className="text-xs text-cyan-400 font-medium">AI</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-800 flex items-center gap-2" style={{ background: '#1E293B' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask anything..."
              className="flex-1 bg-slate-900 text-white text-sm rounded-xl px-3 py-2 placeholder:text-slate-500 outline-none border border-slate-700 focus:border-cyan-500 transition-colors"
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40"
              style={{ background: '#0EA5A4' }}
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
