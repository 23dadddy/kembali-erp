'use client'

import { useState, useEffect, useCallback } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { createClient } from '@/lib/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Clock, UserCheck, UserX, Download } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-red-100 text-red-600',
  late: 'bg-amber-100 text-amber-700',
  half_day: 'bg-blue-100 text-blue-700',
  leave: 'bg-purple-100 text-purple-700',
}

export default function AttendancePage() {
  const [staff, setStaff] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily')
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7))

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const [staffRes, logsRes] = await Promise.all([
      sb.from('staff').select('id, name, role').eq('active', true).order('name'),
      viewMode === 'daily'
        ? sb.from('attendance_logs').select('*').eq('date', selectedDate)
        : sb.from('attendance_logs').select('*, staff:staff(name,role)').gte('date', `${monthFilter}-01`).lte('date', `${monthFilter}-31`).order('date', { ascending: false }),
    ])
    setStaff(staffRes.data ?? [])
    setLogs(logsRes.data ?? [])
    setLoading(false)
  }, [selectedDate, viewMode, monthFilter])

  useEffect(() => { load() }, [load])

  const markStatus = async (staffId: string, status: string) => {
    setSaving(staffId)
    const sb = createClient()
    const existing = logs.find(l => l.staff_id === staffId && l.date === selectedDate)
    const now = new Date().toISOString()
    if (existing) {
      const { data } = await sb.from('attendance_logs').update({ status, updated_at: now }).eq('id', existing.id).select().single()
      if (data) setLogs(prev => prev.map(l => l.id === existing.id ? data : l))
    } else {
      const { data } = await sb.from('attendance_logs').insert({
        staff_id: staffId, date: selectedDate, status,
        clock_in: status === 'present' || status === 'late' ? now : null,
      }).select().single()
      if (data) setLogs(prev => [...prev, data])
    }
    setSaving(null)
  }

  const clockOut = async (staffId: string) => {
    const log = logs.find(l => l.staff_id === staffId && l.date === selectedDate)
    if (!log) return
    setSaving(staffId)
    const sb = createClient()
    const now = new Date().toISOString()
    const hoursWorked = log.clock_in ? Math.round((Date.now() - new Date(log.clock_in).getTime()) / 3600000 * 10) / 10 : null
    const { data } = await sb.from('attendance_logs').update({ clock_out: now, hours_worked: hoursWorked }).eq('id', log.id).select().single()
    if (data) setLogs(prev => prev.map(l => l.id === log.id ? data : l))
    setSaving(null)
  }

  const presentCount = logs.filter(l => l.status === 'present').length
  const absentCount = logs.filter(l => l.status === 'absent').length
  const totalHours = logs.reduce((s, l) => s + Number(l.hours_worked ?? 0), 0)

  const exportCSV = () => {
    if (viewMode === 'monthly') {
      const rows = logs.map(l => ({ Date: l.date, Staff: (l.staff as any)?.name ?? l.staff_id, Status: l.status, ClockIn: l.clock_in ?? '', ClockOut: l.clock_out ?? '', Hours: l.hours_worked ?? '' }))
      const headers = Object.keys(rows[0] ?? {})
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify((r as any)[h] ?? '')).join(','))].join('\n')
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      a.download = `attendance-${monthFilter}.csv`; a.click()
    }
  }

  return (
    <>
      <Topbar title="Attendance" />
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4"><p className="text-xs text-slate-500">Present Today</p><p className="text-2xl font-bold text-emerald-600">{presentCount}</p></div>
          <div className="bg-white rounded-xl border p-4"><p className="text-xs text-slate-500">Absent</p><p className="text-2xl font-bold text-red-500">{absentCount}</p></div>
          <div className="bg-white rounded-xl border p-4"><p className="text-xs text-slate-500">Total Staff</p><p className="text-2xl font-bold text-slate-700">{staff.length}</p></div>
          <div className="bg-white rounded-xl border p-4"><p className="text-xs text-slate-500">Hours Logged</p><p className="text-2xl font-bold text-blue-600">{totalHours.toFixed(1)}h</p></div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border overflow-hidden">
            <button onClick={() => setViewMode('daily')} className={`px-3 py-1.5 text-sm font-medium ${viewMode === 'daily' ? 'bg-cyan-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Daily</button>
            <button onClick={() => setViewMode('monthly')} className={`px-3 py-1.5 text-sm font-medium ${viewMode === 'monthly' ? 'bg-cyan-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Monthly</button>
          </div>
          {viewMode === 'daily'
            ? <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
            : <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
          }
          {viewMode === 'monthly' && <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-3.5 h-3.5 mr-1.5" />Export CSV</Button>}
        </div>

        <div className="bg-white rounded-xl border overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
          ) : viewMode === 'daily' ? (
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Staff</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Role</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Clock In</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Clock Out</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Hours</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {staff.map(s => {
                  const log = logs.find(l => l.staff_id === s.id)
                  const isSaving = saving === s.id
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-700">{s.name}</td>
                      <td className="px-4 py-3 text-slate-500 capitalize text-sm">{s.role}</td>
                      <td className="px-4 py-3">
                        {log ? <Badge className={STATUS_COLORS[log.status] ?? ''}>{log.status}</Badge> : <span className="text-xs text-slate-300">Not marked</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{log?.clock_in ? new Date(log.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{log?.clock_out ? new Date(log.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-700">{log?.hours_worked ? `${log.hours_worked}h` : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-slate-300" /> : (
                            <>
                              {(!log || log.status !== 'present') && <button onClick={() => markStatus(s.id, 'present')} className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg flex items-center gap-1"><UserCheck className="w-3 h-3" />Present</button>}
                              {(!log || log.status !== 'late') && <button onClick={() => markStatus(s.id, 'late')} className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-2 py-1 rounded-lg">Late</button>}
                              {(!log || log.status !== 'absent') && <button onClick={() => markStatus(s.id, 'absent')} className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded-lg flex items-center gap-1"><UserX className="w-3 h-3" />Absent</button>}
                              {(!log || log.status !== 'leave') && <button onClick={() => markStatus(s.id, 'leave')} className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 px-2 py-1 rounded-lg">Leave</button>}
                              {log?.clock_in && !log?.clock_out && <button onClick={() => clockOut(s.id)} className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 px-2 py-1 rounded-lg flex items-center gap-1"><Clock className="w-3 h-3" />Clock Out</button>}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Staff</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Clock In</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Clock Out</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm text-slate-600">{l.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{(l.staff as any)?.name}</td>
                    <td className="px-4 py-3"><Badge className={STATUS_COLORS[l.status] ?? ''}>{l.status}</Badge></td>
                    <td className="px-4 py-3 text-sm text-slate-500">{l.clock_in ? new Date(l.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{l.clock_out ? new Date(l.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="px-4 py-3 text-sm font-medium">{l.hours_worked ? `${l.hours_worked}h` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
