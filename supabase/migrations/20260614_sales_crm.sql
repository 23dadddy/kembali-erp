-- Sales CRM tables

CREATE TABLE IF NOT EXISTS sales_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  lat NUMERIC,
  lng NUMERIC,
  stage TEXT NOT NULL DEFAULT 'prospect',
  source TEXT,
  industry TEXT,
  estimated_value NUMERIC DEFAULT 0,
  assigned_to UUID REFERENCES staff(id) ON DELETE SET NULL,
  notes TEXT,
  last_contacted_at TIMESTAMPTZ,
  next_follow_up DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  salesperson_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'planned',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID REFERENCES sales_routes(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES sales_leads(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  arrived_at TIMESTAMPTZ,
  departed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS sales_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES sales_leads(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  route_stop_id UUID REFERENCES sales_route_stops(id) ON DELETE SET NULL,
  visited_at TIMESTAMPTZ DEFAULT NOW(),
  outcome TEXT,
  notes TEXT,
  next_action TEXT,
  next_action_date DATE,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: allow all authenticated users
ALTER TABLE sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_leads_all" ON sales_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_routes_all" ON sales_routes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_route_stops_all" ON sales_route_stops FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_visits_all" ON sales_visits FOR ALL TO authenticated USING (true) WITH CHECK (true);
