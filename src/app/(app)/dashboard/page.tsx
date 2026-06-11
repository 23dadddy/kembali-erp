export const dynamic = 'force-dynamic'
export const revalidate = 0

import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/server'
import type { BottleInventory } from '@/types'
import { DashboardClient } from './dashboard-client'

export default async function DashboardPage() {
  const sb = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const now = new Date()
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30)
  const monthStart = thirtyDaysAgo.toISOString().split('T')[0]
  const monthEnd = today
  const currentPeriod = now.toISOString().slice(0, 7)

  const [
    customersRes, deliveriesRes, inventoryRes, invoicesRes, todayDeliveriesRes,
    overdueRes, monthInvoicesRes, vehiclesRes, staffRes, bottleAlertRes, kpiRes,
    monthDeliveriesRes, newCustomersRes,
  ] = await Promise.all([
    sb.from('customers').select('*', { count: 'exact', head: true }).eq('active', true),
    sb.from('deliveries').select('*', { count: 'exact', head: true }).eq('delivery_date', today),
    sb.from('bottle_inventory').select('*'),
    sb.from('invoices').select('*', { count: 'exact', head: true }).in('status', ['sent', 'overdue']),
    sb.from('deliveries').select('*, customer:customers(name, city)').eq('delivery_date', today).order('created_at').limit(8),
    sb.from('invoices').select('total, due_date, customer:customers(name)').eq('status', 'overdue').order('due_date'),
    sb.from('payments').select('amount').gte('payment_date', monthStart).lte('payment_date', monthEnd),
    sb.from('vehicles').select('status, registration_expiry, insurance_expiry, name, plate_number'),
    sb.from('staff').select('role, active, license_expiry, name').eq('active', true),
    sb.from('customer_bottle_balance').select('*').gt('chargeable_lost_350ml', 0).limit(5),
    sb.from('kpi_targets').select('*').eq('period', currentPeriod),
    sb.from('deliveries').select('*', { count: 'exact', head: true }).gte('delivery_date', monthStart).lte('delivery_date', monthEnd).eq('status', 'completed'),
    sb.from('customers').select('*', { count: 'exact', head: true }).gte('created_at', `${monthStart}-01`),
  ])

  const inventory = (inventoryRes.data ?? []) as BottleInventory[]
  const bottlesAtCustomer = inventory.filter(r => r.status === 'at_customer').reduce((s, r) => s + r.quantity, 0)
  const bottlesFilled = inventory.filter(r => r.status === 'filled').reduce((s, r) => s + r.quantity, 0)

  const monthRevenue = (monthInvoicesRes.data ?? []).reduce((s: number, i: any) => s + Number(i.amount), 0)
  const overdueTotal = (overdueRes.data ?? []).reduce((s: number, i: any) => s + Number(i.total), 0)

  const vehicles = (vehiclesRes.data ?? []) as any[]
  const activeVehicles = vehicles.filter(v => v.status === 'active').length
  const maintVehicles = vehicles.filter(v => v.status === 'maintenance').length

  const staff = (staffRes.data ?? []) as any[]
  const drivers = staff.filter(s => s.role === 'driver').length

  const thirtyDays = new Date(); thirtyDays.setDate(thirtyDays.getDate() + 30)
  const expiringDocs = vehicles.filter(v =>
    (v.registration_expiry && new Date(v.registration_expiry) < thirtyDays) ||
    (v.insurance_expiry && new Date(v.insurance_expiry) < thirtyDays)
  )
  const expiringLicenses = staff.filter(s => s.role === 'driver' && s.license_expiry && new Date(s.license_expiry) < thirtyDays)
  const bottleAlerts = (bottleAlertRes.data ?? []) as any[]

  const kpiTargets: Record<string, number> = {}
  for (const k of (kpiRes.data ?? [])) kpiTargets[k.metric] = Number(k.target)

  const monthDeliveries = monthDeliveriesRes.count ?? 0
  const newCustomers = newCustomersRes.count ?? 0

  const invMap: Record<string, { qty_350: number; qty_750: number }> = {}
  for (const row of inventory) {
    if (!invMap[row.status]) invMap[row.status] = { qty_350: 0, qty_750: 0 }
    if (row.bottle_size === '350ml') invMap[row.status].qty_350 = row.quantity
    else invMap[row.status].qty_750 = row.quantity
  }

  const todayDeliveries = todayDeliveriesRes.data ?? []
  const completedToday = todayDeliveries.filter((d: any) => d.status === 'completed').length
  const completionRate = todayDeliveries.length > 0 ? Math.round((completedToday / todayDeliveries.length) * 100) : 0

  return (
    <>
      <Topbar title="dashboard_title" titleIsKey />
      <DashboardClient
        customersCount={customersRes.count ?? 0}
        deliveriesCount={deliveriesRes.count ?? 0}
        bottlesAtCustomer={bottlesAtCustomer}
        bottlesFilled={bottlesFilled}
        unpaidCount={invoicesRes.count ?? 0}
        monthRevenue={monthRevenue}
        overdueTotal={overdueTotal}
        activeVehicles={activeVehicles}
        maintVehicles={maintVehicles}
        drivers={drivers}
        expiringDocs={expiringDocs}
        expiringLicenses={expiringLicenses}
        bottleAlerts={bottleAlerts}
        kpiTargets={kpiTargets}
        monthDeliveries={monthDeliveries}
        newCustomers={newCustomers}
        currentPeriod={currentPeriod}
        invMap={invMap}
        todayDeliveries={todayDeliveries}
        completedToday={completedToday}
        completionRate={completionRate}
        overdueInvoices={overdueRes.data ?? []}
      />
    </>
  )
}
