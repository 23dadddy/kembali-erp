'use client'

import { useState, useEffect, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Package, ArrowRight, Loader2, Plus, Edit2 } from 'lucide-react'
import { BottleInventory, BottleSize, BottleStatus } from '@/types'
import { getInventory, setInventoryQty } from '@/lib/db'

const inventoryConfig: { status: BottleStatus; label: string; description: string; color: string; dot: string }[] = [
  { status: 'filled', label: 'Filled & Ready', description: 'Sealed, ready to deliver', color: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  { status: 'at_customer', label: 'At Customer Sites', description: 'Currently with customers', color: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  { status: 'dirty', label: 'Dirty (Awaiting Clean)', description: 'Collected empties, not yet cleaned', color: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  { status: 'cleaning', label: 'In Cleaning', description: 'Currently being washed/sanitized', color: 'bg-purple-50 border-purple-200', dot: 'bg-purple-500' },
  { status: 'clean_empty', label: 'Clean & Empty', description: 'Ready to fill', color: 'bg-slate-50 border-slate-200', dot: 'bg-slate-400' },
  { status: 'damaged', label: 'Damaged / Lost', description: 'Broken or unaccounted for', color: 'bg-red-50 border-red-200', dot: 'bg-red-400' },
]

const lifecycle = ['Clean & Empty', 'Filled', 'Delivered', 'At Customer', 'Collected Dirty', 'Cleaned']

export default function InventoryPage() {
  const [inventory, setInventory] = useState<BottleInventory[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState<BottleInventory | null>(null)
  const [editQty, setEditQty] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setInventory(await getInventory()) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const getQty = (status: BottleStatus, size: BottleSize) =>
    inventory.find((r) => r.status === status && r.bottle_size === size)?.quantity ?? 0

  const getRow = (status: BottleStatus, size: BottleSize) =>
    inventory.find((r) => r.status === status && r.bottle_size === size)

  const total350 = inventory.filter((r) => r.bottle_size === '350ml').reduce((s, r) => s + r.quantity, 0)
  const total750 = inventory.filter((r) => r.bottle_size === '750ml').reduce((s, r) => s + r.quantity, 0)

  const openEdit = (row: BottleInventory) => {
    setEditRow(row)
    setEditQty(String(row.quantity))
    setEditOpen(true)
  }

  const handleSave = async () => {
    if (!editRow) return
    setSaving(true)
    try {
      await setInventoryQty(editRow.id, parseInt(editQty) || 0)
      setEditOpen(false)
      await load()
    } finally { setSaving(false) }
  }

  return (
    <>
      <Topbar title="Inventory — Bottle Lifecycle" />
      <div className="p-6 space-y-6">
        {/* Lifecycle flow */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Bottle Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 flex-wrap">
              {lifecycle.map((label, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="px-3 py-1.5 bg-cyan-50 text-cyan-700 text-xs font-medium rounded-full border border-cyan-200">{label}</span>
                  {i < lifecycle.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300" />}
                </div>
              ))}
              <ArrowRight className="w-3 h-3 text-slate-300" />
              <span className="px-3 py-1.5 bg-cyan-50 text-cyan-700 text-xs font-medium rounded-full border border-cyan-200 border-dashed">Back to Start ↺</span>
            </div>
          </CardContent>
        </Card>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total 350ml</p>
                  <p className="text-3xl font-bold mt-1">{loading ? '—' : total350}</p>
                </div>
                <Package className="w-8 h-8 text-slate-200" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total 750ml</p>
                  <p className="text-3xl font-bold mt-1">{loading ? '—' : total750}</p>
                </div>
                <Package className="w-8 h-8 text-slate-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Inventory rows */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">Inventory by Status</h2>
            <p className="text-xs text-slate-400">Click a count to adjust</p>
          </div>
          {loading ? (
            <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
          ) : (
            <div className="grid gap-3">
              {inventoryConfig.map(({ status, label, description, color, dot }) => (
                <div key={status} className={`flex items-center gap-4 p-4 rounded-xl border ${color}`}>
                  <div className={`w-3 h-3 rounded-full ${dot} flex-shrink-0`} />
                  <div className="flex-1">
                    <p className="font-medium text-sm text-slate-800">{label}</p>
                    <p className="text-xs text-slate-500">{description}</p>
                  </div>
                  <div className="flex gap-4 text-sm">
                    {(['350ml', '750ml'] as BottleSize[]).map((size) => {
                      const row = getRow(status, size)
                      return (
                        <button
                          key={size}
                          onClick={() => row && openEdit(row)}
                          className="text-center group hover:bg-white/60 rounded-lg px-2 py-1 transition-colors"
                        >
                          <div className="font-bold text-slate-800 group-hover:text-cyan-600 flex items-center gap-1">
                            {getQty(status, size)}
                            <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="text-xs text-slate-400">{size}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Adjust Inventory</DialogTitle>
            </DialogHeader>
            {editRow && (
              <div className="space-y-4 py-2">
                <div className="text-sm text-slate-500">
                  Setting <strong>{editRow.bottle_size}</strong> — <strong>{inventoryConfig.find(c => c.status === editRow.status)?.label}</strong>
                </div>
                <div className="space-y-1">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                  <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Save
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
