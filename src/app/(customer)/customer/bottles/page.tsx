'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Droplets, Package, TrendingDown, AlertCircle, CheckCircle2, Loader2, Info } from 'lucide-react'

export default function CustomerBottlesPage() {
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [balance, setBalance] = useState<any>(null)
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadCustomers() }, [])
  useEffect(() => { if (selectedCustomer) loadData() }, [selectedCustomer])

  const loadCustomers = async () => {
    const sb = createClient()
    const { data } = await sb.from('customers').select('id, name, city').eq('active', true).limit(50)
    setCustomers(data ?? [])
    if (data?.[0]) setSelectedCustomer(data[0].id)
  }

  const loadData = async () => {
    setLoading(true)
    const sb = createClient()
    const [balRes, delivRes] = await Promise.all([
      sb.from('customer_bottle_balance').select('*').eq('customer_id', selectedCustomer).single(),
      sb.from('deliveries').select('*').eq('customer_id', selectedCustomer).in('status', ['completed', 'delivered']).order('delivery_date', { ascending: false }).limit(20),
    ])
    setBalance(balRes.data)
    setDeliveries(delivRes.data ?? [])
    setLoading(false)
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const fmt = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

  const totalDelivered = deliveries.reduce((s, d) => s + (d.delivered_350ml || 0) + (d.delivered_750ml || 0), 0)
  const totalCollected = deliveries.reduce((s, d) => s + (d.collected_350ml || 0) + (d.collected_750ml || 0), 0)
  const totalDamaged = deliveries.reduce((s, d) => s + (d.damaged_350ml || 0) + (d.damaged_750ml || 0), 0)
  const recoveryRate = totalDelivered > 0 ? Math.round((totalCollected / totalDelivered) * 100) : 100

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Bottle Account</h1>
          <p className="text-slate-500 text-sm mt-0.5">Track your bottle loans, returns, and charges</p>
        </div>
        <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
      ) : (
        <>
          {/* Balance Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-cyan-600 mb-2">
                <Droplets className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Total Delivered</span>
              </div>
              <p className="text-3xl font-bold text-slate-800">{(balance?.total_delivered_350ml ?? 0) + (balance?.total_delivered_750ml ?? 0)}</p>
              <p className="text-xs text-slate-400 mt-1">all time</p>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-600 mb-2">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Collected Back</span>
              </div>
              <p className="text-3xl font-bold text-slate-800">{(balance?.total_returned_350ml ?? 0) + (balance?.total_returned_750ml ?? 0)}</p>
              <p className="text-xs text-slate-400 mt-1">{recoveryRate}% recovery rate</p>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-amber-600 mb-2">
                <Package className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">With You Now</span>
              </div>
              <p className="text-3xl font-bold text-slate-800">{(balance?.outstanding_350ml ?? 0) + (balance?.outstanding_750ml ?? 0)}</p>
              <p className="text-xs text-slate-400 mt-1">currently on loan</p>
            </div>

            <div className={`rounded-2xl p-5 shadow-sm border ${
              balance?.is_chargeable ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
            }`}>
              <div className={`flex items-center gap-2 mb-2 ${balance?.is_chargeable ? 'text-red-600' : 'text-emerald-600'}`}>
                {balance?.is_chargeable ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                <span className="text-xs font-medium uppercase tracking-wide">Status</span>
              </div>
              <p className={`text-lg font-bold ${balance?.is_chargeable ? 'text-red-700' : 'text-emerald-700'}`}>
                {balance?.is_chargeable ? 'Chargeable' : 'Good Standing'}
              </p>
              <p className={`text-xs mt-1 ${balance?.is_chargeable ? 'text-red-500' : 'text-emerald-600'}`}>
                {balance?.lost_pct?.toFixed(1) ?? 0}% loss rate
              </p>
            </div>
          </div>

          {/* Policy Info */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800">Bottle Policy</p>
              <p className="text-sm text-blue-600 mt-1">
                Up to <strong>8%</strong> of total bottles delivered may be unrecovered without charge.
                Bottles above this threshold are billed at replacement cost: <strong>Rp 6,000</strong> (350ml) and <strong>Rp 10,000</strong> (750ml).
                Please return all bottles when drivers collect to avoid charges.
              </p>
            </div>
          </div>

          {/* Chargeable Alert */}
          {balance?.is_chargeable && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Lost bottle charges apply</p>
                <p className="text-sm text-red-600 mt-1">
                  You have <strong>{((balance?.chargeable_lost_350ml ?? 0) + (balance?.chargeable_lost_750ml ?? 0)).toFixed(0)} bottles</strong> above the 8% threshold.
                  These will be charged on your next invoice. Contact support if you believe there's an error.
                </p>
              </div>
            </div>
          )}

          {/* Delivery History with Bottle Details */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Delivery History</h2>
              <p className="text-xs text-slate-400 mt-0.5">Bottles delivered and collected per visit</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Date</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Delivered</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Collected</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Damaged</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {deliveries.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">No delivery history yet</td></tr>
                  ) : deliveries.map(d => {
                    const netDelivered = (d.delivered_350ml || 0) + (d.delivered_750ml || 0)
                    const netCollected = (d.collected_350ml || 0) + (d.collected_750ml || 0)
                    const netDamaged = (d.damaged_350ml || 0) + (d.damaged_750ml || 0)
                    const net = netDelivered - netCollected - netDamaged
                    return (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-700">{fmtDate(d.delivery_date)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {d.delivered_350ml > 0 && <span className="text-xs text-slate-500 mr-1">{d.delivered_350ml}×350ml</span>}
                          {d.delivered_750ml > 0 && <span className="text-xs text-slate-500">{d.delivered_750ml}×750ml</span>}
                          <span className="ml-1 font-medium">{netDelivered}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-medium">{netCollected}</td>
                        <td className="px-4 py-3 text-right text-red-500 font-medium">{netDamaged}</td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-800">+{net}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td className="px-5 py-3 text-xs font-semibold text-slate-600 uppercase">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800">{totalDelivered}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{totalCollected}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-500">{totalDamaged}</td>
                    <td className="px-5 py-3 text-right font-bold text-slate-800">{(balance?.outstanding_350ml ?? 0) + (balance?.outstanding_750ml ?? 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
