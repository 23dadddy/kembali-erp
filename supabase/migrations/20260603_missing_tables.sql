-- ============================================================
-- Missing tables needed for full ERP functionality
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. attendance_logs (Attendance module)
CREATE TABLE IF NOT EXISTS attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES staff(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'half_day', 'leave')),
  clock_in timestamptz,
  clock_out timestamptz,
  hours_worked numeric(4,1),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_logs_staff_date_key ON attendance_logs(staff_id, date);
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_attendance" ON attendance_logs;
CREATE POLICY "allow_all_attendance" ON attendance_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. expense_claims (Expenses module — separate from expenses table)
CREATE TABLE IF NOT EXISTS expense_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'other',
  amount numeric(12,2) NOT NULL,
  description text NOT NULL,
  expense_date date NOT NULL,
  notes text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  approved_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  approved_at timestamptz,
  paid_at timestamptz,
  receipt_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_expense_claims" ON expense_claims;
CREATE POLICY "allow_all_expense_claims" ON expense_claims FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. production_runs (Production module)
CREATE TABLE IF NOT EXISTS production_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  shift text DEFAULT 'morning' CHECK (shift IN ('morning', 'afternoon', 'night')),
  filled_350ml int DEFAULT 0,
  filled_750ml int DEFAULT 0,
  rejected_350ml int DEFAULT 0,
  rejected_750ml int DEFAULT 0,
  water_liters numeric(8,2) DEFAULT 0,
  operator_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  quality_check boolean DEFAULT false,
  quality_notes text,
  batch_number text,
  notes text,
  status text DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed', 'rejected')),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE production_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_production_runs" ON production_runs;
CREATE POLICY "allow_all_production_runs" ON production_runs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. cleaning_batches (Production — cleaning tab)
CREATE TABLE IF NOT EXISTS cleaning_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_date date NOT NULL,
  cleaned_350ml int DEFAULT 0,
  cleaned_750ml int DEFAULT 0,
  rejected_350ml int DEFAULT 0,
  rejected_750ml int DEFAULT 0,
  cleaning_agent text,
  operator_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  notes text,
  status text DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed')),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cleaning_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_cleaning_batches" ON cleaning_batches;
CREATE POLICY "allow_all_cleaning_batches" ON cleaning_batches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. app_settings (Settings module — key/value store)
CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_app_settings" ON app_settings;
CREATE POLICY "allow_all_app_settings" ON app_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Insert default invoice settings
INSERT INTO app_settings (key, value) VALUES (
  'invoice',
  '{"company_name": "PT Kembali Air Bali", "bank_name": "BCA", "bank_account": "123-456-7890", "bank_holder": "PT Kembali Air Bali", "footer_note": "Thank you for choosing Kembali Water! Please transfer to the account above and send proof of payment.", "payment_terms": 30, "invoice_prefix": "INV"}'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- 6. kpi_targets (Settings — KPI tracking)
CREATE TABLE IF NOT EXISTS kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric text NOT NULL,
  period text NOT NULL, -- YYYY-MM
  target numeric(15,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (metric, period)
);
ALTER TABLE kpi_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_kpi_targets" ON kpi_targets;
CREATE POLICY "allow_all_kpi_targets" ON kpi_targets FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 7. credit_notes (Credit Notes module)
CREATE TABLE IF NOT EXISTS credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  reason text NOT NULL,
  notes text,
  status text DEFAULT 'issued' CHECK (status IN ('issued', 'applied', 'voided')),
  issued_at timestamptz DEFAULT now(),
  applied_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_credit_notes" ON credit_notes;
CREATE POLICY "allow_all_credit_notes" ON credit_notes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 8. purchase_orders + po_items (Purchase Orders module)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  vendor_name text NOT NULL,
  vendor_contact text,
  vendor_email text,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partially_received', 'received', 'cancelled')),
  subtotal numeric(12,2) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  total numeric(12,2) DEFAULT 0,
  expected_date date,
  received_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS po_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  unit text DEFAULT 'unit',
  unit_price numeric(12,2) DEFAULT 0,
  total numeric(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  received_qty numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_pos" ON purchase_orders;
CREATE POLICY "allow_all_pos" ON purchase_orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_po_items" ON po_items;
CREATE POLICY "allow_all_po_items" ON po_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 9. WhatsApp tables (Communications module)
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  contact_name text,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  last_message text,
  last_message_at timestamptz,
  unread_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversations_phone_key ON whatsapp_conversations(phone);
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES whatsapp_conversations(id) ON DELETE CASCADE NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text NOT NULL,
  status text DEFAULT 'sent' CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed', 'received')),
  twilio_sid text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_messages_conv_idx ON whatsapp_messages(conversation_id, created_at);
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_wa_conv" ON whatsapp_conversations;
CREATE POLICY "allow_all_wa_conv" ON whatsapp_conversations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_wa_msgs" ON whatsapp_messages;
CREATE POLICY "allow_all_wa_msgs" ON whatsapp_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 10. gmail_tokens (Gmail OAuth — if not already created)
CREATE TABLE IF NOT EXISTS gmail_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES staff(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text,
  expiry_date bigint,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_gmail_tokens" ON gmail_tokens;
CREATE POLICY "allow_all_gmail_tokens" ON gmail_tokens FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
