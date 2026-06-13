-- Add reply_to_id to chat_messages
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL;

-- Add avatar_url to staff
ALTER TABLE staff ADD COLUMN IF NOT EXISTS avatar_url text;

CREATE INDEX IF NOT EXISTS chat_messages_reply_idx ON chat_messages(reply_to_id);
