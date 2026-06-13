import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const FROM = process.env.RESEND_FROM_EMAIL ?? 'Kembali Water <onboarding@resend.dev>'

function generatePassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const special = '!@#$%'
  const all = upper + lower + digits + special
  let pwd = ''
  // Ensure at least one of each type
  pwd += upper[Math.floor(Math.random() * upper.length)]
  pwd += lower[Math.floor(Math.random() * lower.length)]
  pwd += digits[Math.floor(Math.random() * digits.length)]
  pwd += special[Math.floor(Math.random() * special.length)]
  for (let i = 4; i < length; i++) {
    pwd += all[Math.floor(Math.random() * all.length)]
  }
  return pwd.split('').sort(() => Math.random() - 0.5).join('')
}

function welcomeEmail(name: string, email: string, password: string, role: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#1A1D21;padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Kembali Water</p>
            <p style="margin:6px 0 0;font-size:13px;color:#9B9C9D;">Internal ERP System</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a2e;">Welcome, ${name}! 👋</p>
            <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
              Your account has been created. You can log in immediately using the credentials below.
            </p>

            <!-- Credentials box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 14px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af;">Your Login Details</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;width:90px;">Email</td>
                      <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${email}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Password</td>
                      <td style="padding:6px 0;">
                        <span style="font-size:14px;font-weight:700;color:#111827;background:#fff;border:1px solid #d1d5db;border-radius:4px;padding:3px 10px;font-family:monospace;letter-spacing:1px;">${password}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Role</td>
                      <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;text-transform:capitalize;">${role || 'Staff'}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td align="center">
                  <a href="https://kembali-erp.vercel.app/login"
                     style="display:inline-block;background:#007A5A;color:#ffffff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:8px;text-decoration:none;">
                    Log In to Kembali ERP →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
              For security, please change your password after your first login.<br>
              If you have any issues, contact your administrator.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f1f5f9;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">© 2026 Kembali Water · Internal use only</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  try {
    const { name, email, role, phone, location_id } = await req.json()

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Generate temporary password
    const tempPassword = generatePassword(12)

    // Create Supabase Auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // skip email verification — they get creds directly
      user_metadata: { name, role },
    })

    if (authError) {
      if (authError.message?.includes('already been registered') || authError.message?.includes('already registered')) {
        return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 409 })
      }
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // Create staff record linked to auth user
    const { data: staffData, error: staffError } = await supabaseAdmin
      .from('staff')
      .insert({
        name,
        email,
        role: role || 'staff',
        phone: phone || null,
        location_id: location_id || null,
        active: true,
        auth_user_id: authData.user.id,
      })
      .select()
      .single()

    if (staffError) {
      // Roll back auth user if staff creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: staffError.message }, { status: 500 })
    }

    // Send welcome email via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: email,
        subject: `Welcome to Kembali Water ERP — your account is ready`,
        html: welcomeEmail(name, email, tempPassword, role),
      }),
    })

    if (!emailRes.ok) {
      console.error('[invite-staff] Resend error:', await emailRes.text())
    }

    return NextResponse.json({ staff: staffData, emailSent: emailRes.ok })
  } catch (err: any) {
    console.error('[invite-staff]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
