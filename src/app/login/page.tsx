'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Eye, EyeOff } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push(redirectTo)
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="Kembali Water" className="w-56 mb-3" style={{ filter: 'brightness(0)' }} />
          <p className="text-sm" style={{ color: '#8C8078' }}>Operations Hub</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6 shadow-sm border" style={{ background: '#FFFFFF', borderColor: '#DDD7CF' }}>
          <h2 className="text-base font-semibold mb-5" style={{ color: '#1A1A1A' }}>Sign in to your account</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#5A5248' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@kembaliwater.com"
                required
                autoComplete="email"
                className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition"
                style={{ background: '#F7F3EE', border: '1px solid #DDD7CF', color: '#1A1A1A', '--tw-ring-color': '#5BA3A0' } as React.CSSProperties}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#5A5248' }}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-xl px-4 py-2.5 pr-11 text-sm focus:outline-none focus:ring-2 transition"
                  style={{ background: '#F7F3EE', border: '1px solid #DDD7CF', color: '#1A1A1A', '--tw-ring-color': '#5BA3A0' } as React.CSSProperties}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#8C8078' }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              style={{ background: '#5BA3A0' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#4A8A87')}
              onMouseLeave={e => (e.currentTarget.style.background = '#5BA3A0')}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#8C8078' }}>
          © {new Date().getFullYear()} Kembali Water · All rights reserved
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
