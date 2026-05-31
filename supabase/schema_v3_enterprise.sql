-- ============================================================
-- Kembali Water ERP — Enterprise Schema v3
-- Full rebuild: run this in Supabase SQL Editor
-- ============================================================

-- ── EXTENSIONS ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fast text search

-- ============================================================
-- SECTION 1: FOUNDATION
-- ============================================================

-- Locations (Bali now, multi-city later)
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Indonesia',
  currency TEXT NOT NULL DEFAULT 'IDR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Makassar',
  address TEXT,
  phone TEXT,
  email TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default Bali location
INSERT INTO locations (id, name, city, country) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Bali HQ', 'Bali', 'Indonesia')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SECTION 2: CUSTOMER MANAGEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  -- Identity
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'business' CHECK (type IN ('hotel', 'restaurant', 'resort', 'cafe', 'office', 'retail', 'business', 'other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('lead', 'active', 'paused', 'churned', 'blacklisted')),
  tier TEXT NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard', 'silver', 'gold', 'platinum')),
  -- Source & referral
  source TEXT CHECK (source IN ('referral', 'cold_call', 'walk_in', 'social', 'website', 'partner', 'other')),
  referral_customer_id UUID REFERENCES customers(id),
  -- Financial
  credit_limit DECIMAL(15,2) DEFAULT 0,
  payment_terms_days INTEGER DEFAULT 30,
  tax_id TEXT,
  -- Metadata
  notes TEXT,
  tags TEXT[],
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Multiple delivery addresses per customer
CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL DEFAULT 'Main', -- 'Main', 'Warehouse', 'Pool Bar', etc.
  address TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Bali',
  district TEXT,
  postal_code TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  delivery_instructions TEXT,
  is_primary BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Multiple contacts per customer
CREATE TABLE IF NOT EXISTS customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  role TEXT, -- 'Procurement', 'GM', 'F&B Manager', etc.
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  is_primary BOOLEAN DEFAULT false,
  receives_invoices BOOLEAN DEFAULT false,
  receives_delivery_notices BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Customer notes & interactions
CREATE TABLE IF NOT EXISTS customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'note' CHECK (type IN ('note', 'call', 'meeting', 'complaint', 'compliment', 'system')),
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Support tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  category TEXT CHECK (category IN ('delivery', 'billing', 'quality', 'bottles', 'other')),
  assigned_to UUID REFERENCES staff(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Contracts
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  value DECIMAL(15,2),
  terms TEXT,
  file_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'expired', 'terminated')),
  auto_renew BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SECTION 3: SUBSCRIPTION PLANS & ORDERS
-- ============================================================

-- Pricing tiers / plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id),
  name TEXT NOT NULL, -- 'Standard', 'Hotel Premium', 'Resort Package'
  description TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'custom')),
  price_350ml DECIMAL(10,2) DEFAULT 6000,
  price_750ml DECIMAL(10,2) DEFAULT 10000,
  min_qty_350ml INTEGER DEFAULT 0,
  min_qty_750ml INTEGER DEFAULT 0,
  lost_bottle_charge_350ml DECIMAL(10,2) DEFAULT 6000,
  lost_bottle_charge_750ml DECIMAL(10,2) DEFAULT 10000,
  lost_bottle_threshold_pct DECIMAL(5,2) DEFAULT 8.00,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Default plan
INSERT INTO subscription_plans (name, frequency, price_350ml, price_750ml)
VALUES ('Standard', 'weekly', 6000, 10000)
ON CONFLICT DO NOTHING;

