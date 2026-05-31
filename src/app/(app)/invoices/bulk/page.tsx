'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { generateMonthlyInvoice, getCustomers } from '@/lib/db'
import { idr } from '@/lib/format'
import { FileText, Loader2, CheckCircle2, XCircle, AlertCircle, Play } from 'lucide-react'
import type { Customer } from '@/types'

interface BulkResult {
  customer: Customer
  status: 'pending' | 'running' | 'done' | 'skipped' | 'error'
  message?: string
  invoiceNumber?: string
  total?: number
}

export default function BulkInvoicePage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [customers, setCustomers] = useState<Customer[]>([])
  const [results, setResults] = useState<BulkResult[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    getCustomers().then(setCustomers)
  }, [])

  const handlePreview = () => {
    setResults(customers.filter(c => c.active).map(c => ({
      customer: c, status: 'pending'
    })))
    setPreview(true)
    setDone(false)
  }

  const handleRun = async () => {
    if (!results.length) return
    setRunning(true)

    for (let i = 0; i < results.length; i++) {
      const item = results[i]
      setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'running' } : r))

      try {
        const inv = await generateMonthlyInvoice(item.customer.id, month)
        if (!inv) {
          setResults(prev => prev.map((r, idx) => idx === i
            ? { ...r, status: 'skipped', message: 'No deliveries this month' }
            : r))
        } else {
          setResults(prev => prev.map((r, idx) => idx === i
            ? { ...r, status: 'done', invoiceNumber: inv.invoice_number, total: inv.total }
            : r))
        }
      } catch (e: any) {
        setResults(prev => prev.map((r, idx) => idx === i
          ? { ...r, status: 'error', message: e.message }
          : r))
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    setRunning(false)
    setDone(true)
  }

  const generated = results.filter(r => r.status === 'done').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const errors = results.filter(r => r.status === 'error').length
  const totalRevenue = results.filter(r => r.status === 'done').reduce((s, r) => s + Number(r.total ?? 0), 0)

  const monthLabel = new Date(month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <>
      <Topbar title="Bulk Invoice Generation" />
      <div className="p-6 space-y-6 max-w-3xl">

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Generate Monthly Invoices — All Customers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-4">
              <div className="space-y-1">
                <Label>Billing Month</Label>
                <Input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setPreview(false); setDone(false) }} className="w-44" />
              </div>
              <Button variant="outline" onClick={handlePreview} disabled={running}>
                Preview ({customers.filter(c => c.active).length} customers)
              </Button>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-1 text-slate-600">
              <p>For each active customer, this will:</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-500 ml-2">
                <li>Total up all completed deliveries for <strong>{monthLabel}</strong></li>
                <li>Calculate any lost bottle charges above the 8% threshold</li>
                <li>Create a draft invoice (KW-XXXXX) in IDR</li>
                <li>Skip customers with no deliveries this month</li>
              </ul>
            </div>

            {preview && !done && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 w-full"
                onClick={handleRun}
                disabled={running}
              >
                {running ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating invoices...</>
                ) : (
                  <><Play className="w-4 h-4 mr-2" /> Run — Generate {results.length} Invoices</>
                )}
              </Button>
            )}

            {done && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-700">{generated}</div>
                  <div className="text-xs text-emerald-600">Generated</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-slate-500">{skipped}</div>
                  <div className="text-xs text-slate-400">Skipped (no deliveries)</div>
                </div>
                <div className="bg-cyan-50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-cyan-700">{idr(totalRevenue)}</div>
                  <div className="text-xs text-cyan-600">Total billed</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results list */}
        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-slate-500">
                {running ? 'Processing...' : done ? 'Completed' : 'Ready to run'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                {results.map((r) => (
                  <div key={r.customer.id} className="flex items-center gap-3 p-2.5 rounded-lg text-sm hover:bg-slate-50">
                    <div className="flex-shrink-0">
                      {r.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-slate-200" />}
                      {r.status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />}
                      {r.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      {r.status === 'skipped' && <div className="w-4 h-4 rounded-full bg-slate-200" />}
                      {r.status === 'error' && <XCircle className="w-4 h-4 text-red-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-slate-700 truncate">{r.customer.name}</span>
                      <span className="text-slate-400 ml-2 text-xs">{r.customer.city}</span>
                    </div>
                    {r.status === 'done' && (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">{r.invoiceNumber}</span>
                        <span className="font-medium text-slate-800">{idr(Number(r.total))}</span>
                      </div>
                    )}
                    {r.status === 'skipped' && <span className="text-xs text-slate-400">No deliveries</span>}
                    {r.status === 'error' && <span className="text-xs text-red-400 truncate max-w-40">{r.message}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
