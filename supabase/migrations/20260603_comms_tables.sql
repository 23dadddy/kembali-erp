-- ============================================================
-- Additional missing tables: chat, communications, documents,
-- ticket_comments, customer_documents, email_log, field history
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. chat_messages (Team Chat module)
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text,                                        -- e.g. 'general', 'drivers', null for DMs
  sender_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  recipient_id uuid REFERENCES staff(id) ON DELETE SET NULL, -- null = broadcast to channel
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_channel_idx ON chat_messages(channel, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_dm_idx ON chat_messages(sender_id, recipient_id, created_at);
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_chat" ON chat_messages;
CREATE POLICY "allow_all_chat" ON chat_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. ticket_comments (Support module)
CREATE TABLE IF NOT EXISTS ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES support_tickets(id) ON DELETE CASCADE NOT NULL,
  author_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  content text NOT NULL,
  is_internal boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx ON ticket_comments(ticket_id, created_at);
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_ticket_comments" ON ticket_comments;
CREATE POLICY "allow_all_ticket_comments" ON ticket_comments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. communications (inbound/outbound email store — used by inbound-email pipeline)
CREATE TABLE IF NOT EXISTS communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp', 'sms', 'phone')),
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  thread_id uuid,    -- self-reference for threading (set after insert)
  from_address text,
  from_name text,
  to_address text,
  subject text,
  body text,
  html_body text,
  status text DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied', 'archived')),
  external_id text,  -- Message-ID header or Gmail message ID
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS communications_customer_idx ON communications(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS communications_thread_idx ON communications(thread_id, created_at);
CREATE INDEX IF NOT EXISTS communications_external_id_idx ON communications(external_id);
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_communications" ON communications;
CREATE POLICY "allow_all_communications" ON communications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. documents (Document Library)
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  folder text DEFAULT 'General',
  notes text,
  file_url text,
  file_name text,
  file_size bigint,
  mime_type text,
  uploaded_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_documents" ON documents;
CREATE POLICY "allow_all_documents" ON documents FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. customer_documents (per-customer docs in customer detail view)
CREATE TABLE IF NOT EXISTS customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  file_url text,
  file_name text,
  file_size bigint,
  mime_type text,
  uploaded_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_documents_cust_idx ON customer_documents(customer_id);
ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_customer_docs" ON customer_documents;
CREATE POLICY "allow_all_customer_docs" ON customer_documents FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 6. customer_field_history (audit trail for customer field changes)
CREATE TABLE IF NOT EXISTS customer_field_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_field_history_cust_idx ON customer_field_history(customer_id, created_at DESC);
ALTER TABLE customer_field_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_field_history" ON customer_field_history;
CREATE POLICY "allow_all_field_history" ON customer_field_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 7. email_log (email send audit log)
CREATE TABLE IF NOT EXISTS email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  to_name text,
  subject text NOT NULL,
  template text,
  related_type text,
  related_id text,
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'bounced')),
  error text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_email_log" ON email_log;
CREATE POLICY "allow_all_email_log" ON email_log FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