-- Customer subscriptions
CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  address_id UUID REFERENCES customer_addresses(id),
  plan_id UUID REFERENCES subscription_plans(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
  -- Standing quantities
  qty_350ml INTEGER DEFAULT 0,
  qty_750ml INTEGER DEFAULT 0,
  -- Schedule
  delivery_days TEXT[], -- ['monday','thursday']
  preferred_time_start TIME,
  preferred_time_end TIME,
  -- Dates
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  pause_start DATE,
  pause_end DATE,
  -- Notes
  special_instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Orders (one-time or from subscription)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  address_id UUID REFERENCES customer_addresses(id),
  subscription_id UUID REFERENCES customer_subscriptions(id),
  order_number TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'delivery' CHECK (type IN ('delivery', 'pickup', 'exchange')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'scheduled', 'in_transit', 'delivered', 'failed', 'cancelled')),
  -- Items
  qty_350ml INTEGER DEFAULT 0,
  qty_750ml INTEGER DEFAULT 0,
  -- Pricing (snapshot at time of order)
  price_350ml DECIMAL(10,2),
  price_750ml DECIMAL(10,2),
  subtotal DECIMAL(15,2) DEFAULT 0,
  discount DECIMAL(15,2) DEFAULT 0,
  total DECIMAL(15,2) DEFAULT 0,
  -- Schedule
  scheduled_date DATE,
  scheduled_time_start TIME,
  scheduled_time_end TIME,
  -- Promo
  promotion_code TEXT,
  promotion_discount DECIMAL(15,2) DEFAULT 0,
  -- Notes
  customer_notes TEXT,
  internal_notes TEXT,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Order sequence for numbering
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1000;

-- Promotions
CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percent', 'fixed', 'free_bottles', 'first_order')),
  value DECIMAL(10,2) NOT NULL,
  min_order_value DECIMAL(10,2) DEFAULT 0,
  max_uses INTEGER,
  uses_count INTEGER DEFAULT 0,
  start_date DATE,
  end_date DATE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SECTION 4: STAFF & DRIVERS
-- ============================================================

-- Drop and recreate staff with full enterprise fields
-- (keep existing if already created)
DO $$ BEGIN
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS employee_number TEXT;
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS start_date DATE;
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS salary DECIMAL(15,2);
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS salary_type TEXT DEFAULT 'monthly' CHECK (salary_type IN ('monthly', 'daily', 'hourly'));
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS id_number TEXT;
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS license_number TEXT;
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS license_expiry DATE;
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS emergency_phone TEXT;
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS photo_url TEXT;
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Driver performance scorecards
CREATE TABLE IF NOT EXISTS driver_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES staff(id) NOT NULL,
  period_date DATE NOT NULL, -- month start
  deliveries_completed INTEGER DEFAULT 0,
  deliveries_failed INTEGER DEFAULT 0,
  on_time_rate DECIMAL(5,2) DEFAULT 0,
  bottles_delivered INTEGER DEFAULT 0,
  bottles_collected INTEGER DEFAULT 0,
  collection_rate DECIMAL(5,2) DEFAULT 0,
  customer_rating DECIMAL(3,2),
  incidents INTEGER DEFAULT 0,
  fuel_used DECIMAL(10,2) DEFAULT 0,
  km_driven DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(driver_id, period_date)
);

-- Driver daily checklists
CREATE TABLE IF NOT EXISTS driver_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES staff(id) NOT NULL,
  vehicle_id UUID, -- references vehicles
  checklist_date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT DEFAULT 'pre_trip' CHECK (type IN ('pre_trip', 'post_trip')),
  items JSONB NOT NULL DEFAULT '{}',
  -- Standard items: lights, brakes, tires, fuel, bottles_loaded, phone_charged
  notes TEXT,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Safety incidents
