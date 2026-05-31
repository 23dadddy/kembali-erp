'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { ChevronLeft, ChevronRight, Loader2, Package, Truck } from 'lucide-react'
import { useRouter } from 'next/navigation'

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-amber-400',
  in_transit: 'bg-blue-400',
  completed: 'bg-emerald-400',
  failed: 'bg-red-400',
  cancelled: 'bg-slate-300',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default function CalendarPage() {
  const router = useRouter()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-indexed
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(today.toISOString().split('T')[0])

  useEffect(() => { loadDeliveries() }, [year, month])

  const loadDeliveries = async () => {
    setLoading(true)
    const sb = createClient()
    const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0]
    const { data } = await sb.from('deliveries')
      .select('id, delivery_date, status, customer:customers(name), delivered_350ml, delivered_750ml, driver:staff(name)')
      .gte('delivery_date', firstDay)
      .lte('delivery_date', lastDay)
      .order('delivery_date')
    setDeliveries(data ?? [])
    setLoading(false)
  }

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  // Build calendar grid
  const firstDayOfMonth = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to complete last week
  while (cells.length % 7 !== 0) cells.push(null)

  // Group deliveries by date
  const byDate: Record<string, any[]> = {}
  deliveries.forEach(d => {
    if (!byDate[d.delivery_date]) byDate[d.delivery_date] = []
    byDate[d.delivery_date].push(d)
  })

  const dateStr = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const todayStr = today.toISOString().split('T')[0]

  const selectedDeliveries = selected ? (byDate[selected] ?? []) : []

  return (
    <>
      <Topbar title="Delivery Calendar" />
      <div className="flex h-[calc(100vh-57px)]">
        {/* Calendar */}
        <div className="flex-1 flex flex-col p-6">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            <h2 className="text-xl font-bold text-slate-800">{MONTHS[month]} {year}</h2>
            <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          {/* Summary strip */}
          <div className="flex gap-3 mb-4">
            {[
              { label: 'Total this month', value: deliveries.length, color: 'text-slate-800' },
              { label: 'Pending', value: deliveries.filter(d => d.status === 'pending').length, color: 'text-amber-600' },
              { label: 'Completed', value: deliveries.filter(d => d.status === 'completed').length, color: 'text-emerald-600' },
              { label: 'Failed', value: deliveries.filter(d => d.status === 'failed').length, color: 'text-red-600' },
            ].map(s => (
              <div key={s.label} className="bg-white border border-slate-100 rounded-xl px-4 py-2 shadow-sm">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-slate-400 py-2">{d}</div>
            ))}
          </div>

          {/* Grid */}
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
          ) : (
            <div className="grid grid-cols-7 gap-1 flex-1">
              {cells.map((day, idx) => {
                if (!day) return <div key={idx} />
                const ds = dateStr(day)
                const dayDeliveries = byDate[ds] ?? []
                const isToday = ds === todayStr
                const isSelected = ds === selected
                const isPast = ds < todayStr
                return (
                  <button key={idx} onClick={() => setSelected(ds)}
                    className={`min-h-[80px] rounded-xl p-2 text-left transition-colors border ${isSelected ? 'bg-cyan-50 border-cyan-300' : isToday ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-white border-slate-100 hover:bg-slate-50'}`}>
                    <p className={`text-sm font-semibold mb-1 ${isToday ? 'text-white' : isPast ? 'text-slate-400' : 'text-slate-700'}`}>{day}</p>
                    {dayDeliveries.slice(0, 3).map((d, i) => (
                      <div key={i} className="flex items-center gap-1 mb-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[d.status] ?? 'bg-slate-300'}`} />
                        <span className={`text-xs truncate ${isToday ? 'text-cyan-100' : 'text-slate-500'}`}>{d.customer?.name}</span>
                      </div>
                    ))}
                    {dayDeliveries.length > 3 && (
                      <p className={`text-xs ${isToday ? 'text-cyan-200' : 'text-slate-400'}`}>+{dayDeliveries.length - 3} more</p>
                    )}
                    {dayDeliveries.length === 0 && !isToday && (
                      <div className="text-xs text-slate-200">—</div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Side panel — selected day */}
        <div className="w-72 border-l border-slate-200 bg-white flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-slate-100">
            <p className="font-semibold text-slate-800">
              {selected ? new Date(selected + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a day'}
            </p>
            {selected && <p className="text-xs text-slate-400 mt-0.5">{selectedDeliveries.length} delivery{selectedDeliveries.length !== 1 ? 's' : ''}</p>}
          </div>
          <div className="flex-1 overflow-y-auto">
            {selectedDeliveries.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Truck className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm">No deliveries</p>
              </div>
            ) : selectedDeliveries.map(d => {
              const total = (d.bottles_350ml ?? 0) + (d.bottles_750ml ?? 0)
              return (
                <button key={d.id} onClick={() => router.push(`/deliveries`)}
                  className="w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-800 text-sm truncate flex-1">{d.customer?.name}</p>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ml-2 ${STATUS_DOT[d.status] ?? 'bg-slate-300'}`} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                    <span className="flex items-center gap-0.5"><Package className="w-3 h-3" />{(d.delivered_350ml ?? 0) + (d.delivered_750ml ?? 0)} bottles</span>
                    {d.driver?.name && <span className="flex items-center gap-0.5"><Truck className="w-3 h-3" />{d.driver.name}</span>}
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full capitalize mt-1 inline-block ${
                    d.status === 'completed' ? 'bg-emerald-100 text-emerald-600' :
                    d.status === 'pending' ? 'bg-amber-100 text-amber-600' :
                    d.status === 'failed' ? 'bg-red-100 text-red-500' : 'bg-slate-100 text-slate-500'
                  }`}>{d.status?.replace('_', ' ')}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
