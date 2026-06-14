-- Sales CRM v2: add missing columns and activities table

-- Extended columns on sales_leads
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS area TEXT;
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS assigned_rep TEXT;
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS google_place_id TEXT;

-- completed_at on route stops (departed_at already exists, reuse or add new)
ALTER TABLE sales_route_stops ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Activity log: every touchpoint across all channels
CREATE TABLE IF NOT EXISTS sales_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES sales_leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'visit',
  outcome TEXT,
  notes TEXT,
  activity_date TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sales_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_activities_all" ON sales_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes for performance on 10k+ rows
CREATE INDEX IF NOT EXISTS idx_sales_leads_stage ON sales_leads(stage);
CREATE INDEX IF NOT EXISTS idx_sales_leads_area ON sales_leads(area);
CREATE INDEX IF NOT EXISTS idx_sales_leads_business_type ON sales_leads(business_type);
CREATE INDEX IF NOT EXISTS idx_sales_leads_priority ON sales_leads(priority);
CREATE INDEX IF NOT EXISTS idx_sales_leads_last_contacted ON sales_leads(last_contacted_at);
CREATE INDEX IF NOT EXISTS idx_sales_leads_next_follow_up ON sales_leads(next_follow_up);
CREATE INDEX IF NOT EXISTS idx_sales_activities_lead_id ON sales_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_routes_date ON sales_routes(date);
