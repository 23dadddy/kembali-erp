-- Sales rep config and route settings

CREATE TABLE IF NOT EXISTS sales_reps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  area_cluster TEXT NOT NULL DEFAULT 'North Canggu',
  active BOOLEAN DEFAULT true,
  active_days TEXT[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday'],
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_route_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stops_per_rep INTEGER DEFAULT 20,
  auto_generate BOOLEAN DEFAULT true,
  require_manager_confirm BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed one default settings row
INSERT INTO sales_route_settings (stops_per_rep, auto_generate, require_manager_confirm)
VALUES (20, true, false)
ON CONFLICT DO NOTHING;

ALTER TABLE sales_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_route_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_reps_all" ON sales_reps FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_route_settings_all" ON sales_route_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
