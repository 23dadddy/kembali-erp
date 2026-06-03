'use client'

import { useState, useEffect, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/client'
import { idr } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Package, Loader2, ChevronRight, Check, Mail } from 'lucide-react'
import { SkeletonRows } from '@/components/ui/skeleton-rows'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700',
  received: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-500',
}

interface POItem { description: string; quantity: number; unit: string; unit_price: number }
const emptyItem = (): POItem => ({ description: '', quantity: 1, unit: 'unit', unit_price: 0 })

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<any | null>(null)
  const [form, setForm] = useState({ vendor_name: '', vendor_contact: '', vendor_email: '', expected_date: '', notes: '' })
  const [items, setItems] = useState<POItem[]>([emptyItem()])
  const [saving, setSaving] = useState(false)
  const [sendingPO, setSendingPO] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb.from('purchase_orders').select('*, items:po_items(*)').order('created_at', { ascending: false })
    setOrders(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const tax = Math.round(subtotal * 0.11)

  const handleSave = async () => {
    if (!form.vendor_name || items.every(i => !i.description)) return
    setSaving(true); setOpen(false)
    const sb = createClient()
    const { data: last } = await sb.from('purchase_orders').select('po_number').order('po_number', { ascending: false }).limit(1).single()
    const lastNum = last?.po_number ? parseInt(last.po_number.replace('PO-', ''), 10) : 0
    const po_number = `PO-${String(lastNum + 1).padStart(5, '0')}`
    const { data: po } = await sb.from('purchase_orders').insert({
      ...form, po_number,
      subtotal, tax_amount: tax, total: subtotal + tax,
      expected_date: form.expected_date || null,
    }).select().single()
    if (po) {
      await sb.from('po_items').insert(items.filter(i => i.description).map(i => ({ ...i, po_id: po.id })))
      setOrders(prev => [{ ...po, items: [] }, ...prev])
    }
    setForm({ vendor_name: '', vendor_contact: '', vendor_email: '', expected_date: '', notes: '' })
    setItems([emptyItem()])
    setSaving(false)
  }

  const sendPOToVendor = async (o: any) => {
    if (!o.vendor_email) { alert('No vendor email on file for this PO'); return }
    setSendingPO(o.id)
    const sb = createClient()
    const { data: poItems } = await sb.from('po_items').select('*').eq('po_id', o.id)
    await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'purchase_order', payload: {
        id: o.id, po_number: o.po_number, total: Number(o.total),
        expected_date: o.expected_date, notes: o.notes,
        vendor: { name: o.vendor_name, email: o.vendor_email, contact: o.vendor_contact },
        items: (poItems ?? []).map((i: any) => ({ ...i, total: Number(i.quantity) * Number(i.unit_price) })),
        subtotal: Number(o.subtotal ?? 0), tax_amount: Number(o.tax_amount ?? 0),
      } }),
    })
    // If still draft, move to sent
    if (o.status === 'draft') await updateStatus(o.id, 'sent')
    setSendingPO(null)
    alert(`PO ${o.po_number} sent to ${o.vendor_email}`)
  }

  const updateStatus = async (id: string, status: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
    const sb = createClient()
    const extra = status === 'received' ? { received_date: new Date().toISOString().split('T')[0] } : {}
    await sb.from('purchase_orders').update({ status, ...extra, updated_at: new Date().toISOString() }).eq('id', id)

    // When marked received, update inventory_items quantities from PO line items
    if (status === 'received') {
      const { data: items } = await sb.from('po_items').select('*').eq('po_id', id)
      for (const item of (items ?? [])) {
        // Try to match by description (case-insensitive partial match)
        const { data: invItem } = await sb.from('inventory_items').select('id, quantity').ilike('name', `%${item.description.split(' ')[0]}%`).limit(1).single()
        if (invItem) {
          await sb.from('inventory_items').update({
            quantity: (invItem.quantity ?? 0) + Number(item.quantity ?? 0),
            updated_at: new Date().toISOString(),
          }).eq('id', invItem.id)
        }
      }
    }
  }

  const totalDraft = orders.filter(o => o.status === 'draft').reduce((s, o) => s + Number(o.total), 0)
  const totalPending = orders.filter(o => o.status === 'sent').reduce((s, o) => s + Number(o.total), 0)

  return (
    <>
      <Topbar title="Purchase Orders" />
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Draft', value: orders.filter(o=>o.status==='draft').length, sub: idr(totalDraft), color: 'text-slate-600' },
            { label: 'Sent / Pending', value: orders.filter(o=>o.status==='sent').length, sub: idr(totalPending), color: 'text-blue-600' },
            { label: 'Received', value: orders.filter(o=>o.status==='received').length, sub: '', color: 'text-emerald-600' },
            { label: 'Total Orders', value: orders.length, sub: '', color: 'text-slate-700' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-white rounded-xl border p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Purchase Order
          </Button>
        </div>

        <div className="bg-white rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>PO #</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <SkeletonRows cols={7} rows={5} /> : orders.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-slate-400">
                  <Package className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                  No purchase orders yet
                </TableCell></TableRow>
              ) : orders.map(o => (
                <TableRow key={o.id} className="hover:bg-slate-50">
                  <TableCell className="font-mono font-medium">{o.po_number}</TableCell>
                  <TableCell>
                    <p className="font-medium text-slate-700">{o.vendor_name}</p>
                    {o.vendor_contact && <p className="text-xs text-slate-400">{o.vendor_contact}</p>}
                  </TableCell>
                  <TableCell className="text-slate-500">{o.order_date}</TableCell>
                  <TableCell className="text-slate-500">{o.expected_date ?? '—'}</TableCell>
                  <TableCell className="font-medium">{idr(Number(o.total))}</TableCell>
                  <TableCell><Badge className={STATUS_COLORS[o.status]}>{o.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {(o.status === 'draft' || o.status === 'sent') && o.vendor_email && (
                        <button onClick={() => sendPOToVendor(o)} disabled={sendingPO === o.id}
                          className="text-xs bg-violet-50 hover:bg-violet-100 text-violet-700 font-medium px-2 py-1 rounded-lg flex items-center gap-1">
                          {sendingPO === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}Email PO
                        </button>
                      )}
                      {o.status === 'draft' && (
                        <button onClick={() => updateStatus(o.id, 'sent')}
                          className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium px-2 py-1 rounded-lg">Send</button>
                      )}
                      {o.status === 'sent' && (
                        <button onClick={() => updateStatus(o.id, 'received')}
                          className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium px-2 py-1 rounded-lg flex items-center gap-1">
                          <Check className="w-3 h-3" />Received
                        </button>
                      )}
                      {['draft','sent'].includes(o.status) && (
                        <button onClick={() => updateStatus(o.id, 'cancelled')}
                          className="text-xs text-slate-400 hover:text-red-500 px-2 py-1 rounded-lg">Cancel</button>
                      )}
                      <button onClick={() => setSelected(o)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg">
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* New PO Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Vendor Name *</Label><Input value={form.vendor_name} onChange={e => setForm({...form, vendor_name: e.target.value})} placeholder="e.g. CV Bali Packaging" /></div>
              <div><Label>Contact Person</Label><Input value={form.vendor_contact} onChange={e => setForm({...form, vendor_contact: e.target.value})} /></div>
              <div><Label>Email</Label><Input type="email" value={form.vendor_email} onChange={e => setForm({...form, vendor_email: e.target.value})} /></div>
              <div><Label>Expected Delivery</Label><Input type="date" value={form.expected_date} onChange={e => setForm({...form, expected_date: e.target.value})} /></div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Items *</Label>
                <button onClick={() => setItems(prev => [...prev, emptyItem()])}
                  className="text-xs text-cyan-600 hover:text-cyan-700 flex items-center gap-1 font-medium">
                  <Plus className="w-3 h-3" /> Add Item
                </button>
              </div>
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5"><Input placeholder="Description" value={item.description} onChange={e => setItems(prev => prev.map((x,j) => j===i ? {...x, description: e.target.value} : x))} /></div>
                    <div className="col-span-2"><Input type="number" min="0.01" step="0.01" placeholder="Qty" value={item.quantity} onChange={e => setItems(prev => prev.map((x,j) => j===i ? {...x, quantity: parseFloat(e.target.value)||0} : x))} /></div>
                    <div className="col-span-2"><Input placeholder="Unit" value={item.unit} onChange={e => setItems(prev => prev.map((x,j) => j===i ? {...x, unit: e.target.value} : x))} /></div>
                    <div className="col-span-2"><Input type="number" min="0" placeholder="Price" value={item.unit_price} onChange={e => setItems(prev => prev.map((x,j) => j===i ? {...x, unit_price: parseFloat(e.target.value)||0} : x))} /></div>
                    <button onClick={() => setItems(prev => prev.filter((_,j) => j!==i))} className="col-span-1 text-slate-300 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>

            {subtotal > 0 && (
              <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1 text-right">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{idr(subtotal)}</span></div>
                <div className="flex justify-between text-slate-500"><span>PPN 11%</span><span>{idr(tax)}</span></div>
                <div className="flex justify-between font-bold text-slate-800 pt-1 border-t border-slate-200"><span>Total</span><span>{idr(subtotal + tax)}</span></div>
              </div>
            )}

            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSave} disabled={saving || !form.vendor_name}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Create PO
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PO Detail Dialog */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{selected.po_number} — {selected.vendor_name}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-400">Status</span><p className="font-medium capitalize">{selected.status}</p></div>
                <div><span className="text-slate-400">Order Date</span><p className="font-medium">{selected.order_date}</p></div>
                {selected.expected_date && <div><span className="text-slate-400">Expected</span><p className="font-medium">{selected.expected_date}</p></div>}
                {selected.received_date && <div><span className="text-slate-400">Received</span><p className="font-medium">{selected.received_date}</p></div>}
              </div>
              {selected.items?.length > 0 && (
                <Table>
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit Price</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {selected.items.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
                        <TableCell className="text-right">{idr(Number(item.unit_price))}</TableCell>
                        <TableCell className="text-right font-medium">{idr(Number(item.total))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="text-right text-sm space-y-0.5">
                <p className="text-slate-500">Subtotal: {idr(Number(selected.subtotal))}</p>
                <p className="text-slate-500">PPN 11%: {idr(Number(selected.tax_amount))}</p>
                <p className="font-bold text-slate-800">Total: {idr(Number(selected.total))}</p>
              </div>
              {selected.notes && <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3">{selected.notes}</p>}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
