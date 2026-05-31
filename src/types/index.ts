// ── Core Enums ────────────────────────────────────────────────
export type CustomerType = 'hotel' | 'restaurant' | 'resort' | 'cafe' | 'office' | 'retail' | 'business' | 'other'
export type CustomerStatus = 'lead' | 'active' | 'paused' | 'churned' | 'blacklisted'
export type CustomerTier = 'standard' | 'silver' | 'gold' | 'platinum'
export type CustomerSource = 'referral' | 'cold_call' | 'walk_in' | 'social' | 'website' | 'partner' | 'other'
export type StaffRole = 'driver' | 'cleaner' | 'manager' | 'admin'
export type OrderStatus = 'pending' | 'confirmed' | 'scheduled' | 'in_transit' | 'delivered' | 'failed' | 'cancelled'
export type OrderType = 'standing' | 'one_off' | 'delivery' | 'pickup' | 'exchange'
export type DeliveryStatus = 'pending' | 'in_transit' | 'completed' | 'failed'
export type BottleSize = '350ml' | '750ml'
export type BottleStatus = 'filled' | 'at_customer' | 'dirty' | 'cleaning' | 'clean_empty' | 'damaged' | 'lost'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
export type VehicleStatus = 'active' | 'maintenance' | 'retired' | 'sold'
export type VehicleType = 'truck' | 'van' | 'motorcycle' | 'pickup'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'
export type PaymentMethod = 'bank_transfer' | 'cash' | 'credit_card' | 'qris' | 'cheque' | 'other'
export type ExpenseCategory = 'fuel' | 'maintenance' | 'payroll' | 'supplies' | 'marketing' | 'rent' | 'utilities' | 'other'

