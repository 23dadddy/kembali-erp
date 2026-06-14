import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const sql = `
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
      assigned_to UUID,
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
      salesperson_id UUID,
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
      staff_id UUID,
      route_stop_id UUID,
      visited_at TIMESTAMPTZ DEFAULT NOW(),
      outcome TEXT,
      notes TEXT,
      next_action TEXT,
      next_action_date DATE,
      duration_minutes INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE sales_leads ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sales_routes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sales_route_stops ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sales_visits ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sales_leads' AND policyname='sales_leads_all') THEN
        CREATE POLICY "sales_leads_all" ON sales_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sales_routes' AND policyname='sales_routes_all') THEN
        CREATE POLICY "sales_routes_all" ON sales_routes FOR ALL TO authenticated USING (true) WITH CHECK (true);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sales_route_stops' AND policyname='sales_route_stops_all') THEN
        CREATE POLICY "sales_route_stops_all" ON sales_route_stops FOR ALL TO authenticated USING (true) WITH CHECK (true);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sales_visits' AND policyname='sales_visits_all') THEN
        CREATE POLICY "sales_visits_all" ON sales_visits FOR ALL TO authenticated USING (true) WITH CHECK (true);
      END IF;
    END $$;
  `
  const { error } = await sb.rpc('exec', { sql }) as any

  // Fallback: just test if tables exist
  const { error: e2 } = await sb.from('sales_leads').select('id').limit(1)
  if (!e2) return NextResponse.json({ ok: true, message: 'Tables already exist' })

  return NextResponse.json({ ok: false, message: 'Run the SQL migration manually in Supabase dashboard', sql })
}
