-- Kembali Water ERP Schema
-- Run this entire file in Supabase SQL Editor → New Query → Run

-- Customers (hotels, restaurants, resorts, businesses)
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('hotel', 'restaurant', 'resort', 'business', 'other')),
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Drivers / Staff
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('driver', 'cleaner', 'manager', 'admin')),
  phone TEXT,
  email TEXT UNIQUE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Delivery Routes
CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  driver_id UUID REFERENCES staff(id),
  day_of_week TEXT[],
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Route stops
CREATE TABLE IF NOT EXISTS route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID REFERENCES routes(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  stop_order INTEGER NOT NULL,
  notes TEXT
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('standing', 'one_off')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'delivered', 'cancelled')),
  qty_350ml INTEGER DEFAULT 0,
  qty_750ml INTEGER DEFAULT 0,
  scheduled_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Deliveries
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  driver_id UUID REFERENCES staff(id),
  route_id UUID REFERENCES routes(id),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'completed', 'failed')),
  delivered_350ml INTEGER DEFAULT 0,
  delivered_750ml INTEGER DEFAULT 0,
  collected_350ml INTEGER DEFAULT 0,
  collected_750ml INTEGER DEFAULT 0,
  driver_notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bottle inventory
CREATE TABLE IF NOT EXISTS bottle_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bottle_size TEXT NOT NULL CHECK (bottle_size IN ('350ml', '750ml')),
  status TEXT NOT NULL CHECK (status IN ('filled', 'at_customer', 'dirty', 'cleaning', 'clean_empty', 'damaged', 'lost')),
  quantity INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bottle_size, status)
);

-- Inventory adjustments log
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bottle_size TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  reason TEXT,
  staff_id UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  invoice_number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Invoice line items
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  delivery_id UUID REFERENCES deliveries(id),
  description TEXT NOT NULL,
  bottle_size TEXT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- Pricing
CREATE TABLE IF NOT EXISTS pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bottle_size TEXT NOT NULL CHECK (bottle_size IN ('350ml', '750ml')),
  price_per_unit DECIMAL(10,2) NOT NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  active BOOLEAN DEFAULT true
);

-- ── Seed data ─────────────────────────────────────────────────────────────────

-- Bottle inventory initial rows (safe to re-run)
INSERT INTO bottle_inventory (bottle_size, status, quantity)
VALUES
  ('350ml', 'filled', 0),
  ('350ml', 'at_customer', 0),
  ('350ml', 'dirty', 0),
  ('350ml', 'cleaning', 0),
  ('350ml', 'clean_empty', 0),
  ('350ml', 'damaged', 0),
  ('750ml', 'filled', 0),
  ('750ml', 'at_customer', 0),
  ('750ml', 'dirty', 0),
  ('750ml', 'cleaning', 0),
  ('750ml', 'clean_empty', 0),
  ('750ml', 'damaged', 0)
ON CONFLICT (bottle_size, status) DO NOTHING;

-- Kembali Water pricing (IDR)
INSERT INTO pricing (bottle_size, price_per_unit, active)
VALUES
  ('350ml', 6000, true),
  ('750ml', 10000, true)
ON CONFLICT DO NOTHING;

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE bottle_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DO $$ BEGIN
  EXECUTE (
    SELECT string_agg('DROP POLICY IF EXISTS "' || policyname || '" ON ' || tablename || ';', E'\n')
    FROM pg_policies
    WHERE schemaname = 'public'
  );
END $$;

-- Allow full access via anon key (internal tool — no login required yet)
CREATE POLICY "Anon full access" ON customers       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON staff           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON routes          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON route_stops     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON orders          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON deliveries      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON bottle_inventory FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON inventory_adjustments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON invoices        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON invoice_items   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access" ON pricing         FOR ALL TO anon USING (true) WITH CHECK (true);
