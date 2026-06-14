export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { TrendingUp, Users, MapPin, ClipboardCheck, DollarSign, Target, ArrowUpRight, Calendar } from 'lucide-react'
import Link from 'next/link'

export default async function SalesDashboardPage() {
  const sb = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // Check if tables exist
  const { data: leads, error: leadsErr } = await sb.from('sales_leads').select('id, stage, estimated_value')
  const { data: routes } = await sb.from('sales_routes').select('id, status, date').eq('date', today)
  const { data: visits } = await sb.from('sales_visits').select('id, outcome, visited_at').gte('visited_at', `${today}T00:00:00`)
  const { data: allVisits } = await sb.from('sales_visits').select('id, outcome').not('outcome', 'is', null)

  const tablesReady = !leadsErr

  if (!tablesReady) {
    return (
      <>
        <Topbar title="Sales CRM" />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-lg">
            <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-8 h-8 text-orange-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Database Setup Required</h2>
            <p className="text-gray-500 mb-4 text-sm">Run the following SQL in your Supabase dashboard SQL editor to set up the Sales CRM tables.</p>
            <div className="text-left bg-gray-900 text-green-400 rounded-xl p-4 text-xs font-mono overflow-auto max-h-64">
              {`CREATE TABLE IF NOT EXISTS sales_leads (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_name TEXT NOT NULL, contact_name TEXT, contact_email TEXT, contact_phone TEXT, address TEXT, lat NUMERIC, lng NUMERIC, stage TEXT NOT NULL DEFAULT 'prospect', source TEXT, industry TEXT, estimated_value NUMERIC DEFAULT 0, assigned_to UUID, notes TEXT, last_contacted_at TIMESTAMPTZ, next_follow_up DATE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS sales_routes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, date DATE NOT NULL, salesperson_id UUID, status TEXT DEFAULT 'planned', notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS sales_route_stops (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), route_id UUID REFERENCES sales_routes(id) ON DELETE CASCADE, lead_id UUID REFERENCES sales_leads(id) ON DELETE CASCADE, order_index INTEGER NOT NULL DEFAULT 0, status TEXT DEFAULT 'pending', arrived_at TIMESTAMPTZ, departed_at TIMESTAMPTZ, notes TEXT);
CREATE TABLE IF NOT EXISTS sales_visits (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lead_id UUID REFERENCES sales_leads(id) ON DELETE CASCADE, staff_id UUID, route_stop_id UUID, visited_at TIMESTAMPTZ DEFAULT NOW(), outcome TEXT, notes TEXT, next_action TEXT, next_action_date DATE, duration_minutes INTEGER, created_at TIMESTAMPTZ DEFAULT NOW());
ALTER TABLE sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_leads_all" ON sales_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_routes_all" ON sales_routes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_route_stops_all" ON sales_route_stops FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_visits_all" ON sales_visits FOR ALL TO authenticated USING (true) WITH CHECK (true);`}
            </div>
          </div>
        </div>
      </>
    )
  }

  const allLeads = leads ?? []
  const stages = ['prospect', 'contacted', 'meeting', 'proposal', 'negotiation', 'closed_won', 'closed_lost']
  const stageCounts: Record<string, number> = {}
  for (const s of stages) stageCounts[s] = allLeads.filter(l => l.stage === s).length
  const totalValue = allLeads.filter(l => l.stage !== 'closed_lost').reduce((s, l) => s + Number(l.estimated_value || 0), 0)
  const wonValue = allLeads.filter(l => l.stage === 'closed_won').reduce((s, l) => s + Number(l.estimated_value || 0), 0)
  const wonCount = stageCounts['closed_won'] ?? 0
  const totalContacted = allLeads.filter(l => l.stage !== 'prospect').length
  const conversionRate = totalContacted > 0 ? Math.round((wonCount / totalContacted) * 100) : 0

  const todayRoutes = routes ?? []
  const todayVisits = visits ?? []

  const outcomes = (allVisits ?? []).map(v => v.outcome)
  const positiveOutcomes = outcomes.filter(o => o && ['interested', 'follow_up', 'closed_won', 'proposal'].includes(o)).length

  const cards = [
    { label: 'Total Leads', value: allLeads.length, icon: Users, color: '#5BA3A0', bg: '#EBF7F7', href: '/sales/leads' },
    { label: 'Pipeline Value', value: `$${totalValue.toLocaleString()}`, icon: DollarSign, color: '#6366F1', bg: '#EEF2FF', href: '/sales/leads' },
    { label: "Today's Routes", value: todayRoutes.length, icon: MapPin, color: '#F59E0B', bg: '#FEF3C7', href: '/sales/routes' },
    { label: 'Visits Today', value: todayVisits.length, icon: ClipboardCheck, color: '#10B981', bg: '#D1FAE5', href: '/sales/reports' },
    { label: 'Closed Won', value: wonCount, icon: Target, color: '#EC4899', bg: '#FCE7F3', href: '/sales/leads' },
    { label: 'Won Revenue', value: `$${wonValue.toLocaleString()}`, icon: TrendingUp, color: '#3B82F6', bg: '#DBEAFE', href: '/sales/leads' },
  ]

  return (
    <>
      <Topbar title="Sales CRM" />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {cards.map(c => (
            <Link key={c.label} href={c.href}
              className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow group">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: c.bg }}>
                  <c.icon className="w-4.5 h-4.5" style={{ color: c.color }} />
                </div>
                <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.label}</p>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pipeline funnel */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-900">Pipeline Stages</h3>
              <Link href="/sales/leads" className="text-xs text-[#5BA3A0] hover:underline font-medium">View all →</Link>
            </div>
            <div className="space-y-3">
              {[
                { key: 'prospect', label: 'Prospect', color: '#94A3B8' },
                { key: 'contacted', label: 'Contacted', color: '#60A5FA' },
                { key: 'meeting', label: 'Meeting Set', color: '#A78BFA' },
                { key: 'proposal', label: 'Proposal Sent', color: '#F59E0B' },
                { key: 'negotiation', label: 'Negotiation', color: '#F97316' },
                { key: 'closed_won', label: 'Closed Won', color: '#10B981' },
              ].map(s => {
                const cnt = stageCounts[s.key] ?? 0
                const pct = allLeads.length > 0 ? Math.round((cnt / allLeads.length) * 100) : 0
                return (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-28 flex-shrink-0">{s.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: s.color }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-8 text-right">{cnt}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick stats */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm">Conversion Rate</h3>
              <div className="text-4xl font-bold text-gray-900">{conversionRate}%</div>
              <p className="text-xs text-gray-400 mt-1">{wonCount} won of {totalContacted} contacted</p>
              <div className="mt-3 bg-gray-100 rounded-full h-2">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${conversionRate}%` }} />
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm">Quick Links</h3>
              <div className="space-y-2">
                {[
                  { href: '/sales/leads', label: 'Leads Pipeline', icon: Users },
                  { href: '/sales/routes', label: 'Daily Routes', icon: MapPin },
                  { href: '/sales/reports', label: 'Visit Reports', icon: ClipboardCheck },
                ].map(l => (
                  <Link key={l.href} href={l.href}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                    <div className="w-7 h-7 rounded-lg bg-[#EBF7F7] flex items-center justify-center">
                      <l.icon className="w-3.5 h-3.5 text-[#5BA3A0]" />
                    </div>
                    <span className="text-sm text-gray-700 font-medium">{l.label}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 ml-auto" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
