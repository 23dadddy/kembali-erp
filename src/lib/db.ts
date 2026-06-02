import { createClient } from '@/lib/supabase/client'
import { swr, cacheWrite, cacheInvalidate } from '@/lib/cache'
import type {
  Customer, CustomerAddress, CustomerContact, CustomerNote, SupportTicket, Contract,
  CustomerSubscription, Staff, Route, Order, Delivery, BottleInventory, InventoryItem,
  Invoice, Pricing, CustomerBottleBalance, MonthlyDeliverySummary,
  Vehicle, VehicleMaintenance, FuelLog, Payment, Expense, PtoRequest, Lead
} from '@/types'

// ── Customers ──────────────────────────────────────────────────────────────────
export async function getCustomers(onFresh?: (d: Customer[]) => void) {
  return swr('customers', async () => {
    const sb = createClient()
    const { data, error } = await sb.from('customers').select('*').order('name')
    if (error) throw error
    return data as Customer[]
  }, 60_000, onFresh)
}

export async function getCustomer(id: string) {
  return swr(`customer:${id}`, async () => {
    const sb = createClient()
    const { data, error } = await sb.from('customers').select('*').eq('id', id).single()
    if (error) throw error
    return data as Customer
  }, 30_000)
}

export async function createCustomer(payload: Partial<Customer>) {
  const sb = createClient()
  const { data, error } = await sb.from('customers').insert(payload).select().single()
  if (error) throw error
  return data as Customer
}

export async function updateCustomer(id: string, payload: Partial<Customer>) {
  const sb = createClient()
  const { data, error } = await sb
    .from('customers')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data as Customer
}

// Customer Addresses
export async function getCustomerAddresses(customerId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('customer_addresses')
    .select('*')
    .eq('customer_id', customerId)
    .eq('active', true)
    .order('is_primary', { ascending: false })
  if (error) throw error
  return data as CustomerAddress[]
}

export async function createCustomerAddress(payload: Partial<CustomerAddress>) {
  const sb = createClient()
  const { data, error } = await sb.from('customer_addresses').insert(payload).select().single()
  if (error) throw error
  return data as CustomerAddress
}

export async function updateCustomerAddress(id: string, payload: Partial<CustomerAddress>) {
  const sb = createClient()
  const { data, error } = await sb.from('customer_addresses').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data as CustomerAddress
}

export async function deleteCustomerAddress(id: string) {
  const sb = createClient()
  const { error } = await sb.from('customer_addresses').update({ active: false }).eq('id', id)
  if (error) throw error
}

// Customer Contacts
export async function getCustomerContacts(customerId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('customer_contacts')
    .select('*')
    .eq('customer_id', customerId)
    .order('is_primary', { ascending: false })
  if (error) throw error
  return data as CustomerContact[]
}

export async function createCustomerContact(payload: Partial<CustomerContact>) {
  const sb = createClient()
  const { data, error } = await sb.from('customer_contacts').insert(payload).select().single()
  if (error) throw error
  return data as CustomerContact
}

export async function updateCustomerContact(id: string, payload: Partial<CustomerContact>) {
  const sb = createClient()
  const { data, error } = await sb.from('customer_contacts').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data as CustomerContact
}

export async function deleteCustomerContact(id: string) {
  const sb = createClient()
  const { error } = await sb.from('customer_contacts').delete().eq('id', id)
  if (error) throw error
}

// Customer Notes
export async function getCustomerNotes(customerId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('customer_notes')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as CustomerNote[]
}

export async function createCustomerNote(payload: Partial<CustomerNote>) {
  const sb = createClient()
  const { data, error } = await sb.from('customer_notes').insert(payload).select().single()
  if (error) throw error
  return data as CustomerNote
}

// Support Tickets
export async function getSupportTickets(customerId?: string) {
  const sb = createClient()
  let q = sb.from('support_tickets').select('*, customer:customers(name, city)').order('created_at', { ascending: false })
  if (customerId) q = q.eq('customer_id', customerId)
  const { data, error } = await q
  if (error) throw error
  return data as SupportTicket[]
}

export async function createSupportTicket(payload: Partial<SupportTicket>) {
  const sb = createClient()
  const { data, error } = await sb.from('support_tickets').insert(payload).select().single()
  if (error) throw error
  return data as SupportTicket
}

