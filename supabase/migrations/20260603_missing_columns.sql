-- ============================================================
-- Missing columns needed for full app functionality
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- customers: portal_enabled (customer portal login), auth_user_id (linked Supabase user)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS portal_enabled boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- staff: auth_user_id (for linking staff to Supabase auth), crm_role, license fields
ALTER TABLE staff ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS salary_type text DEFAULT 'monthly' CHECK (salary_type IN ('monthly', 'daily', 'hourly'));
ALTER TABLE staff ADD COLUMN IF NOT EXISTS salary numeric(12,2);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS license_expiry date;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS license_number text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS crm_role text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS emergency_contact text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS bank_account text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS bank_name text;

-- deliveries: missing fields used in app
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS signature_data text;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS signature_confirmed_by text;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS driver_notes text;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS damaged_350ml int DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS damaged_750ml int DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivered_350ml int DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivered_750ml int DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS collected_350ml int DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS collected_750ml int DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES staff(id) ON DELETE SET NULL;

-- invoices: missing fields
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal numeric(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax numeric(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issue_date date DEFAULT CURRENT_DATE;

-- invoice_items: missing fields
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS bottle_size text;

-- payments: missing fields
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency text DEFAULT 'IDR';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS method text DEFAULT 'bank_transfer';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_date date DEFAULT CURRENT_DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes text;

-- support_tickets: missing fields
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS category text DEFAULT 'other';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES staff(id) ON DELETE SET NULL;

-- orders: missing fields
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bottles_350ml int DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bottles_750ml int DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_date date;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

-- vehicle_maintenance: missing fields
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS cost numeric(12,2);
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS completed_at date;
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS odometer_at_service int;

-- vehicles: missing fields
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS registration_expiry date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_expiry date;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS capacity_350ml int DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS capacity_750ml int DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS current_odometer int DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS year int;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS notes text;

-- contracts: missing fields
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS value numeric(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS auto_renew boolean DEFAULT false;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS terms text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_url text;

-- customer_subscriptions: missing fields
ALTER TABLE customer_subscriptions ADD COLUMN IF NOT EXISTS qty_350ml int DEFAULT 0;
ALTER TABLE customer_subscriptions ADD COLUMN IF NOT EXISTS qty_750ml int DEFAULT 0;
ALTER TABLE customer_subscriptions ADD COLUMN IF NOT EXISTS delivery_days text[];
ALTER TABLE customer_subscriptions ADD COLUMN IF NOT EXISTS special_instructions text;
ALTER TABLE customer_subscriptions ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE customer_subscriptions ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE customer_subscriptions ADD COLUMN IF NOT EXISTS plan_name text;
ALTER TABLE customer_subscriptions ADD COLUMN IF NOT EXISTS frequency_days int DEFAULT 7;

-- leads: missing fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage text DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS expected_value numeric(12,2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes text;

-- driver_performance: missing fields
ALTER TABLE driver_performance ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES staff(id) ON DELETE CASCADE;
ALTER TABLE driver_performance ADD COLUMN IF NOT EXISTS period_date date;
ALTER TABLE driver_performance ADD COLUMN IF NOT EXISTS deliveries_completed int DEFAULT 0;
ALTER TABLE driver_performance ADD COLUMN IF NOT EXISTS deliveries_failed int DEFAULT 0;
ALTER TABLE driver_performance ADD COLUMN IF NOT EXISTS on_time_rate numeric(5,2);
ALTER TABLE driver_performance ADD COLUMN IF NOT EXISTS bottles_delivered int DEFAULT 0;
ALTER TABLE driver_performance ADD COLUMN IF NOT EXISTS bottles_collected int DEFAULT 0;
ALTER TABLE driver_performance ADD COLUMN IF NOT EXISTS collection_rate numeric(5,2);
ALTER TABLE driver_performance ADD COLUMN IF NOT EXISTS customer_rating numeric(3,1);
ALTER TABLE driver_performance ADD COLUMN IF NOT EXISTS incidents int DEFAULT 0;
ALTER TABLE driver_performance ADD COLUMN IF NOT EXISTS fuel_used numeric(8,2);
ALTER TABLE driver_performance ADD COLUMN IF NOT EXISTS km_driven numeric(8,2);

-- promotions: missing fields
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS type text DEFAULT 'percent';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS value numeric(10,2) DEFAULT 0;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS min_order_value numeric(12,2) DEFAULT 0;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS max_uses int;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS uses_count int DEFAULT 0;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