// ── Customer Management ───────────────────────────────────────
export interface Customer {
  id: string
  location_id: string | null
  name: string
  type: CustomerType
  status: CustomerStatus
  tier: CustomerTier
  source: CustomerSource | null
  referral_customer_id: string | null
  credit_limit: number
  payment_terms_days: number
  tax_id: string | null
  // Legacy fields (kept for compatibility)
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  address: string
  city: string
  notes: string | null
  tags: string[] | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface CustomerAddress {
  id: string
  customer_id: string
  label: string
  address: string
  city: string
  district: string | null
  postal_code: string | null
  latitude: number | null
  longitude: number | null
  delivery_instructions: string | null
  is_primary: boolean
  active: boolean
  created_at: string
}

export interface CustomerContact {
  id: string
  customer_id: string
  name: string
  role: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  is_primary: boolean
  receives_invoices: boolean
  receives_delivery_notices: boolean
  created_at: string
}

export interface CustomerNote {
  id: string
  customer_id: string
  content: string
  type: 'note' | 'call' | 'meeting' | 'complaint' | 'compliment' | 'system'
  created_by: string | null
  created_at: string
}

export interface SupportTicket {
  id: string
  customer_id: string
  subject: string
  description: string | null
  status: TicketStatus
  priority: TicketPriority
  category: 'delivery' | 'billing' | 'quality' | 'bottles' | 'other' | null
  assigned_to: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  customer?: Customer
}

export interface Contract {
  id: string
  customer_id: string
  title: string
  start_date: string
  end_date: string | null
  value: number | null
  terms: string | null
  file_url: string | null
  status: 'draft' | 'active' | 'expired' | 'terminated'
  auto_renew: boolean
  created_at: string
}

// ── Subscriptions ─────────────────────────────────────────────
export interface SubscriptionPlan {
  id: string
  name: string
  description: string | null
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom'
  price_350ml: number
  price_750ml: number
  min_qty_350ml: number
  min_qty_750ml: number
  lost_bottle_charge_350ml: number
  lost_bottle_charge_750ml: number
  lost_bottle_threshold_pct: number
  active: boolean
}

export interface CustomerSubscription {
  id: string
  customer_id: string
  address_id: string | null
  plan_id: string | null
  status: 'active' | 'paused' | 'cancelled' | 'expired'
  qty_350ml: number
  qty_750ml: number
  delivery_days: string[] | null
  preferred_time_start: string | null
  preferred_time_end: string | null
  start_date: string
  end_date: string | null
  special_instructions: string | null
  created_at: string
  plan?: SubscriptionPlan
  address?: CustomerAddress
}

// ── Staff & HR ────────────────────────────────────────────────
export interface Staff {
  id: string
  name: string
  role: StaffRole
  phone: string | null
  email: string | null
  active: boolean
  location_id: string | null
  employee_number: string | null
  start_date: string | null
  salary: number | null
  salary_type: 'monthly' | 'daily' | 'hourly' | null
  id_number: string | null
  license_number: string | null
  license_expiry: string | null
  emergency_contact: string | null
  emergency_phone: string | null
  photo_url: string | null
  created_at: string
  updated_at: string | null
}

export interface DriverPerformance {
  id: string
  driver_id: string
  period_date: string
  deliveries_completed: number
  deliveries_failed: number
  on_time_rate: number
  bottles_delivered: number
  bottles_collected: number
  collection_rate: number
  customer_rating: number | null
  incidents: number
  fuel_used: number
  km_driven: number
  created_at: string
  driver?: Staff
}

export interface DriverChecklist {
  id: string
  driver_id: string
  vehicle_id: string | null
  checklist_date: string
  type: 'pre_trip' | 'post_trip'
  items: Record<string, boolean>
  notes: string | null
  completed: boolean
  completed_at: string | null
  created_at: string
}

// ── Fleet ─────────────────────────────────────────────────────
export interface Vehicle {
  id: string
  location_id: string | null
  name: string
  plate_number: string
  make: string | null
  model: string | null
  year: number | null
  color: string | null
  type: VehicleType
  capacity_350ml: number
  capacity_750ml: number
  status: VehicleStatus
  assigned_driver_id: string | null
  registration_expiry: string | null
  insurance_expiry: string | null
  insurance_provider: string | null
  insurance_policy_number: string | null
  current_odometer: number
  notes: string | null
  created_at: string
  updated_at: string
  assigned_driver?: Staff
}

export interface VehicleMaintenance {
  id: string
  vehicle_id: string
  type: string
  description: string
  vendor: string | null
  cost: number
  odometer_at_service: number | null
  service_date: string
  next_service_date: string | null
  next_service_odometer: number | null
  receipt_url: string | null
  created_at: string
  vehicle?: Vehicle
}

export interface FuelLog {
  id: string
  vehicle_id: string
  driver_id: string | null
  log_date: string
  liters: number
  price_per_liter: number | null
  total_cost: number | null
  odometer: number | null
  station: string | null
  full_tank: boolean
  receipt_url: string | null
  created_at: string
}

// ── Routes & Deliveries ───────────────────────────────────────
export interface Route {
  id: string
  name: string
  driver_id: string | null
  day_of_week: string[]
  active: boolean
  vehicle_id: string | null
  estimated_duration_mins: number | null
  estimated_km: number | null
  notes: string | null
  created_at: string
  driver?: Staff
  stops?: RouteStop[]
}

export interface RouteStop {
  id: string
  route_id: string
  customer_id: string
  stop_order: number
  notes: string | null
  address_id: string | null
  estimated_arrival: string | null
  customer?: Customer
}

export interface Order {
  id: string
  customer_id: string
  order_type: OrderType
  status: OrderStatus
  qty_350ml: number
  qty_750ml: number
  par_350ml: number
  par_750ml: number
  scheduled_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
  customer?: Customer
}

export interface Delivery {
  id: string
  order_id: string | null
  driver_id: string | null
  route_id: string | null
  customer_id: string
  delivery_date: string
  status: DeliveryStatus
  delivered_350ml: number
  delivered_750ml: number
  collected_350ml: number
  collected_750ml: number
  damaged_350ml: number
  damaged_750ml: number
  driver_notes: string | null
  signature_data: string | null
  signature_confirmed_by: string | null
  confirmed_at: string | null
  completed_at: string | null
  vehicle_id: string | null
  address_id: string | null
  failure_reason: string | null
  photo_proof_url: string | null
  gps_lat: number | null
  gps_lng: number | null
  created_at: string
  customer?: Customer
  driver?: Staff
}

// ── Inventory ─────────────────────────────────────────────────
export interface BottleInventory {
  id: string
  bottle_size: BottleSize
  status: BottleStatus
  quantity: number
  location: string | null
  warehouse_id: string | null
  updated_at: string
}

export interface InventoryItem {
  id: string
  warehouse_id: string
  category: 'bottle' | 'cap' | 'label' | 'water' | 'packaging' | 'cleaning' | 'other'
  name: string
  sku: string | null
  unit: string
  quantity: number
  reorder_point: number
  reorder_quantity: number
  unit_cost: number
  notes: string | null
  updated_at: string
}

// ── Finance ───────────────────────────────────────────────────
export interface Invoice {
  id: string
  customer_id: string
  invoice_number: string
  status: InvoiceStatus
  issue_date: string
  due_date: string
  subtotal: number
  tax: number
  total: number
  notes: string | null
  period_start: string | null
  period_end: string | null
  sent_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
  customer?: Customer
  items?: InvoiceItem[]
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  delivery_id: string | null
  description: string
  bottle_size: BottleSize | null
  quantity: number
  unit_price: number
  total: number
}

export interface Payment {
  id: string
  customer_id: string
  invoice_id: string | null
  amount: number
  currency: string
  method: PaymentMethod
  reference: string | null
  payment_date: string
  notes: string | null
  created_by: string | null
  created_at: string
  customer?: Customer
  invoice?: Invoice
}

export interface Expense {
  id: string
  location_id: string | null
  category: ExpenseCategory
  description: string
  vendor: string | null
  amount: number
  currency: string
  expense_date: string
  receipt_url: string | null
  status: 'pending' | 'approved' | 'rejected' | 'paid'
  vehicle_id: string | null
  driver_id: string | null
  created_by: string | null
  created_at: string
  vehicle?: Vehicle
}

export interface ChartOfAccount {
  id: string
  code: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  subtype: string | null
  parent_id: string | null
  active: boolean
}

export interface Pricing {
  id: string
  bottle_size: BottleSize
  price_per_unit: number
  effective_from: string
  active: boolean
}

// ── Bottle Balance Views ───────────────────────────────────────
export interface CustomerBottleBalance {
  customer_id: string
  customer_name: string
  customer_type: CustomerType
  city: string
  total_delivered_350ml: number
  total_returned_350ml: number
  total_damaged_350ml: number
  outstanding_350ml: number
  total_delivered_750ml: number
  total_returned_750ml: number
  total_damaged_750ml: number
  outstanding_750ml: number
  threshold_350ml: number
  threshold_750ml: number
  chargeable_lost_350ml: number
  chargeable_lost_750ml: number
  net_outstanding?: number
  is_chargeable?: boolean
  lost_pct?: number
}

export interface MonthlyDeliverySummary {
  customer_id: string
  month: string
  delivered_350ml: number
  delivered_750ml: number
  collected_350ml: number
  collected_750ml: number
  damaged_350ml: number
  damaged_750ml: number
  delivery_count: number
}

// ── PTO & HR ──────────────────────────────────────────────────
export interface PtoRequest {
  id: string
  employee_id: string
  type: 'annual' | 'sick' | 'personal' | 'unpaid' | 'public_holiday'
  start_date: string
  end_date: string
  days: number | null
  reason: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  created_at: string
  employee?: Staff
}

// ── Leads / CRM ───────────────────────────────────────────────
export interface Lead {
  id: string
  name: string
  type: CustomerType | null
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  city: string | null
  address: string | null
  source: CustomerSource | null
  estimated_monthly_value: number | null
  probability: number | null
  assigned_to: string | null
  notes: string | null
  lost_reason: string | null
  converted_customer_id: string | null
  created_at: string
  updated_at: string
}
