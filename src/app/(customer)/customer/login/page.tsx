'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Droplets, Loader2, Mail, CheckCircle2 } from 'lucide-react'

function CustomerLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/customer/dashboard'

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const sb = createClient()

    // Check the email belongs to an active customer
    const { data: customer } = await sb
      .from('customers')
      .select('id, name, portal_enabled')
      .eq('contact_email', email.toLowerCase().trim())
      .eq('active', true)
      .single()

    if (!customer) {
      setError('No account found for this email address. Contact your Kembali Water representative to enable portal access.')
      setLoading(false)
      return
    }

    if (!customer.portal_enabled) {
      setError('Portal access has not been enabled for your account yet. Please contact contact@kembaliwater.com.')
      setLoading(false)
      return
    }

    // Send magic link
    const { error: authError } = await sb.auth.signInWithOtp({
      email: email.toLowerCase().trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/customer/dashboard`,
        shouldCreateUser: true,
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-cyan-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/30">
            <Droplets className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Kembali Water</h1>
          <p className="text-slate-500 text-sm mt-1">Partner Portal</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          {sent ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-slate-800 mb-1">Check your email</h2>
              <p className="text-sm text-slate-500">
                We sent a sign-in link to <strong>{email}</strong>. Click the link in the email to access your portal.
              </p>
              <p className="text-xs text-slate-400 mt-4">Didn't receive it? Check your spam folder or <button className="text-cyan-600 underline" onClick={() => setSent(false)}>try again</button>.</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-slate-800 mb-1">Sign in to your portal</h2>
              <p className="text-sm text-slate-500 mb-5">Enter the email address on your Kembali Water account</p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                      autoComplete="email"
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Sending link…</> : 'Send sign-in link'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-slate-400 text-xs mt-6">
          Need help? Email <a href="mailto:contact@kembaliwater.com" className="text-cyan-600">contact@kembaliwater.com</a>
        </p>
      </div>
    </div>
  )
}

export default function CustomerLoginPage() {
  return (
    <Suspense>
      <CustomerLoginForm />
    </Suspense>
  )
}
