'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import {
  DollarSign, Plus, Loader2, Check, X, Play, CheckCircle2,
  Users, TrendingUp, Calendar, ChevronRight, AlertCircle, Download
} from 'lucide-react'
import { useLanguage } from '@/components/providers/language-provider'

const fmt = (n: number) => `Rp ${(n ?? 0).toLocaleString('id-ID')}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function PayrollPage() {
  const { t } = useLanguage()
  const [runs, setRuns] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [selectedRun, setSelectedRun] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showNewRun, setShowNewRun] = useState(false)

  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]

  const [runForm, setRunForm] = useState({
    period_start: firstOfMonth,
    period_end: lastOfMonth,
    notes: '',
  })

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (selectedRun) loadItems(selectedRun.id) }, [selectedRun])

  const loadAll = async () => {
    setLoading(true)
    const sb = createClient()
    const [runsRes, staffRes] = await Promise.all([
      sb.from('payroll_runs').select('*').order('period_start', { ascending: false }),
      sb.from('staff').select('id, name, role, salary, salary_type').eq('active', true).order('name'),
    ])
    setRuns(runsRes.data ?? [])
    setStaff(staffRes.data ?? [])
    setLoading(false)
  }

  const loadItems = async (runId: string) => {
    const sb = createClient()
    const { data } = await sb.from('payroll_items')
      .select('*, employee:staff(name, role)')
      .eq('payroll_run_id', runId)
      .order('employee(name)')
    setItems(data ?? [])
  }

  const createRun = async () => {
    if (!runForm.period_start || !runForm.period_end) return
    setSaving(true)
    const sb = createClient()

    // Create the run
    const { data: run } = await sb.from('payroll_runs').insert({
      period_start: runForm.period_start,
      period_end: runForm.period_end,
      notes: runForm.notes || null,
      status: 'draft',
    }).select().single()

    if (!run) { setSaving(false); return }

    // Pull attendance data for this period to auto-fill days_worked / days_absent
    const { data: attendanceLogs } = await sb
      .from('attendance_logs')
      .select('staff_id, status, hours_worked')
      .gte('date', runForm.period_start)
      .lte('date', runForm.period_end)

    const attMap: Record<string, { worked: number; absent: number; hours: number }> = {}
    for (const log of (attendanceLogs ?? [])) {
      if (!attMap[log.staff_id]) attMap[log.staff_id] = { worked: 0, absent: 0, hours: 0 }
      if (['present', 'late'].includes(log.status)) {
        attMap[log.staff_id].worked++
        attMap[log.staff_id].hours += Number(log.hours_worked ?? 0)
      } else if (log.status === 'half_day') {
        attMap[log.staff_id].worked += 0.5
        attMap[log.staff_id].hours += Number(log.hours_worked ?? 0)
      } else if (log.status === 'absent') {
        attMap[log.staff_id].absent++
      }
    }

    // Auto-populate with all active staff
    const payrollItems = staff.map(s => {
      const att = attMap[s.id] ?? { worked: 0, absent: 0, hours: 0 }
      const baseSalary = s.salary ?? 0
      // For daily workers: pay = (days_worked / working_days_in_period) * salary
      const workingDays = att.worked + att.absent || 1
      const earnedBase = s.salary_type === 'daily' && att.worked > 0
        ? Math.round((att.worked / workingDays) * baseSalary)
        : baseSalary
      return {
        payroll_run_id: run.id,
        employee_id: s.id,
        base_salary: earnedBase,
        allowances: 0,
        overtime: 0,
        bonus: 0,
        deductions: 0,
        tax: 0,
        net_pay: earnedBase,
        days_worked: att.worked,
        days_absent: att.absent,
      }
    })

    if (payrollItems.length > 0) {
      await sb.from('payroll_items').insert(payrollItems)
    }

    // Update run totals
    const totalGross = staff.reduce((s, e) => s + (e.salary ?? 0), 0)
    await sb.from('payroll_runs').update({
      total_gross: totalGross,
      total_net: totalGross,
    }).eq('id', run.id)

    await loadAll()
    setSelectedRun({ ...run, total_gross: totalGross, total_net: totalGross })
    setShowNewRun(false)
    setSaving(false)
  }

  const updateItem = async (itemId: string, field: string, value: number) => {
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i
      const updated = { ...i, [field]: value }
      updated.net_pay = (updated.base_salary ?? 0) + (updated.allowances ?? 0) + (updated.overtime ?? 0) + (updated.bonus ?? 0) - (updated.deductions ?? 0) - (updated.tax ?? 0)
      return updated
    }))
  }

  const saveItems = async () => {
    if (!selectedRun) return
    setSaving(true)
    const sb = createClient()

    // Update each item
    for (const item of items) {
      await sb.from('payroll_items').update({
        base_salary: item.base_salary,
        allowances: item.allowances,
        overtime: item.overtime,
        bonus: item.bonus,
        deductions: item.deductions,
        tax: item.tax,
        net_pay: item.net_pay,
        days_worked: item.days_worked,
        days_absent: item.days_absent,
      }).eq('id', item.id)
    }

    // Update run totals
    const totalGross = items.reduce((s, i) => s + (i.base_salary ?? 0) + (i.allowances ?? 0) + (i.overtime ?? 0) + (i.bonus ?? 0), 0)
    const totalDeductions = items.reduce((s, i) => s + (i.deductions ?? 0) + (i.tax ?? 0), 0)
    const totalNet = items.reduce((s, i) => s + (i.net_pay ?? 0), 0)

    await sb.from('payroll_runs').update({ total_gross: totalGross, total_deductions: totalDeductions, total_net: totalNet }).eq('id', selectedRun.id)
    setSelectedRun((r: any) => ({ ...r, total_gross: totalGross, total_deductions: totalDeductions, total_net: totalNet }))
    setRuns(prev => prev.map(r => r.id === selectedRun.id ? { ...r, total_gross: totalGross, total_deductions: totalDeductions, total_net: totalNet } : r))
    setSaving(false)
  }

  const approveRun = async () => {
    if (!selectedRun) return
    const sb = createClient()
    await sb.from('payroll_runs').update({ status: 'approved' }).eq('id', selectedRun.id)
    setSelectedRun((r: any) => ({ ...r, status: 'approved' }))
    setRuns(prev => prev.map(r => r.id === selectedRun.id ? { ...r, status: 'approved' } : r))
  }

  const markPaid = async () => {
    if (!selectedRun) return
    const sb = createClient()
    await sb.from('payroll_runs').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', selectedRun.id)
    setSelectedRun((r: any) => ({ ...r, status: 'paid' }))
    setRuns(prev => prev.map(r => r.id === selectedRun.id ? { ...r, status: 'paid' } : r))
  }

  const statusColor: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-500',
    processing: 'bg-blue-100 text-blue-600',
    approved: 'bg-amber-100 text-amber-700',
    paid: 'bg-emerald-100 text-emerald-700',
  }

  return (
    <>
      <Topbar title={t('payroll_title')} />
      <div className="flex h-[calc(100vh-57px)]">
        {/* Runs List */}
        <div className="w-72 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-slate-100">
            <button onClick={() => setShowNewRun(true)}
              className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-xl text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> {t('payroll_new_run')}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : runs.length === 0 ? (
              <div className="text-center py-12 text-slate-400 px-4">
                <DollarSign className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm">{t('payroll_no_runs')}</p>
              </div>
            ) : runs.map(run => (
              <button key={run.id} onClick={() => setSelectedRun(run)}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${selectedRun?.id === run.id ? 'bg-cyan-50 border-l-2 border-l-cyan-500' : ''}`}>
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800 text-sm">
                    {new Date(run.period_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColor[run.status] ?? statusColor.draft}`}>{run.status}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{fmtDate(run.period_start)} – {fmtDate(run.period_end)}</p>
                <p className="text-sm font-semibold text-cyan-600 mt-1">{fmt(run.total_net)}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Run Detail */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {!selectedRun ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <DollarSign className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p className="font-medium">{t('payroll_select_run')}</p>
                <p className="text-sm mt-1">{t('payroll_or_new')}</p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-5">
              {/* Run Header */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      {new Date(selectedRun.period_start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} {t('payroll_run_label')}
                    </h2>
                    <p className="text-sm text-slate-500 mt-0.5">{fmtDate(selectedRun.period_start)} – {fmtDate(selectedRun.period_end)}</p>
                    <span className={`inline-block mt-2 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusColor[selectedRun.status] ?? statusColor.draft}`}>{selectedRun.status}</span>
                  </div>
                  <div className="flex gap-2">
                    {selectedRun.status === 'draft' && (
                      <>
                        <button onClick={saveItems} disabled={saving}
                          className="flex items-center gap-1.5 text-sm border border-slate-200 bg-white px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors">
                          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} {t('payroll_save')}
                        </button>
                        <button onClick={approveRun}
                          className="flex items-center gap-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-xl transition-colors">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {t('payroll_approve')}
                        </button>
                      </>
                    )}
                    {selectedRun.status === 'approved' && (
                      <button onClick={markPaid}
                        className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl transition-colors">
                        <Play className="w-3.5 h-3.5" /> {t('payroll_mark_paid')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
                  <div>
                    <p className="text-xs text-slate-400">{t('payroll_gross')}</p>
                    <p className="text-lg font-bold text-slate-800">{fmt(selectedRun.total_gross)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{t('payroll_deductions')}</p>
                    <p className="text-lg font-bold text-red-600">{fmt(selectedRun.total_deductions)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{t('payroll_net')}</p>
                    <p className="text-lg font-bold text-emerald-600">{fmt(selectedRun.total_net)}</p>
                  </div>
                </div>
              </div>

              {/* Payroll Items Table */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-800">{t('payroll_employee_breakdown')}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{items.length} {t('payroll_employee')}s · {t('payroll_edit_inline')}</p>
                  </div>
                  {items.length > 0 && (
                    <button onClick={() => {
                      const headers = ['Employee', 'Role', 'Base Salary', 'Allowances', 'Overtime', 'Bonus', 'Deductions', 'Tax', 'Days Worked', 'Net Pay']
                      const rows = items.map(i => [
                        i.employee?.name ?? '', i.employee?.role ?? '',
                        i.base_salary ?? 0, i.allowances ?? 0, i.overtime ?? 0, i.bonus ?? 0,
                        i.deductions ?? 0, i.tax ?? 0, i.days_worked ?? 0, i.net_pay ?? 0,
                      ])
                      const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
                      a.download = `payroll-${selectedRun.period_start?.slice(0,7)}.csv`
                      a.click()
                    }}
                      className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors">
                      <Download className="w-3.5 h-3.5" /> {t('payroll_export_csv')}
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400 uppercase">{t('payroll_employee')}</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400 uppercase">{t('payroll_base')}</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400 uppercase">{t('payroll_allow')}</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400 uppercase">{t('payroll_ot')}</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400 uppercase">{t('payroll_bonus')}</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400 uppercase">{t('payroll_deduct')}</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400 uppercase">{t('payroll_tax')}</th>
                        <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400 uppercase">{t('payroll_days')}</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400 uppercase">{t('payroll_net_pay')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {items.length === 0 ? (
                        <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">{t('payroll_no_employees')}</td></tr>
                      ) : items.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-slate-800">{item.employee?.name}</p>
                            <p className="text-xs text-slate-400 capitalize">{item.employee?.role}</p>
                          </td>
                          {(['base_salary', 'allowances', 'overtime', 'bonus', 'deductions', 'tax'] as const).map(field => (
                            <td key={field} className="px-2 py-2">
                              {selectedRun.status === 'draft' ? (
                                <input type="number" min="0"
                                  className="w-24 text-right border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400"
                                  value={item[field] ?? 0}
                                  onChange={e => updateItem(item.id, field, Number(e.target.value))} />
                              ) : (
                                <span className="text-xs text-slate-700 block text-right">{fmt(item[field] ?? 0)}</span>
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-2">
                            {selectedRun.status === 'draft' ? (
                              <input type="number" min="0"
                                className="w-14 text-right border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400"
                                value={item.days_worked ?? 0}
                                onChange={e => updateItem(item.id, 'days_worked', Number(e.target.value))} />
                            ) : (
                              <span className="text-xs text-slate-700 block text-right">{item.days_worked}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="font-semibold text-emerald-700 text-sm">{fmt(item.net_pay ?? 0)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {items.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 bg-slate-50">
                          <td className="px-4 py-3 text-xs font-semibold text-slate-600 uppercase">{t('payroll_total')}</td>
                          <td colSpan={7} />
                          <td className="px-4 py-3 text-right font-bold text-emerald-700">
                            {fmt(items.reduce((s, i) => s + (i.net_pay ?? 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Run Modal */}
      {showNewRun && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-lg">{t('payroll_new_run_modal')}</h3>
            <p className="text-sm text-slate-500">A payroll run will be created with all {staff.length} active employees pre-filled from their salary records.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">{t('payroll_period_start')}</label>
                <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={runForm.period_start} onChange={e => setRunForm({ ...runForm, period_start: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">{t('payroll_period_end')}</label>
                <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={runForm.period_end} onChange={e => setRunForm({ ...runForm, period_end: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Notes</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={runForm.notes} onChange={e => setRunForm({ ...runForm, notes: e.target.value })} />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={createRun} disabled={saving}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />{t('payroll_create_run')}</>}
              </button>
              <button onClick={() => setShowNewRun(false)} className="border border-slate-200 px-4 py-2.5 rounded-xl text-sm hover:bg-slate-50">{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