CREATE TABLE IF NOT EXISTS safety_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES staff(id),
  vehicle_id UUID,
  incident_date TIMESTAMPTZ NOT NULL,
  type TEXT CHECK (type IN ('accident', 'near_miss', 'traffic_violation', 'injury', 'property_damage', 'other')),
  description TEXT NOT NULL,
  severity TEXT DEFAULT 'minor' CHECK (severity IN ('minor', 'moderate', 'major', 'critical')),
  at_fault BOOLEAN,
  reported_to_insurance BOOLEAN DEFAULT false,
  cost DECIMAL(15,2) DEFAULT 0,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SECTION 5: FLEET MANAGEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  -- Identity
  name TEXT NOT NULL, -- 'Truck 1', 'Van Seminyak'
  plate_number TEXT UNIQUE NOT NULL,
  make TEXT, -- Toyota, Mitsubishi
  model TEXT, -- Hilux, L300
  year INTEGER,
  color TEXT,
  type TEXT DEFAULT 'truck' CHECK (type IN ('truck', 'van', 'motorcycle', 'pickup')),
  -- Capacity
  capacity_350ml INTEGER DEFAULT 0,
  capacity_750ml INTEGER DEFAULT 0,
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired', 'sold')),
  assigned_driver_id UUID REFERENCES staff(id),
  -- Registration & insurance
  registration_expiry DATE,
  insurance_expiry DATE,
  insurance_provider TEXT,
  insurance_policy_number TEXT,
  -- Odometer
  current_odometer DECIMAL(10,2) DEFAULT 0,
  -- Notes
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Maintenance records
CREATE TABLE IF NOT EXISTS vehicle_maintenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID REFERENCES vehicles(id) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('oil_change', 'tire', 'brake', 'engine', 'body', 'inspection', 'service', 'repair', 'other')),
  description TEXT NOT NULL,
  vendor TEXT,
  cost DECIMAL(15,2) DEFAULT 0,
  odometer_at_service DECIMAL(10,2),
  service_date DATE NOT NULL,
  next_service_date DATE,
  next_service_odometer DECIMAL(10,2),
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fuel logs
CREATE TABLE IF NOT EXISTS fuel_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID REFERENCES vehicles(id) NOT NULL,
  driver_id UUID REFERENCES staff(id),
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  liters DECIMAL(8,2) NOT NULL,
  price_per_liter DECIMAL(8,2),
  total_cost DECIMAL(15,2),
  odometer DECIMAL(10,2),
  station TEXT,
  full_tank BOOLEAN DEFAULT true,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SECTION 6: ROUTES & DELIVERIES (Enhanced)
-- ============================================================

-- Enhanced routes
DO $$ BEGIN
  ALTER TABLE routes ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
  ALTER TABLE routes ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id);
  ALTER TABLE routes ADD COLUMN IF NOT EXISTS estimated_duration_mins INTEGER;
  ALTER TABLE routes ADD COLUMN IF NOT EXISTS estimated_km DECIMAL(8,2);
  ALTER TABLE routes ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE routes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Enhanced route stops
DO $$ BEGIN
  ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS address_id UUID REFERENCES customer_addresses(id);
  ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS estimated_arrival TIME;
  ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS time_window_start TIME;
  ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS time_window_end TIME;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Enhanced deliveries
DO $$ BEGIN
  ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id);
  ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS address_id UUID REFERENCES customer_addresses(id);
  ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS order_id_ref UUID REFERENCES orders(id);
  ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS scheduled_time_start TIME;
  ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS scheduled_time_end TIME;
  ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS actual_arrival TIMESTAMPTZ;
  ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS actual_departure TIMESTAMPTZ;
  ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS failure_reason TEXT;
  ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS photo_proof_url TEXT;
  ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS gps_lat DECIMAL(10,8);
  ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS gps_lng DECIMAL(11,8);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================
-- SECTION 7: BOTTLE & INVENTORY MANAGEMENT
-- ============================================================

-- Warehouse locations
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  address TEXT,
  is_primary BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO warehouses (name, is_primary) VALUES ('Main Warehouse', true) ON CONFLICT DO NOTHING;

-- Enhanced bottle inventory (per warehouse)
-- Keep existing bottle_inventory table, add warehouse tracking
DO $$ BEGIN
  ALTER TABLE bottle_inventory ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Full inventory items (bottles + caps + labels + water)
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID REFERENCES warehouses(id) NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('bottle', 'cap', 'label', 'water', 'packaging', 'cleaning', 'other')),
  name TEXT NOT NULL,
  sku TEXT,
  unit TEXT DEFAULT 'pcs', -- pcs, liters, kg, boxes
  quantity DECIMAL(12,2) DEFAULT 0,
  reorder_point DECIMAL(12,2) DEFAULT 0,
  reorder_quantity DECIMAL(12,2) DEFAULT 0,
  unit_cost DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inventory movement log (every change tracked)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID REFERENCES warehouses(id),
  item_id UUID REFERENCES inventory_items(id),
  -- For bottle tracking
  bottle_size TEXT,
  bottle_from_status TEXT,
  bottle_to_status TEXT,
  -- Movement
  quantity DECIMAL(12,2) NOT NULL,
  direction TEXT CHECK (direction IN ('in', 'out', 'transfer', 'adjustment')),
  reason TEXT,
  reference_type TEXT, -- 'delivery', 'adjustment', 'transfer', 'production'
  reference_id UUID,
  performed_by UUID REFERENCES staff(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inventory audits
CREATE TABLE IF NOT EXISTS inventory_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID REFERENCES warehouses(id),
  audit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  performed_by UUID REFERENCES staff(id),
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'discrepancy_found')),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_audit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES inventory_audits(id) ON DELETE CASCADE,
  bottle_size TEXT,
  bottle_status TEXT,
  expected_qty INTEGER,
  actual_qty INTEGER,
  discrepancy INTEGER GENERATED ALWAYS AS (actual_qty - expected_qty) STORED,
  notes TEXT
);

