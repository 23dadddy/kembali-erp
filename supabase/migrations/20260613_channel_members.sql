-- Channel membership control
CREATE TABLE IF NOT EXISTS channel_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id text NOT NULL,
  staff_id uuid REFERENCES staff(id) ON DELETE CASCADE NOT NULL,
  added_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, staff_id)
);

ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channel_members_select" ON channel_members FOR SELECT USING (true);
CREATE POLICY "channel_members_insert" ON channel_members FOR INSERT WITH CHECK (true);
CREATE POLICY "channel_members_delete" ON channel_members FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS channel_members_channel_idx ON channel_members(channel_id);
CREATE INDEX IF NOT EXISTS channel_members_staff_idx ON channel_members(staff_id);
