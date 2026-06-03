'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Send, Sparkles, User, Bot, ArrowRight, Zap } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  action?: string | null
}

const SUGGESTIONS = [
  "Which customers haven't paid their invoices?",
  "Who are my top 5 customers by revenue this month?",
  "What's my total revenue this month vs last month?",
  "Which customers have exceeded the 8% lost bottle threshold?",
  "How many deliveries were completed today?",
  "Show me all overdue invoices and their amounts",
  "What's the bottle recovery rate this month?",
  "Which staff have the most deliveries this month?",
  "Are there any open support tickets I should know about?",
  "Which customers haven't had a delivery in 30+ days?",
  "What's my total accounts receivable?",
  "Which subscriptions are due for renewal soon?",
]

function formatMessage(text: string) {
  // Convert markdown-ish to styled HTML
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (line.startsWith('## ')) return <h3 key={i} className="font-bold text-slate-800 text-base mt-3 mb-1">{line.slice(3)}</h3>
    if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-slate-800 text-lg mt-3 mb-1">{line.slice(2)}</h2>
    if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-bold text-slate-800">{line.slice(2, -2)}</p>
    if (line.startsWith('- ') || line.startsWith('• ')) return <li key={i} className="ml-4 text-slate-700">{line.slice(2)}</li>
    if (line.match(/^\d+\./)) return <li key={i} className="ml-4 text-slate-700">{line}</li>
    if (line.trim() === '') return <br key={i} />
    // Bold inline **text**
    const parts = line.split(/\*\*(.*?)\*\*/g)
    if (parts.length > 1) {
      return (
        <p key={i} className="text-slate-700">
          {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
        </p>
      )
    }
    return <p key={i} className="text-slate-700">{line}</p>
  })
}

export default function AIPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I'm your AI Command Center. I have live access to all your business data — customers, deliveries, invoices, inventory, staff, and more.\n\nAsk me anything about your business, or use a suggestion below to get started.",
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const history = messages.slice(-10) // last 10 for context
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.response, action: data.action }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Topbar title="AI Command Center" />
      <div className="flex flex-col h-[calc(100vh-57px)]">

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-cyan-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
              )}
              <div className={`max-w-2xl rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-cyan-600 text-white rounded-tr-sm'
                  : 'bg-white border border-slate-100 shadow-sm rounded-tl-sm'
              }`}>
                {msg.role === 'user' ? (
                  <p className="text-sm">{msg.content}</p>
                ) : (
                  <div className="text-sm space-y-0.5">{formatMessage(msg.content)}</div>
                )}
                {msg.action && (
                  <button
                    onClick={() => router.push(msg.action!)}
                    className="mt-3 flex items-center gap-1.5 text-xs bg-cyan-50 hover:bg-cyan-100 text-cyan-700 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <ArrowRight className="w-3 h-3" /> Go to {msg.action}
                  </button>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-slate-500" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-xl bg-cyan-500 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white border border-slate-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div className="px-6 pb-3">
            <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><Zap className="w-3 h-3" />Quick questions</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs bg-slate-100 hover:bg-cyan-50 hover:text-cyan-700 hover:border-cyan-200 text-slate-600 px-3 py-1.5 rounded-full border border-slate-200 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-slate-200 bg-white px-6 py-4">
          <div className="flex gap-3 max-w-4xl mx-auto">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
              placeholder="Ask anything about your business..."
              className="flex-1"
              disabled={loading}
            />
            <Button
              className="bg-cyan-600 hover:bg-cyan-700 px-4"
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-slate-400 text-center mt-2">AI has live access to all your business data</p>
        </div>
      </div>
    </>
  )
}
