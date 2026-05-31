'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import {
  Upload, FileText, CheckCircle2, XCircle,
  Loader2, Download, ChevronLeft
} from 'lucide-react'
import Papa from 'papaparse'

interface ParsedRow {
  name: string
  type: string
  city: string
  address: string
  contact_name?: string
  contact_phone?: string
  contact_email?: string
  notes?: string
  status: 'ready' | 'importing' | 'done' | 'error'
  error?: string
}

const VALID_TYPES = ['hotel', 'restaurant', 'resort', 'business', 'other']

export default function ImportCustomersPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)

  const handleFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const parsed: ParsedRow[] = (result.data as any[]).map((row) => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          name: (row.name || row.Name || '').trim(),
          type: (row.type || row.Type || 'business').toLowerCase().trim(),
          city: (row.city || row.City || '').trim(),
          address: (row.address || row.Address || '').trim(),
          contact_name: (row.contact_name || row['Contact Name'] || '').trim() || undefined,
          contact_phone: (row.contact_phone || row['Phone'] || '').trim() || undefined,
          contact_email: (row.contact_email || row['Email'] || '').trim() || undefined,
          notes: (row.notes || row.Notes || '').trim() || undefined,
          status: 'ready' as const,
        })).filter(r => r.name && r.city && r.address).map(r => ({
          ...r,
          type: VALID_TYPES.includes(r.type) ? r.type : 'business',
        }))
        setRows(parsed)
        setDone(false)
      }
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv')) handleFile(file)
  }

  const handleImport = async () => {
    setImporting(true)
    const sb = createClient()

    for (let i = 0; i < rows.length; i++) {
      setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'importing' } : r))
      const row = rows[i]
      try {
        await sb.from('customers').insert({
          name: row.name, type: row.type, city: row.city, address: row.address,
          contact_name: row.contact_name ?? null, contact_phone: row.contact_phone ?? null,
          contact_email: row.contact_email ?? null, notes: row.notes ?? null, active: true,
        })
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'done' } : r))
      } catch (e: any) {
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', error: e.message } : r))
      }
      await new Promise(r => setTimeout(r, 80))
    }

    setImporting(false)
    setDone(true)
  }

  const downloadTemplate = () => {
    const csv = 'name,type,city,address,contact_name,contact_phone,contact_email,notes\nThe Mulia Resort,resort,Nusa Dua,Kawasan ITDC Lot N5 Nusa Dua,Budi Santoso,+62811234567,budi@mulia.com,Deliver to loading dock\nSeminyak Kitchen,restaurant,Seminyak,Jl. Kayu Aya No.1 Seminyak,,,,'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'kembali_customers_template.csv'; a.click()
  }

  const doneCount = rows.filter(r => r.status === 'done').length
  const errorCount = rows.filter(r => r.status === 'error').length

  return (
    <>
      <Topbar title="Import Customers" />
      <div className="p-6 space-y-6 max-w-3xl">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm">
          <ChevronLeft className="w-4 h-4" /> Back to Customers
        </button>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="w-4 h-4" /> CSV Customer Import
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">Upload a CSV with your customer list. Required columns: <code className="bg-slate-100 px-1 rounded text-xs">name, type, city, address</code></p>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="w-4 h-4 mr-2" /> Template
              </Button>
            </div>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-cyan-400 hover:bg-cyan-50/30 transition-colors"
            >
              <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-500">Drop CSV here or click to upload</p>
              <p className="text-xs text-slate-400 mt-1">Supports .csv files</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </div>

            {rows.length > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  <strong>{rows.length}</strong> customers ready to import
                  {done && <> — <span className="text-emerald-600">{doneCount} imported</span>{errorCount > 0 && <>, <span className="text-red-500">{errorCount} errors</span></>}</>}
                </p>
                {!done && (
                  <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleImport} disabled={importing}>
                    {importing ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Importing...</> : `Import ${rows.length} Customers`}
                  </Button>
                )}
                {done && (
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => router.push('/customers')}>
                    View Customers →
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <div className="max-h-[500px] overflow-y-auto space-y-1">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 text-sm">
                    <div className="flex-shrink-0">
                      {r.status === 'ready' && <div className="w-4 h-4 rounded-full border-2 border-slate-200" />}
                      {r.status === 'importing' && <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />}
                      {r.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      {r.status === 'error' && <XCircle className="w-4 h-4 text-red-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-slate-700">{r.name}</span>
                      <span className="text-slate-400 ml-2 text-xs">{r.city}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      r.type === 'hotel' ? 'bg-blue-100 text-blue-600' :
                      r.type === 'restaurant' ? 'bg-orange-100 text-orange-600' :
                      r.type === 'resort' ? 'bg-emerald-100 text-emerald-600' :
                      'bg-slate-100 text-slate-500'
                    }`}>{r.type}</span>
                    {r.status === 'error' && <span className="text-xs text-red-400">{r.error}</span>}
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