-- ============================================================
-- SECTION 8: FINANCE & ACCOUNTING
-- ============================================================

-- Chart of accounts
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  subtype TEXT,
  parent_id UUID REFERENCES chart_of_accounts(id),
  active BOOLEAN DEFAULT true
);

-- Default chart of accounts for Kembali
INSERT INTO chart_of_accounts (code, name, type, subtype) VALUES
  ('1000', 'Cash', 'asset', 'current'),
  ('1100', 'Accounts Receivable', 'asset', 'current'),
  ('1200', 'Bottle Inventory', 'asset', 'current'),
  ('1300', 'Prepaid Expenses', 'asset', 'current'),
  ('1500', 'Vehicles', 'asset', 'fixed'),
  ('1510', 'Accumulated Depreciation - Vehicles', 'asset', 'fixed'),
  ('2000', 'Accounts Payable', 'liability', 'current'),
  ('2100', 'Deposits Held (Bottle Deposits)', 'liability', 'current'),
  ('2200', 'Accrued Expenses', 'liability', 'current'),
  ('3000', 'Owner Equity', 'equity', null),
  ('4000', 'Water Sales - 350ml', 'revenue', 'sales'),
  ('4001', 'Water Sales - 750ml', 'revenue', 'sales'),
  ('4100', 'Lost Bottle Charges', 'revenue', 'other'),
  ('4200', 'Delivery Fees', 'revenue', 'other'),
  ('5000', 'Cost of Goods Sold', 'expense', 'cogs'),
  ('5100', 'Driver Wages', 'expense', 'payroll'),
  ('5200', 'Vehicle Fuel', 'expense', 'fleet'),
  ('5300', 'Vehicle Maintenance', 'expense', 'fleet'),
  ('5400', 'Bottle Replacement', 'expense', 'operations'),
  ('6000', 'General & Administrative', 'expense', 'overhead'),
  ('6100', 'Marketing', 'expense', 'overhead')
ON CONFLICT (code) DO NOTHING;

-- Enhanced invoices
DO $$ BEGIN
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000001';
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS address_id UUID REFERENCES customer_addresses(id);
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER DEFAULT 30;
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'IDR';
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_start DATE;
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS period_end DATE;
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Payments received
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  invoice_id UUID REFERENCES invoices(id),
  amount DECIMAL(15,2) NOT NULL,
  currency TEXT DEFAULT 'IDR',
  method TEXT NOT NULL CHECK (method IN ('bank_transfer', 'cash', 'credit_card', 'qris', 'cheque', 'other')),
  reference TEXT, -- bank ref number, cheque number
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  category TEXT NOT NULL CHECK (category IN ('fuel', 'maintenance', 'payroll', 'supplies', 'marketing', 'rent', 'utilities', 'other')),
  account_id UUID REFERENCES chart_of_accounts(id),
  description TEXT NOT NULL,
  vendor TEXT,
  amount DECIMAL(15,2) NOT NULL,
  currency TEXT DEFAULT 'IDR',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  approved_by UUID REFERENCES staff(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  vehicle_id UUID REFERENCES vehicles(id),
  driver_id UUID REFERENCES staff(id),
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SECTION 9: HR & PAYROLL
-- ============================================================

-- PTO requests
CREATE TABLE IF NOT EXISTS pto_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES staff(id) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('annual', 'sick', 'personal', 'unpaid', 'public_holiday')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days DECIMAL(4,1),
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approved_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Payroll runs
CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'approved', 'paid')),
  total_gross DECIMAL(15,2) DEFAULT 0,
  total_deductions DECIMAL(15,2) DEFAULT 0,
  total_net DECIMAL(15,2) DEFAULT 0,
  approved_by UUID REFERENCES staff(id),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES staff(id) NOT NULL,
  base_salary DECIMAL(15,2) DEFAULT 0,
  allowances DECIMAL(15,2) DEFAULT 0,
  overtime DECIMAL(15,2) DEFAULT 0,
  bonus DECIMAL(15,2) DEFAULT 0,
  deductions DECIMAL(15,2) DEFAULT 0,
  tax DECIMAL(15,2) DEFAULT 0,
  net_pay DECIMAL(15,2) DEFAULT 0,
  days_worked INTEGER DEFAULT 0,
  days_absent INTEGER DEFAULT 0,
  notes TEXT
);

