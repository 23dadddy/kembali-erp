'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { Plus, X, Save, RefreshCw, Users, Settings, CheckCircle, AlertCircle, Zap, ArrowLeft } from 'lucide-react'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ZONES = [
  { value: 'North Canggu',   label: 'North Canggu',   sub: 'Canggu · Berawa · Pererenan' },
  { value: 'South Seminyak', label: 'South Seminyak', sub: 'Seminyak · Legian · Kuta' },
  { value: 'Ubud & Central', label: 'Ubud & Central', sub: 'Ubud · Tabanan · Denpasar' },
  { value: 'South Bali',     label: 'South Bali',     sub: 'Nusa Dua · Jimbaran · Uluwatu' },
  { value: 'East Bali',      label: 'East Bali',      sub: 'Sanur · Ketewel · Keramas' },
]

const ALL_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

type Rep = {
  id?: string
  name: string
  area_cluster: string
  active: boolean
  active_days: string[]
  phone: string
  isNew?: boolean
}

type RouteSettings = {
  id?: string
  stops_per_rep: number
  auto_generate: boolean
  require_manager_confirm: boolean
}

type StaffMember = { id: string; name: string; phone: string | null; role: string }

export default function SalesSettingsPage() {
  const router = useRouter()
  const [reps, setReps] = useState<Rep[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [settings, setSettings] = useState<RouteSettings>({
    stops_per_rep: 20,
    auto_generate: true,
    require_manager_confirm: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [testingCron, setTestingCron] = useState(false)
  const [cronResult, setCronResult] = useState<any>(null)
  const [needsMigration, setNeedsMigration] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [repsRes, settingsRes, staffRes] = await Promise.all([
      sb.from('sales_reps').select('*').order('created_at'),
      sb.from('sales_route_settings').select('*').order('updated_at', { ascending: false }).limit(1).single(),
      sb.from('staff').select('id, name, phone, role').eq('active', true).order('name'),
    ])

    if (repsRes.error?.message?.includes('does not exist') || settingsRes.error?.message?.includes('does not exist')) {
      setNeedsMigration(true)
      setLoading(false)
      return
    }

    setReps(repsRes.data ?? [])
    if (settingsRes.data) setSettings(settingsRes.data)
    setStaffList(staffRes.data ?? [])
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      // Save reps
      for (const rep of reps) {
        const { isNew, ...repData } = rep as any
        if (isNew) {
          await sb.from('sales_reps').insert({ name: repData.name, area_cluster: repData.area_cluster, active: repData.active, active_days: repData.active_days, phone: repData.phone || null })
        } else if (repData.id) {
          await sb.from('sales_reps').update({ name: repData.name, area_cluster: repData.area_cluster, active: repData.active, active_days: repData.active_days, phone: repData.phone || null }).eq('id', repData.id)
        }
      }

      // Save route settings
      if (settings.id) {
        await sb.from('sales_route_settings').update({ stops_per_rep: settings.stops_per_rep, auto_generate: settings.auto_generate, require_manager_confirm: settings.require_manager_confirm, updated_at: new Date().toISOString() }).eq('id', settings.id)
      } else {
        await sb.from('sales_route_settings').insert({ stops_per_rep: settings.stops_per_rep, auto_generate: settings.auto_generate, require_manager_confirm: settings.require_manager_confirm })
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      await load()
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  async function deleteRep(rep: Rep) {
    if (rep.isNew) {
      setReps(r => r.filter(x => x !== rep))
      return
    }
    if (!rep.id) return
    await sb.from('sales_reps').delete().eq('id', rep.id)
    await load()
  }

  function addRep() {
    // Find staff members not already added as reps
    const existingNames = reps.map(r => r.name)
    const available = staffList.filter(s => !existingNames.includes(s.name))
    const first = available[0]
    setReps(r => [...r, {
      name: first?.name ?? '',
      area_cluster: ZONES[r.length % ZONES.length].value,
      active: true,
      active_days: ['monday','tuesday','wednesday','thursday','friday'],
      phone: first?.phone ?? '',
      isNew: true,
    }])
  }

  function updateRep(idx: number, field: keyof Rep, value: any) {
    setReps(r => r.map((rep, i) => i === idx ? { ...rep, [field]: value } : rep))
  }

  function toggleDay(repIdx: number, day: string) {
    setReps(r => r.map((rep, i) => {
      if (i !== repIdx) return rep
      const days = rep.active_days.includes(day)
        ? rep.active_days.filter(d => d !== day)
        : [...rep.active_days, day]
      return { ...rep, active_days: days }
    }))
  }

  async function testCron() {
    setTestingCron(true)
    setCronResult(null)
    try {
      const res = await fetch('/api/sales/cron-generate')
      const data = await res.json()
      setCronResult(data)
    } catch (e: any) {
      setCronResult({ error: e.message })
    }
    setTestingCron(false)
  }

  const totalDailyStops = reps.filter(r => r.active).length * settings.stops_per_rep

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-400">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
    </div>
  )

  if (needsMigration) return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
        <h2 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" /> Database migration required
        </h2>
        <p className="text-sm text-amber-700 mb-4">Run this SQL in your Supabase SQL editor to enable sales rep settings:</p>
        <pre className="bg-white border rounded-xl p-4 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">
{`CREATE TABLE IF NOT EXISTS sales_reps (
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

INSERT INTO sales_route_settings (stops_per_rep, auto_generate, require_manager_confirm)
VALUES (20, true, false);

ALTER TABLE sales_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_route_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_reps_all" ON sales_reps FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sales_route_settings_all" ON sales_route_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);`}
        </pre>
        <button onClick={load} className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700">
          Check Again
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()}
            className="p-2 text-gray-500 border rounded-lg hover:bg-gray-50">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Sales Route Settings</h1>
            <p className="text-sm text-gray-500">Manage reps, zones, and daily auto-generate</p>
          </div>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
          {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : saved ? <><CheckCircle className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save Settings</>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-3xl">

        {/* Route settings */}
        <div className="bg-white border rounded-2xl p-6 space-y-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-400" /> Route Settings
          </h2>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stops per rep per day</label>
              <input
                type="number" min={5} max={50}
                value={settings.stops_per_rep}
                onChange={e => setSettings(s => ({ ...s, stops_per_rep: Number(e.target.value) }))}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">{totalDailyStops} total stops/day across {reps.filter(r=>r.active).length} active reps</p>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Auto-generate options</label>
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => setSettings(s => ({ ...s, auto_generate: !s.auto_generate }))}>
                <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${settings.auto_generate ? 'bg-blue-600' : 'bg-gray-200'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-[left] duration-200 ${settings.auto_generate ? 'left-6' : 'left-1'}`} />
                </div>
                <span className="text-sm text-gray-700">Auto-generate daily at 5 AM Bali time</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => setSettings(s => ({ ...s, require_manager_confirm: !s.require_manager_confirm }))}>
                <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${settings.require_manager_confirm ? 'bg-blue-600' : 'bg-gray-200'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-[left] duration-200 ${settings.require_manager_confirm ? 'left-6' : 'left-1'}`} />
                </div>
                <span className="text-sm text-gray-700">Require manager to confirm routes before reps see them</span>
              </label>
            </div>
          </div>
        </div>

        {/* Reps */}
        <div className="bg-white border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-400" /> Sales Reps ({reps.length})
            </h2>
            <button onClick={addRep}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100">
              <Plus className="w-4 h-4" /> Add Rep
            </button>
          </div>

          {reps.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No reps yet. Add your first sales rep.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reps.map((rep, idx) => (
                <div key={rep.id ?? idx} className={`border rounded-xl p-4 space-y-3 ${!rep.active ? 'bg-gray-50 opacity-70' : 'bg-white'}`}>
                  <div className="flex items-center gap-3">
                    {/* Active toggle */}
                    <div onClick={() => updateRep(idx, 'active', !rep.active)}
                      className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${rep.active ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all ${rep.active ? 'left-4' : 'left-0.5'}`} />
                    </div>

                    <select
                      value={rep.name}
                      onChange={e => {
                        const staff = staffList.find(s => s.name === e.target.value)
                        setReps(r => r.map((x, i) => i === idx ? { ...x, name: e.target.value, phone: staff?.phone ?? x.phone } : x))
                      }}
                      className="flex-1 text-sm font-medium border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Select staff member —</option>
                      {staffList.map(s => (
                        <option key={s.id} value={s.name}
                          disabled={reps.some((r, i) => i !== idx && r.name === s.name)}>
                          {s.name}{s.role ? ` (${s.role})` : ''}
                        </option>
                      ))}
                    </select>

                    <button onClick={() => deleteRep(rep)} className="p-2 text-gray-400 hover:text-red-500 flex-shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-500 w-10 flex-shrink-0">Zone</label>
                    <select
                      value={rep.area_cluster}
                      onChange={e => updateRep(idx, 'area_cluster', e.target.value)}
                      className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {ZONES.map(z => (
                        <option key={z.value} value={z.value}>{z.label} — {z.sub}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-500 w-10 flex-shrink-0">Days</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {ALL_DAYS.map(day => (
                        <button
                          key={day}
                          onClick={() => toggleDay(idx, day)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${rep.active_days.includes(day) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                        >
                          {day.slice(0, 3).charAt(0).toUpperCase() + day.slice(1, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Test / Manual trigger */}
        <div className="bg-white border rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Manual Trigger</h2>
          <p className="text-sm text-gray-500 mb-4">Run today's auto-generate right now to test it, or to generate routes manually.</p>
          <button onClick={testCron} disabled={testingCron}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
            {testingCron ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</> : <><Zap className="w-4 h-4" /> Generate Today's Routes Now</>}
          </button>

          {cronResult && (
            <div className={`mt-4 rounded-xl p-4 text-sm ${cronResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
              {cronResult.error ? (
                <p>Error: {cronResult.error}</p>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium">{cronResult.message}</p>
                  {cronResult.total_assigned !== undefined && (
                    <p className="text-xs opacity-80">{cronResult.total_assigned} leads assigned across {cronResult.reps} reps · {cronResult.stops_per_rep} stops each</p>
                  )}
                  {cronResult.skipped && <p className="text-xs opacity-80">Routes already existed for today — no changes made.</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}
      </div>
    </div>
  )
}