export async function updateSupportTicket(id: string, payload: Partial<SupportTicket>) {
  const sb = createClient()
  const { data, error } = await sb.from('support_tickets').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data as SupportTicket
}

// Customer Subscriptions
export async function getCustomerSubscriptions(customerId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('customer_subscriptions')
    .select('*, plan:subscription_plans(*), address:customer_addresses(*)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as CustomerSubscription[]
}

export async function upsertSubscription(payload: Partial<CustomerSubscription>) {
  const sb = createClient()
  if (payload.id) {
    const { data, error } = await sb.from('customer_subscriptions').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', payload.id).select().single()
    if (error) throw error
    return data as CustomerSubscription
  }
  const { data, error } = await sb.from('customer_subscriptions').insert(payload).select().single()
  if (error) throw error
  return data as CustomerSubscription
}

// ── Staff ──────────────────────────────────────────────────────────────────────
export async function getStaff(onFresh?: (d: Staff[]) => void) {
  return swr('staff', async () => {
    const sb = createClient()
    const { data, error } = await sb.from('staff').select('*').order('name')
    if (error) throw error
    return data as Staff[]
  }, 60_000, onFresh)
}

export async function getStaffMember(id: string) {
  const sb = createClient()
  const { data, error } = await sb.from('staff').select('*').eq('id', id).single()
  if (error) throw error
  return data as Staff
}

export async function createStaff(payload: Partial<Staff>) {
  const sb = createClient()
  const { data, error } = await sb.from('staff').insert(payload).select().single()
  if (error) throw error
  return data as Staff
}

export async function updateStaff(id: string, payload: Partial<Staff>) {
  const sb = createClient()
  const { data, error } = await sb.from('staff').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data as Staff
}

// PTO Requests
export async function getPtoRequests(employeeId?: string) {
  const sb = createClient()
  let q = sb.from('pto_requests').select('*, employee:staff!pto_requests_employee_id_fkey(name, role)').order('created_at', { ascending: false })
  if (employeeId) q = q.eq('employee_id', employeeId)
  const { data, error } = await q
  if (error) throw error
  return data as PtoRequest[]
}

export async function createPtoRequest(payload: Partial<PtoRequest>) {
  const sb = createClient()
  const { data, error } = await sb.from('pto_requests').insert(payload).select().single()
  if (error) throw error
  return data as PtoRequest
}

export async function updatePtoRequest(id: string, status: 'approved' | 'rejected' | 'cancelled') {
  const sb = createClient()
  const { error } = await sb.from('pto_requests').update({ status }).eq('id', id)
  if (error) throw error
}

// ── Fleet ──────────────────────────────────────────────────────────────────────
export async function getVehicles() {
  const sb = createClient()
  const { data, error } = await sb
    .from('vehicles')
    .select('*, assigned_driver:staff(name, phone)')
    .order('name')
  if (error) throw error
  return data as Vehicle[]
}

export async function getVehicle(id: string) {
  const sb = createClient()
  const { data, error } = await sb.from('vehicles').select('*, assigned_driver:staff(name, phone)').eq('id', id).single()
  if (error) throw error
  return data as Vehicle
}

export async function createVehicle(payload: Partial<Vehicle>) {
  const sb = createClient()
  const { data, error } = await sb.from('vehicles').insert(payload).select().single()
  if (error) throw error
  return data as Vehicle
}

export async function updateVehicle(id: string, payload: Partial<Vehicle>) {
  const sb = createClient()
  const { data, error } = await sb.from('vehicles').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data as Vehicle
}

export async function getVehicleMaintenance(vehicleId?: string) {
  const sb = createClient()
  let q = sb.from('vehicle_maintenance').select('*, vehicle:vehicles(name, plate_number)').order('service_date', { ascending: false })
  if (vehicleId) q = q.eq('vehicle_id', vehicleId)
  const { data, error } = await q
  if (error) throw error
  return data as VehicleMaintenance[]
}

export async function createVehicleMaintenance(payload: Partial<VehicleMaintenance>) {
  const sb = createClient()
  const { data, error } = await sb.from('vehicle_maintenance').insert(payload).select().single()
  if (error) throw error
  return data as VehicleMaintenance
}

export async function getFuelLogs(vehicleId?: string) {
  const sb = createClient()
  let q = sb.from('fuel_logs').select('*').order('log_date', { ascending: false })
  if (vehicleId) q = q.eq('vehicle_id', vehicleId)
  const { data, error } = await q
  if (error) throw error
  return data as FuelLog[]
}

export async function createFuelLog(payload: Partial<FuelLog>) {
  const sb = createClient()
  const { data, error } = await sb.from('fuel_logs').insert(payload).select().single()
  if (error) throw error
  return data as FuelLog
}

// ── Routes ─────────────────────────────────────────────────────────────────────
export async function getRoutes(onFresh?: (d: Route[]) => void) {
  return swr('routes', async () => {
    const sb = createClient()
    const { data, error } = await sb
      .from('routes')
      .select('*, driver:staff(*), stops:route_stops(*, customer:customers(*))')
      .order('name')
    if (error) throw error
    return data as Route[]
  }, 60_000, onFresh)
}

export async function createRoute(payload: {
  name: string; driver_id: string | null; day_of_week: string[]
}) {
  const sb = createClient()
  const { data, error } = await sb.from('routes').insert(payload).select().single()
  if (error) throw error
  return data
}

export async function addRouteStop(routeId: string, customerId: string, stopOrder: number) {
  const sb = createClient()
  const { error } = await sb.from('route_stops').insert({
    route_id: routeId, customer_id: customerId, stop_order: stopOrder,
  })
  if (error) throw error
}

// ── Orders ─────────────────────────────────────────────────────────────────────
export async function getOrders() {
  const sb = createClient()
  const { data, error } = await sb
    .from('orders')
    .select('*, customer:customers(*)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Order[]
}

export async function upsertStandingOrder(customerId: string, qty350: number, qty750: number) {
  const sb = createClient()
  const { data: existing } = await sb
    .from('orders')
    .select('id')
    .eq('customer_id', customerId)
    .eq('order_type', 'standing')
    .single()
  if (existing) {
    await sb.from('orders').update({ par_350ml: qty350, par_750ml: qty750, qty_350ml: qty350, qty_750ml: qty750 }).eq('id', existing.id)
  } else {
    await sb.from('orders').insert({
      customer_id: customerId, order_type: 'standing', status: 'scheduled',
      qty_350ml: qty350, qty_750ml: qty750, par_350ml: qty350, par_750ml: qty750,
    })
  }
}

// ── Deliveries ─────────────────────────────────────────────────────────────────
export async function getDeliveries(filters?: { date?: string; status?: string; driver_id?: string }) {
  const sb = createClient()
  let q = sb
    .from('deliveries')
    .select('*, customer:customers(*), driver:staff(*)')
    .order('delivery_date', { ascending: false })
  if (filters?.date) q = q.eq('delivery_date', filters.date)
  if (filters?.status && filters.status !== 'all') q = q.eq('status', filters.status)
  if (filters?.driver_id) q = q.eq('driver_id', filters.driver_id)
  const { data, error } = await q
  if (error) throw error
  return data as Delivery[]
}

export async function getDelivery(id: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('deliveries')
    .select('*, customer:customers(*), driver:staff(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Delivery
}

export async function createDelivery(payload: Partial<Delivery>) {
  const sb = createClient()
  const { data, error } = await sb.from('deliveries').insert(payload).select().single()
  if (error) throw error
  return data as Delivery
}

export async function completeDelivery(
  id: string,
  data: {
    delivered_350ml: number
    delivered_750ml: number
    collected_350ml: number
    collected_750ml: number
    damaged_350ml: number
    damaged_750ml: number
    driver_notes?: string
    signature_data: string
    signature_confirmed_by: string
  }
) {
  const sb = createClient()
  const now = new Date().toISOString()
  const { error } = await sb.from('deliveries').update({
    ...data,
    status: 'completed',
    completed_at: now,
    confirmed_at: now,
  }).eq('id', id)
  if (error) throw error

  await updateInventoryForDelivery(
    data.delivered_350ml, data.delivered_750ml,
    data.collected_350ml, data.collected_750ml,
    data.damaged_350ml, data.damaged_750ml
  )
}

export async function updateDeliveryStatus(id: string, status: string) {
  const sb = createClient()
  const update: Record<string, unknown> = { status }
  if (status === 'completed') update.completed_at = new Date().toISOString()
  const { error } = await sb.from('deliveries').update(update).eq('id', id)
  if (error) throw error
}

async function updateInventoryForDelivery(
  del350: number, del750: number,
  col350: number, col750: number,
  dam350: number, dam750: number
) {
  const sb = createClient()
  if (del350 > 0) {
    await sb.rpc('increment_inventory', { p_size: '350ml', p_status: 'at_customer', p_qty: del350 })
    await sb.rpc('decrement_inventory', { p_size: '350ml', p_status: 'filled', p_qty: del350 })
  }
  if (del750 > 0) {
    await sb.rpc('increment_inventory', { p_size: '750ml', p_status: 'at_customer', p_qty: del750 })
    await sb.rpc('decrement_inventory', { p_size: '750ml', p_status: 'filled', p_qty: del750 })
  }
  if (col350 > 0) {
    await sb.rpc('increment_inventory', { p_size: '350ml', p_status: 'dirty', p_qty: col350 })
    await sb.rpc('decrement_inventory', { p_size: '350ml', p_status: 'at_customer', p_qty: col350 })
  }
  if (col750 > 0) {
    await sb.rpc('increment_inventory', { p_size: '750ml', p_status: 'dirty', p_qty: col750 })
    await sb.rpc('decrement_inventory', { p_size: '750ml', p_status: 'at_customer', p_qty: col750 })
  }
  if (dam350 > 0) {
    await sb.rpc('increment_inventory', { p_size: '350ml', p_status: 'damaged', p_qty: dam350 })
    await sb.rpc('decrement_inventory', { p_size: '350ml', p_status: 'at_customer', p_qty: dam350 })
  }
  if (dam750 > 0) {
    await sb.rpc('increment_inventory', { p_size: '750ml', p_status: 'damaged', p_qty: dam750 })
    await sb.rpc('decrement_inventory', { p_size: '750ml', p_status: 'at_customer', p_qty: dam750 })
  }
}

// ── Inventory ──────────────────────────────────────────────────────────────────
export async function getInventory() {
  const sb = createClient()
  const { data, error } = await sb.from('bottle_inventory').select('*').order('bottle_size')
  if (error) throw error
  return data as BottleInventory[]
}

export async function setInventoryQty(id: string, quantity: number) {
  const sb = createClient()
  const { error } = await sb
    .from('bottle_inventory')
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function getInventoryItems() {
  const sb = createClient()
  const { data, error } = await sb.from('inventory_items').select('*').order('category').order('name')
  if (error) throw error
  return data as InventoryItem[]
}

export async function upsertInventoryItem(payload: Partial<InventoryItem>) {
  const sb = createClient()
  if (payload.id) {
    const { data, error } = await sb.from('inventory_items').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', payload.id).select().single()
    if (error) throw error
    return data as InventoryItem
  }
  const { data, error } = await sb.from('inventory_items').insert(payload).select().single()
  if (error) throw error
  return data as InventoryItem
}

// ── Customer Bottle Balances ───────────────────────────────────────────────────
export async function getCustomerBottleBalances() {
  const sb = createClient()
  const { data, error } = await sb
    .from('customer_bottle_balance')
    .select('*')
    .order('outstanding_350ml', { ascending: false })
  if (error) throw error
  return data as CustomerBottleBalance[]
}

export async function getCustomerBottleBalance(customerId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('customer_bottle_balance')
    .select('*')
    .eq('customer_id', customerId)
    .single()
  if (error) return null
  return data as CustomerBottleBalance
}

// ── Invoices ───────────────────────────────────────────────────────────────────
export async function getInvoices(onFresh?: (d: Invoice[]) => void) {
  return swr('invoices', async () => {
    const sb = createClient()
    const { data, error } = await sb
      .from('invoices')
      .select('*, customer:customers(*), items:invoice_items(*)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data as Invoice[]
  }, 30_000, onFresh)
}

export async function createInvoice(payload: {
  customer_id: string
  due_date: string
  notes?: string
  items: { description: string; bottle_size?: string; quantity: number; unit_price: number; delivery_id?: string }[]
}) {
  const sb = createClient()
  // Use MAX invoice_number to avoid duplicates when records are deleted
  const { data: maxRow } = await sb.from('invoices').select('invoice_number').like('invoice_number', 'KW-%').order('invoice_number', { ascending: false }).limit(1).single()
  const lastNum = maxRow?.invoice_number ? parseInt(maxRow.invoice_number.replace('KW-', ''), 10) : 0
  const invoiceNumber = `KW-${String(lastNum + 1).padStart(5, '0')}`
  const subtotal = payload.items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const tax_rate = 11 // PPN 11%
  const tax_amount = Math.round(subtotal * tax_rate / 100)
  const total = subtotal + tax_amount

  const { data: inv, error } = await sb
    .from('invoices')
    .insert({
      customer_id: payload.customer_id,
      invoice_number: invoiceNumber,
      due_date: payload.due_date,
      notes: payload.notes,
      subtotal,
      tax_rate,
      tax_amount,
      total,
    })
    .select().single()
  if (error) throw error

  if (payload.items.length > 0) {
    await sb.from('invoice_items').insert(
      payload.items.map((item) => ({ ...item, invoice_id: inv.id }))
    )
  }
  return inv as Invoice
}

export async function generateMonthlyInvoice(customerId: string, month: string) {
  const sb = createClient()
  const [year, mon] = month.split('-')
  const startDate = `${year}-${mon}-01`
  const endDate = new Date(parseInt(year), parseInt(mon), 0).toISOString().split('T')[0]

  const { data: deliveries } = await sb
    .from('deliveries')
    .select('*')
    .eq('customer_id', customerId)
    .eq('status', 'completed')
    .gte('delivery_date', startDate)
    .lte('delivery_date', endDate)

  if (!deliveries || deliveries.length === 0) return null

  const pricing = await getPricing()
  const p350 = pricing.find((p) => p.bottle_size === '350ml')?.price_per_unit ?? 0
  const p750 = pricing.find((p) => p.bottle_size === '750ml')?.price_per_unit ?? 0

  const total350 = deliveries.reduce((s, d) => s + (d.delivered_350ml ?? 0), 0)
  const total750 = deliveries.reduce((s, d) => s + (d.delivered_750ml ?? 0), 0)

  const items: { description: string; bottle_size?: string; quantity: number; unit_price: number }[] = []

  if (total350 > 0) items.push({
    description: `350ml Glass Bottle — ${deliveries.length} deliveries`,
    bottle_size: '350ml', quantity: total350, unit_price: p350,
  })
  if (total750 > 0) items.push({
    description: `750ml Glass Bottle — ${deliveries.length} deliveries`,
    bottle_size: '750ml', quantity: total750, unit_price: p750,
  })

  const balance = await getCustomerBottleBalance(customerId)
  if (balance) {
    if (balance.chargeable_lost_350ml > 0) {
      items.push({
        description: `Lost bottle charge — 350ml (${balance.outstanding_350ml} outstanding, ${balance.threshold_350ml} within 8% threshold)`,
        bottle_size: '350ml',
        quantity: balance.chargeable_lost_350ml,
        unit_price: p350,
      })
    }
    if (balance.chargeable_lost_750ml > 0) {
      items.push({
        description: `Lost bottle charge — 750ml (${balance.outstanding_750ml} outstanding, ${balance.threshold_750ml} within 8% threshold)`,
        bottle_size: '750ml',
        quantity: balance.chargeable_lost_750ml,
        unit_price: p750,
      })
    }
  }

  const due = new Date(); due.setDate(due.getDate() + 30)
  const monthLabel = new Date(startDate).toLocaleString('default', { month: 'long', year: 'numeric' })
  return createInvoice({
    customer_id: customerId,
    due_date: due.toISOString().split('T')[0],
    notes: `Monthly invoice for ${monthLabel}`,
    items,
  })
}

export async function updateInvoiceStatus(id: string, status: string) {
  const sb = createClient()
  const { error } = await sb
    .from('invoices')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// Payments
export async function getPayments(customerId?: string) {
  const sb = createClient()
  let q = sb.from('payments').select('*, customer:customers(name), invoice:invoices(invoice_number)').order('payment_date', { ascending: false })
  if (customerId) q = q.eq('customer_id', customerId)
  const { data, error } = await q
  if (error) throw error
  return data as Payment[]
}

export async function createPayment(payload: Partial<Payment>) {
  const sb = createClient()
  const { data, error } = await sb.from('payments').insert(payload).select().single()
  if (error) throw error
  // Auto-mark invoice as paid
  if (payload.invoice_id) {
    await sb.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', payload.invoice_id)
  }
  return data as Payment
}

// Expenses
export async function getExpenses() {
  const sb = createClient()
  const { data, error } = await sb.from('expenses').select('*, vehicle:vehicles(name, plate_number)').order('expense_date', { ascending: false })
  if (error) throw error
  return data as Expense[]
}

export async function createExpense(payload: Partial<Expense>) {
  const sb = createClient()
  const { data, error } = await sb.from('expenses').insert(payload).select().single()
  if (error) throw error
  return data as Expense
}

export async function updateExpense(id: string, payload: Partial<Expense>) {
  const sb = createClient()
  const { data, error } = await sb.from('expenses').update(payload).eq('id', id).select().single()
  if (error) throw error
  return data as Expense
}

// ── Pricing ────────────────────────────────────────────────────────────────────
export async function getPricing() {
  return swr('pricing', async () => {
    const sb = createClient()
    const { data, error } = await sb.from('pricing').select('*').eq('active', true)
    if (error) throw error
    return data as Pricing[]
  }, 120_000) // pricing rarely changes
}

export async function setPricing(bottleSize: string, pricePerUnit: number) {
  const sb = createClient()
  await sb.from('pricing').delete().eq('bottle_size', bottleSize)
  await sb.from('pricing').insert({ bottle_size: bottleSize, price_per_unit: pricePerUnit, active: true })
}

// ── Leads / CRM ────────────────────────────────────────────────────────────────
export async function getLeads(onFresh?: (d: Lead[]) => void) {
  return swr('leads', async () => {
    const sb = createClient()
    const { data, error } = await sb.from('leads').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data as Lead[]
  }, 30_000, onFresh)
}

export async function createLead(payload: Partial<Lead>) {
  const sb = createClient()
  const { data, error } = await sb.from('leads').insert(payload).select().single()
  if (error) throw error
  return data as Lead
}

export async function updateLead(id: string, payload: Partial<Lead>) {
  const sb = createClient()
  const { data, error } = await sb.from('leads').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data as Lead
}

export async function convertLeadToCustomer(leadId: string) {
  const sb = createClient()
  const { data: lead, error: le } = await sb.from('leads').select('*').eq('id', leadId).single()
  if (le || !lead) throw le
  const { data: customer, error: ce } = await sb.from('customers').insert({
    name: lead.name,
    type: lead.type ?? 'business',
    city: lead.city ?? 'Bali',
    address: lead.address ?? '',
    contact_name: lead.contact_name,
    contact_phone: lead.contact_phone,
    contact_email: lead.contact_email,
    source: lead.source,
    status: 'active',
    active: true,
  }).select().single()
  if (ce) throw ce
  await sb.from('leads').update({ status: 'won', converted_customer_id: customer.id, updated_at: new Date().toISOString() }).eq('id', leadId)
  return customer as Customer
}

// ── Dashboard stats ────────────────────────────────────────────────────────────
export async function getDashboardStats() {
  const sb = createClient()
  const today = new Date().toISOString().split('T')[0]

  const [customers, deliveries, inventory, invoices] = await Promise.all([
    sb.from('customers').select('*', { count: 'exact', head: true }).eq('active', true),
    sb.from('deliveries').select('*', { count: 'exact', head: true }).eq('delivery_date', today),
    sb.from('bottle_inventory').select('*'),
    sb.from('invoices').select('*', { count: 'exact', head: true }).in('status', ['sent', 'overdue']),
  ])

  const bottlesAtCustomer = ((inventory.data ?? []) as BottleInventory[])
    .filter((r) => r.status === 'at_customer')
    .reduce((s, r) => s + r.quantity, 0)

  return {
    activeCustomers: customers.count ?? 0,
    todayDeliveries: deliveries.count ?? 0,
    bottlesInCirculation: bottlesAtCustomer,
    unpaidInvoices: invoices.count ?? 0,
    inventoryRows: (inventory.data ?? []) as BottleInventory[],
  }
}
