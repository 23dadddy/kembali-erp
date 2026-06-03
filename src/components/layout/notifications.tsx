'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, AlertTriangle, FileText, Package, Truck, CheckCircle2, X } from 'lucide-react'

interface Notification {
  id: string
  type: 'invoice_overdue' | 'bottle_chargeable' | 'vehicle_expiry' | 'license_expiry' | 'low_stock'
  title: string
  body: string
  href?: string
  severity: 'high' | 'medium' | 'low'
}

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadNotifications()
    // Reload every 5 minutes
    const interval = setInterval(loadNotifications, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const loadNotifications = async () => {
    const sb = createClient()
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [overdueRes, bottleRes, vehicleRes, staffRes, ticketsRes, stockRes, todayDelivRes, contractsRes, pendingPayRes] = await Promise.all([
      sb.from('invoices').select('id, invoice_number, total, customer:customers(name)').eq('status', 'overdue').limit(20),
      sb.from('customer_bottle_balance').select('customer_id, chargeable_lost_350ml, chargeable_lost_750ml').filter('is_chargeable', 'eq', true).limit(20),
      sb.from('vehicles').select('id, name, plate_number, registration_expiry, insurance_expiry').or(`registration_expiry.lte.${in30Days},insurance_expiry.lte.${in30Days}`).not('registration_expiry', 'is', null),
      sb.from('staff').select('id, name, license_expiry').not('license_expiry', 'is', null).lte('license_expiry', in30Days).eq('active', true),
      sb.from('support_tickets').select('id').eq('status', 'open').limit(50),
      sb.from('inventory_items').select('id, name, quantity, reorder_point').not('reorder_point', 'is', null).gt('reorder_point', 0).limit(20),
      sb.from('deliveries').select('id, status').eq('delivery_date', todayStr),
      sb.from('contracts').select('id, title, end_date, customer:customers(name)').not('end_date', 'is', null).lte('end_date', in30Days).in('status', ['active']).limit(10),
      sb.from('payments').select('id').eq('status', 'pending_verification').limit(20),
    ])

    const items: Notification[] = []

    // Overdue invoices
    const overdue = overdueRes.data ?? []
    if (overdue.length > 0) {
      const total = overdue.reduce((s: number, i: any) => s + (i.total ?? 0), 0)
      items.push({
        id: 'overdue-invoices',
        type: 'invoice_overdue',
        severity: 'high',
        title: `${overdue.length} Overdue Invoice${overdue.length > 1 ? 's' : ''}`,
        body: `Rp ${total.toLocaleString('id-ID')} outstanding · action required`,
        href: '/invoices',
      })
    }

    // Chargeable bottle losses
    const chargeable = bottleRes.data ?? []
    if (chargeable.length > 0) {
      items.push({
        id: 'bottle-charges',
        type: 'bottle_chargeable',
        severity: 'medium',
        title: `${chargeable.length} Customer${chargeable.length > 1 ? 's' : ''} Exceed Bottle Threshold`,
        body: 'Lost bottles above 8% — charges will apply on next invoice',
        href: '/customers',
      })
    }

    // Vehicle expiries
    const vehicles = vehicleRes.data ?? []
    for (const v of vehicles) {
      if (v.registration_expiry && v.registration_expiry <= in30Days) {
        const daysLeft = Math.ceil((new Date(v.registration_expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        items.push({
          id: `vehicle-reg-${v.id}`,
          type: 'vehicle_expiry',
          severity: daysLeft <= 7 ? 'high' : 'medium',
          title: `Vehicle Registration Expiring`,
          body: `${v.name} (${v.plate_number}) — ${daysLeft <= 0 ? 'EXPIRED' : `${daysLeft} days left`}`,
          href: '/fleet',
        })
      }
      if (v.insurance_expiry && v.insurance_expiry <= in30Days) {
        const daysLeft = Math.ceil((new Date(v.insurance_expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        items.push({
          id: `vehicle-ins-${v.id}`,
          type: 'vehicle_expiry',
          severity: daysLeft <= 7 ? 'high' : 'medium',
          title: `Vehicle Insurance Expiring`,
          body: `${v.name} (${v.plate_number}) — ${daysLeft <= 0 ? 'EXPIRED' : `${daysLeft} days left`}`,
          href: '/fleet',
        })
      }
    }

    // Driver license expiries
    const expiring = staffRes.data ?? []
    for (const s of expiring) {
      const daysLeft = Math.ceil((new Date(s.license_expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      items.push({
        id: `license-${s.id}`,
        type: 'license_expiry',
        severity: daysLeft <= 7 ? 'high' : 'low',
        title: `Driver License Expiring`,
        body: `${s.name} — ${daysLeft <= 0 ? 'EXPIRED' : `${daysLeft} days left`}`,
        href: '/hr',
      })
    }

    // Open support tickets
    const openTickets = ticketsRes.data ?? []
    if (openTickets.length > 0) {
      items.push({
        id: 'open-tickets',
        type: 'low_stock',
        severity: openTickets.length >= 5 ? 'high' : 'medium',
        title: `${openTickets.length} Open Support Ticket${openTickets.length > 1 ? 's' : ''}`,
        body: 'Unresolved customer issues need attention',
        href: '/support',
      })
    }

    // Low stock procurement items
    const stockItems = stockRes.data ?? []
    const lowStock = stockItems.filter((i: any) => i.quantity <= i.reorder_point)
    if (lowStock.length > 0) {
      items.push({
        id: 'low-stock',
        type: 'low_stock',
        severity: 'medium',
        title: `${lowStock.length} Item${lowStock.length > 1 ? 's' : ''} Below Reorder Point`,
        body: lowStock.slice(0, 2).map((i: any) => i.name).join(', ') + (lowStock.length > 2 ? ` +${lowStock.length - 2} more` : ''),
        href: '/procurement',
      })
    }

    // Today's delivery progress (if deliveries exist and completion is low)
    const todayDeliveries = todayDelivRes.data ?? []
    if (todayDeliveries.length > 0) {
      const completed = todayDeliveries.filter((d: any) => d.status === 'completed').length
      const rate = Math.round((completed / todayDeliveries.length) * 100)
      if (rate < 50 && today.getHours() >= 14) {
        // Only alert in the afternoon if less than 50% done
        items.push({
          id: 'delivery-progress',
          type: 'low_stock',
          severity: 'high',
          title: `Only ${rate}% of Today's Deliveries Done`,
          body: `${completed}/${todayDeliveries.length} completed — ${todayDeliveries.length - completed} still pending`,
          href: '/trakops',
        })
      }
    }

    // Contract expiries
    const expiringContracts = contractsRes.data ?? []
    for (const c of expiringContracts) {
      const daysLeft = Math.ceil((new Date(c.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      items.push({
        id: `contract-${c.id}`,
        type: 'vehicle_expiry',
        severity: daysLeft <= 7 ? 'high' : 'medium',
        title: `Contract Expiring`,
        body: `${(c.customer as any)?.name ?? 'Unknown'} — ${c.title ?? 'Contract'} · ${daysLeft <= 0 ? 'EXPIRED' : `${daysLeft} days left`}`,
        href: '/contracts',
      })
    }

    // Pending payment verifications from customer portal
    const pendingPay = pendingPayRes.data ?? []
    if (pendingPay.length > 0) {
      items.push({
        id: 'pending-payments',
        type: 'invoice_overdue',
        severity: 'high',
        title: `${pendingPay.length} Payment${pendingPay.length > 1 ? 's' : ''} Awaiting Verification`,
        body: 'Customer payment notifications — review and mark invoices as paid',
        href: '/invoices',
      })
    }

    setNotifications(items)
    setLoading(false)
  }

  const dismiss = (id: string) => setDismissed(prev => new Set([...prev, id]))
  const visible = notifications.filter(n => !dismissed.has(n.id))
  const unread = visible.length

  const severityConfig = {
    high: { color: 'text-red-500', bg: 'bg-red-50 border-red-100', dot: 'bg-red-500' },
    medium: { color: 'text-amber-500', bg: 'bg-amber-50 border-amber-100', dot: 'bg-amber-400' },
    low: { color: 'text-blue-500', bg: 'bg-blue-50 border-blue-100', dot: 'bg-blue-400' },
  }

  const typeIcon = {
    invoice_overdue: FileText,
    bottle_chargeable: Package,
    vehicle_expiry: Truck,
    license_expiry: AlertTriangle,
    low_stock: Package,
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-4 h-4 text-slate-500" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm">Notifications</h3>
            {unread > 0 && (
              <button onClick={() => setDismissed(new Set(notifications.map(n => n.id)))}
                className="text-xs text-slate-400 hover:text-slate-600">
                Dismiss all
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {visible.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">All clear — no alerts</p>
              </div>
            ) : (
              <div className="py-1">
                {visible.map(n => {
                  const cfg = severityConfig[n.severity]
                  const Icon = typeIcon[n.type] ?? Bell
                  return (
                    <div key={n.id} className={`mx-3 my-1.5 rounded-xl border p-3 ${cfg.bg}`}>
                      <div className="flex items-start gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-white`}>
                          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 leading-tight">{n.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5 leading-tight">{n.body}</p>
                        </div>
                        <button onClick={() => dismiss(n.id)} className="text-slate-300 hover:text-slate-500 flex-shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
