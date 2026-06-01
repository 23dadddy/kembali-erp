'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, Users, FileText, Truck, Package, X, Loader2 } from 'lucide-react'

interface SearchResult {
  id: string
  type: 'customer' | 'invoice' | 'delivery' | 'staff'
  title: string
  subtitle: string
  href: string
}

const TYPE_CONFIG = {
  customer: { icon: Users, color: 'text-cyan-500', bg: 'bg-cyan-50' },
  invoice: { icon: FileText, color: 'text-amber-500', bg: 'bg-amber-50' },
  delivery: { icon: Truck, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  staff: { icon: Package, color: 'text-violet-500', bg: 'bg-violet-50' },
}

export function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    const sb = createClient()
    const like = `%${q}%`

    const [customersRes, invoicesRes, staffRes, ticketsRes, leadsRes] = await Promise.all([
      sb.from('customers').select('id, name, city, type').or(`name.ilike.${like},contact_email.ilike.${like},contact_name.ilike.${like}`).limit(5),
      sb.from('invoices').select('id, invoice_number, total, status').ilike('invoice_number', like).limit(4),
      sb.from('staff').select('id, name, role').ilike('name', like).eq('active', true).limit(3),
      sb.from('support_tickets').select('id, subject, status').ilike('subject', like).limit(3),
      sb.from('leads').select('id, name, status, city').ilike('name', like).limit(3),
    ])

    const all: SearchResult[] = [
      ...(customersRes.data ?? []).map((c: any) => ({
        id: c.id, type: 'customer' as const,
        title: c.name,
        subtitle: `${c.type} · ${c.city}`,
        href: `/customers/${c.id}`,
      })),
      ...(invoicesRes.data ?? []).map((i: any) => ({
        id: i.id, type: 'invoice' as const,
        title: i.invoice_number,
        subtitle: `Rp ${(i.total ?? 0).toLocaleString('id-ID')} · ${i.status}`,
        href: `/invoices/${i.id}`,
      })),
      ...(staffRes.data ?? []).map((s: any) => ({
        id: s.id, type: 'staff' as const,
        title: s.name,
        subtitle: s.role,
        href: `/hr`,
      })),
      ...(ticketsRes.data ?? []).map((t: any) => ({
        id: t.id, type: 'delivery' as const,
        title: t.subject,
        subtitle: `Support · ${t.status}`,
        href: `/support`,
      })),
      ...(leadsRes.data ?? []).map((l: any) => ({
        id: l.id, type: 'customer' as const,
        title: l.name,
        subtitle: `Lead · ${l.status}${l.city ? ` · ${l.city}` : ''}`,
        href: `/crm`,
      })),
    ]

    setResults(all)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query) {
      debounceRef.current = setTimeout(() => search(query), 250)
    } else {
      setResults([])
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const navigate = (href: string) => {
    router.push(href)
    setOpen(false)
    setQuery('')
    setResults([])
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search... ⌘K"
          className="pl-8 pr-8 w-64 h-8 text-sm bg-slate-100 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:bg-white placeholder:text-slate-400 transition-all"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]) }} className="absolute right-2 top-1/2 -translate-y-1/2">
            <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
          </button>
        )}
      </div>

      {open && (query.length >= 2) && (
        <div className="absolute top-full mt-2 left-0 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
            </div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">No results for "{query}"</div>
          ) : (
            <div className="py-1">
              {results.map(result => {
                const cfg = TYPE_CONFIG[result.type]
                const Icon = cfg.icon
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => navigate(result.href)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{result.title}</p>
                      <p className="text-xs text-slate-400 truncate capitalize">{result.subtitle}</p>
                    </div>
                    <span className="text-xs text-slate-300 capitalize flex-shrink-0">{result.type}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
