'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Search, Building2, Hotel, Utensils, TreePalm, Phone, Mail, Loader2, CalendarDays } from 'lucide-react'
import { CustomerType, Customer } from '@/types'
import { getCustomers, createCustomer } from '@/lib/db'

function subscriptionDuration(startDate: string | null | undefined): string {
  if (!startDate) return '—'
  const start = new Date(startDate)
  const now = new Date()
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  if (months < 1) return '< 1 month'
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return rem > 0 ? `${years}y ${rem}m` : `${years} year${years !== 1 ? 's' : ''}`
}

const typeIcons: Record<string, React.ReactNode> = {
  hotel: <Hotel className="w-4 h-4" />,
  restaurant: <Utensils className="w-4 h-4" />,
  resort: <TreePalm className="w-4 h-4" />,
  cafe: <Building2 className="w-4 h-4" />,
  office: <Building2 className="w-4 h-4" />,
  retail: <Building2 className="w-4 h-4" />,
  business: <Building2 className="w-4 h-4" />,
  other: <Building2 className="w-4 h-4" />,
}

const typeColors: Record<string, string> = {
  hotel: 'bg-blue-100 text-blue-700',
  restaurant: 'bg-orange-100 text-orange-700',
  resort: 'bg-emerald-100 text-emerald-700',
  cafe: 'bg-amber-100 text-amber-700',
  office: 'bg-slate-100 text-slate-600',
  retail: 'bg-purple-100 text-purple-700',
  business: 'bg-purple-100 text-purple-700',
  other: 'bg-slate-100 text-slate-700',
}

interface CustomerForm {
  name: string
  type: CustomerType
  contact_name: string
  contact_email: string
  contact_phone: string
  address: string
  city: string
  notes: string
}

const emptyForm: CustomerForm = {
  name: '', type: 'hotel', contact_name: '', contact_email: '',
  contact_phone: '', address: '', city: '', notes: '',
}

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<CustomerForm>(emptyForm)
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [subStarts, setSubStarts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const sb = (await import('@/lib/supabase/client')).createClient()
      const [data, subsRes] = await Promise.all([
        getCustomers(),
        sb.from('customer_subscriptions')
          .select('customer_id, start_date')
          .eq('status', 'active')
          .order('start_date', { ascending: true }),
      ])
      setCustomers(data)
      // Keep earliest active subscription start date per customer
      const starts: Record<string, string> = {}
      for (const s of (subsRes.data ?? []) as any[]) {
        if (!starts[s.customer_id]) starts[s.customer_id] = s.start_date
      }
      setSubStarts(starts)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!form.name || !form.address || !form.city) return
    setSaving(true)
    try {
      await createCustomer({ ...form, active: true })
      setOpen(false)
      setForm(emptyForm)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const filtered = customers.filter(
    (c) =>
      (typeFilter === 'all' || c.type === typeFilter) &&
      (c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.city.toLowerCase().includes(search.toLowerCase()) ||
      c.type.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <>
      <Topbar title="Customers" />
      <div className="p-6 space-y-4">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            {error}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search customers..."
                className="pl-8 w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? 'all')}>
              <SelectTrigger className="w-36"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="hotel">Hotel</SelectItem>
                <SelectItem value="restaurant">Restaurant</SelectItem>
                <SelectItem value="resort">Resort</SelectItem>
                <SelectItem value="cafe">Cafe</SelectItem>
                <SelectItem value="office">Office</SelectItem>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className="inline-flex items-center gap-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium px-4 py-2 transition-colors">
              <Plus className="w-4 h-4" />
              Add Customer
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>New Customer</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label>Business Name *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. The Mulia Resort"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Type *</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: (v ?? 'hotel') as CustomerType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hotel">Hotel</SelectItem>
                        <SelectItem value="restaurant">Restaurant</SelectItem>
                        <SelectItem value="resort">Resort</SelectItem>
                        <SelectItem value="cafe">Cafe</SelectItem>
                        <SelectItem value="office">Office</SelectItem>
                        <SelectItem value="retail">Retail</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>City *</Label>
                    <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Nusa Dua" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Address *</Label>
                    <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address" />
                  </div>
                  <div className="space-y-1">
                    <Label>Contact Name</Label>
                    <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Contact Phone</Label>
                    <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Contact Email</Label>
                    <Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Notes</Label>
                    <Textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      rows={2}
                      placeholder="Delivery instructions, preferences, etc."
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button
                    className="bg-cyan-600 hover:bg-cyan-700"
                    onClick={handleSave}
                    disabled={saving || !form.name || !form.address || !form.city}
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Save Customer
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-white rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <CalendarDays className="w-3.5 h-3.5" /> Sub Duration
                  </div>
                </TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Building2 className="w-8 h-8 text-slate-200" />
                      <p className="font-medium">{search ? 'No results found' : 'No customers yet'}</p>
                      <p className="text-sm">Add your first customer to get started</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => router.push(`/customers/${c.id}`)}>
                    <TableCell>
                      <div className="font-medium text-slate-800">{c.name}</div>
                      {c.notes && <div className="text-xs text-slate-400 truncate max-w-48">{c.notes}</div>}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${typeColors[c.type]}`}>
                        {typeIcons[c.type]}
                        {c.type.charAt(0).toUpperCase() + c.type.slice(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600">{c.city}</TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        {c.contact_name && <div className="text-sm">{c.contact_name}</div>}
                        {c.contact_phone && (
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {c.contact_phone}
                          </div>
                        )}
                        {c.contact_email && (
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {c.contact_email}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {subStarts[c.id] ? (
                        <div>
                          <div className="font-medium text-slate-700">{subscriptionDuration(subStarts[c.id])}</div>
                          <div className="text-xs text-slate-400">since {new Date(subStarts[c.id]).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</div>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">No subscription</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>
                        {c.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {!loading && filtered.length > 0 && (
          <p className="text-xs text-slate-400">{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</p>
        )}
      </div>
    </>
  )
}