-- ============================================================
-- SECTION 10: CRM & SALES
-- ============================================================

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id),
  name TEXT NOT NULL,
  company TEXT,
  type TEXT CHECK (type IN ('hotel', 'restaurant', 'resort', 'cafe', 'office', 'retail', 'business', 'other')),
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT DEFAULT 'Bali',
  source TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  estimated_value DECIMAL(15,2),
  estimated_monthly_value DECIMAL(15,2),
  probability INTEGER DEFAULT 50,
  estimated_350ml INTEGER DEFAULT 0,
  estimated_750ml INTEGER DEFAULT 0,
  assigned_to UUID REFERENCES staff(id),
  converted_customer_id UUID REFERENCES customers(id),
  lost_reason TEXT,
  notes TEXT,
  next_follow_up DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('call', 'email', 'whatsapp', 'meeting', 'site_visit', 'proposal_sent', 'follow_up', 'note')),
  summary TEXT NOT NULL,
  outcome TEXT,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SECTION 11: BOTTLE CUSTOMER BALANCE (Enhanced View)
-- ============================================================

DROP VIEW IF EXISTS customer_bottle_balance;
CREATE VIEW customer_bottle_balance AS
SELECT
  c.id AS customer_id,
  c.name AS customer_name,
  c.type AS customer_type,
  c.city,
  COALESCE(SUM(d.delivered_350ml), 0) AS total_delivered_350ml,
  COALESCE(SUM(d.collected_350ml), 0) AS total_returned_350ml,
  COALESCE(SUM(d.damaged_350ml), 0) AS total_damaged_350ml,
  COALESCE(SUM(d.delivered_350ml), 0) - COALESCE(SUM(d.collected_350ml), 0) AS outstanding_350ml,
  COALESCE(SUM(d.delivered_750ml), 0) AS total_delivered_750ml,
  COALESCE(SUM(d.collected_750ml), 0) AS total_returned_750ml,
  COALESCE(SUM(d.damaged_750ml), 0) AS total_damaged_750ml,
  COALESCE(SUM(d.delivered_750ml), 0) - COALESCE(SUM(d.collected_750ml), 0) AS outstanding_750ml,
  ROUND(COALESCE(SUM(d.delivered_350ml), 0) * 0.08) AS threshold_350ml,
  ROUND(COALESCE(SUM(d.delivered_750ml), 0) * 0.08) AS threshold_750ml,
  GREATEST(0, COALESCE(SUM(d.delivered_350ml), 0) - COALESCE(SUM(d.collected_350ml), 0) - ROUND(COALESCE(SUM(d.delivered_350ml), 0) * 0.08)) AS chargeable_lost_350ml,
  GREATEST(0, COALESCE(SUM(d.delivered_750ml), 0) - COALESCE(SUM(d.collected_750ml), 0) - ROUND(COALESCE(SUM(d.delivered_750ml), 0) * 0.08)) AS chargeable_lost_750ml
FROM customers c
LEFT JOIN deliveries d ON d.customer_id = c.id AND d.status = 'completed'
GROUP BY c.id, c.name, c.type, c.city;

-- ============================================================
-- SECTION 12: FULL-TEXT SEARCH INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(type);
CREATE INDEX IF NOT EXISTS idx_deliveries_date ON deliveries(delivery_date);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_customer ON deliveries(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ============================================================
-- SECTION 13: ROW LEVEL SECURITY (Anon access for now)
-- ============================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('schema_migrations')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_all" ON %I', t);
    EXECUTE format('CREATE POLICY "anon_all" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- Grant view access
GRANT SELECT ON customer_bottle_balance TO anon;

-- ============================================================
-- DONE
-- ============================================================
