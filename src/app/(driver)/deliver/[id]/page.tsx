'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { getDelivery } from '@/lib/db'
import { idr } from '@/lib/format'
import type { Delivery } from '@/types'
import {
  CheckCircle2,
  Loader2,
  Package,
  RotateCcw,
  AlertTriangle,
  ChevronLeft,
  Pen,
  Trash2,
} from 'lucide-react'

type Step = 'delivered' | 'collected' | 'damaged' | 'sign' | 'done'

export default function DeliverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<Step>('delivered')
  const [hasSignature, setHasSignature] = useState(false)

  const [form, setForm] = useState({
    delivered_350ml: 0,
    delivered_750ml: 0,
    collected_350ml: 0,
    collected_750ml: 0,
    damaged_350ml: 0,
    damaged_750ml: 0,
    driver_notes: '',
    signature_confirmed_by: '',
  })

  useEffect(() => {
    getDelivery(id).then((d) => {
      setDelivery(d)
      setForm((f) => ({
        ...f,
        delivered_350ml: d.delivered_350ml || 0,
        delivered_750ml: d.delivered_750ml || 0,
      }))
    }).finally(() => setLoading(false))
  }, [id])

  // Canvas drawing
  const getPos = (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setIsDrawing(true)
    setHasSignature(true)
  }

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#0f172a'
    const pos = getPos(e, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  const endDraw = () => setIsDrawing(false)

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const handleComplete = async () => {
    const canvas = canvasRef.current
    if (!canvas || !hasSignature || !form.signature_confirmed_by) return
    setSaving(true)
    try {
      const signatureData = canvas.toDataURL('image/png')
      // Use server-side API so inventory RPCs + confirmation email fire server-side
      const res = await fetch('/api/deliveries/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...form, signature_data: signatureData }),
      })
      if (!res.ok) throw new Error('Failed to complete delivery')
      setStep('done')
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const NumInput = ({
    label, value, onChange, icon,
  }: { label: string; value: number; onChange: (v: number) => void; icon: React.ReactNode }) => (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3 text-slate-500 text-sm font-medium">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-12 h-12 rounded-full bg-slate-100 text-2xl font-bold text-slate-600 flex items-center justify-center active:bg-slate-200"
        >
          −
        </button>
        <span className="text-4xl font-bold text-slate-800 w-16 text-center">{value}</span>
        <button
          onClick={() => onChange(value + 1)}
          className="w-12 h-12 rounded-full bg-cyan-500 text-2xl font-bold text-white flex items-center justify-center active:bg-cyan-600"
        >
          +
        </button>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    )
  }

  if (!delivery) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center text-slate-500">Delivery not found</div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-emerald-50">
        <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-emerald-800 mb-2">Delivery Complete!</h1>
        <p className="text-emerald-600 text-center mb-2">
          {(delivery.customer as any)?.name}
        </p>
        <div className="bg-white rounded-2xl p-4 w-full max-w-sm mt-4 space-y-2 shadow-sm">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Delivered 350ml</span>
            <span className="font-bold">{form.delivered_350ml}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Delivered 750ml</span>
            <span className="font-bold">{form.delivered_750ml}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Collected 350ml</span>
            <span className="font-bold">{form.collected_350ml}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Collected 750ml</span>
            <span className="font-bold">{form.collected_750ml}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Signed by</span>
            <span className="font-bold">{form.signature_confirmed_by}</span>
          </div>
        </div>
        <button
          onClick={() => router.push('/trakops')}
          className="mt-8 bg-emerald-600 text-white px-8 py-3 rounded-xl font-medium"
        >
          Back to Route
        </button>
      </div>
    )
  }

  const customer = (delivery.customer as any)

  const steps: Step[] = ['delivered', 'collected', 'damaged', 'sign']
  const stepIdx = steps.indexOf(step)

  const stepConfig = {
    delivered: { title: 'Bottles Delivered', icon: <Package className="w-5 h-5" />, color: 'bg-cyan-500' },
    collected: { title: 'Empties Collected', icon: <RotateCcw className="w-5 h-5" />, color: 'bg-amber-500' },
    damaged: { title: 'Damaged / Missing', icon: <AlertTriangle className="w-5 h-5" />, color: 'bg-red-400' },
    sign: { title: 'Customer Signature', icon: <Pen className="w-5 h-5" />, color: 'bg-emerald-500' },
  }

  const current = stepConfig[step]

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto">
      {/* Header */}
      <div className="bg-slate-900 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="text-slate-400">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <p className="text-xs text-slate-400 uppercase tracking-wider">Delivery</p>
            <h1 className="text-lg font-bold">{customer?.name}</h1>
            <p className="text-sm text-slate-400">{customer?.city} · {delivery.delivery_date}</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="flex gap-1.5">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= stepIdx ? 'bg-cyan-400' : 'bg-slate-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-4">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm font-medium ${current.color}`}>
          {current.icon}
          {current.title}
        </div>

        {(step === 'delivered' || step === 'collected' || step === 'damaged') && (
          <>
            <NumInput
              label="350ml bottles"
              value={
                step === 'delivered' ? form.delivered_350ml :
                step === 'collected' ? form.collected_350ml :
                form.damaged_350ml
              }
              onChange={(v) => setForm({ ...form,
                ...(step === 'delivered' ? { delivered_350ml: v } :
                    step === 'collected' ? { collected_350ml: v } :
                    { damaged_350ml: v })
              })}
              icon={<Package className="w-4 h-4" />}
            />
            <NumInput
              label="750ml bottles"
              value={
                step === 'delivered' ? form.delivered_750ml :
                step === 'collected' ? form.collected_750ml :
                form.damaged_750ml
              }
              onChange={(v) => setForm({ ...form,
                ...(step === 'delivered' ? { delivered_750ml: v } :
                    step === 'collected' ? { collected_750ml: v } :
                    { damaged_750ml: v })
              })}
              icon={<Package className="w-4 h-4" />}
            />
            {step === 'delivered' && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <label className="text-sm font-medium text-slate-500 block mb-2">Driver Notes</label>
                <textarea
                  className="w-full text-sm text-slate-700 resize-none outline-none"
                  rows={3}
                  placeholder="Any issues, access notes, etc..."
                  value={form.driver_notes}
                  onChange={(e) => setForm({ ...form, driver_notes: e.target.value })}
                />
              </div>
            )}
          </>
        )}

        {step === 'sign' && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <p className="text-sm font-semibold text-slate-700 mb-2">Delivery Summary</p>
              {[
                { label: 'Delivered 350ml', value: form.delivered_350ml },
                { label: 'Delivered 750ml', value: form.delivered_750ml },
                { label: 'Collected 350ml', value: form.collected_350ml },
                { label: 'Collected 750ml', value: form.collected_750ml },
                { label: 'Damaged 350ml', value: form.damaged_350ml },
                { label: 'Damaged 750ml', value: form.damaged_750ml },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-slate-500">{label}</span>
                  <span className={`font-bold ${value > 0 ? 'text-slate-800' : 'text-slate-300'}`}>{value}</span>
                </div>
              ))}
            </div>

            {/* Confirmed by */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="text-sm font-medium text-slate-500 block mb-2">Confirmed by (customer name)</label>
              <input
                className="w-full text-slate-800 font-medium text-base outline-none border-b border-slate-200 pb-2"
                placeholder="e.g. Budi Santoso"
                value={form.signature_confirmed_by}
                onChange={(e) => setForm({ ...form, signature_confirmed_by: e.target.value })}
              />
            </div>

            {/* Signature canvas */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-500">Customer Signature</label>
                <button onClick={clearSignature} className="text-slate-400 flex items-center gap-1 text-xs">
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              </div>
              <div className="border-2 border-dashed border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                <canvas
                  ref={canvasRef}
                  width={340}
                  height={160}
                  className="w-full touch-none"
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                />
              </div>
              {!hasSignature && (
                <p className="text-xs text-slate-400 text-center mt-2">Have customer sign above</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="p-4 bg-white border-t shadow-lg">
        {step !== 'sign' ? (
          <button
            onClick={() => {
              const nextStep: Record<Step, Step> = {
                delivered: 'collected', collected: 'damaged', damaged: 'sign', sign: 'done', done: 'done',
              }
              setStep(nextStep[step])
            }}
            className="w-full bg-cyan-600 text-white py-4 rounded-2xl font-bold text-lg active:bg-cyan-700"
          >
            Next →
          </button>
        ) : (
          <button
            onClick={handleComplete}
            disabled={saving || !hasSignature || !form.signature_confirmed_by}
            className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold text-lg disabled:opacity-40 active:bg-emerald-700 flex items-center justify-center gap-3"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            {saving ? 'Saving...' : 'Complete Delivery'}
          </button>
        )}
      </div>
    </div>
  )
}
