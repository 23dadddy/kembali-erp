-- WhatsApp conversations table
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

-- WhatsApp messages table
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

-- RLS
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_wa_conv" ON whatsapp_conversations;
CREATE POLICY "allow_all_wa_conv" ON whatsapp_conversations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_wa_msgs" ON whatsapp_messages;
CREATE POLICY "allow_all_wa_msgs" ON whatsapp_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
