export const metadata = { title: 'Privacy Policy — Kembali Water' }

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: 'system-ui, sans-serif', color: '#1e293b', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: '#64748b', fontSize: 14 }}>Kembali Water — last updated 12 July 2026</p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Who we are</h2>
      <p>Kembali Water provides premium reusable glass-bottle water delivery to businesses in Bali, Indonesia. This policy covers our website, customer portal, and the Kembali Water mobile application.</p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>Information we collect</h2>
      <ul>
        <li><strong>Account information</strong> — name, business name, email address, phone / WhatsApp number, and delivery address, provided when you enquire, become a partner, or are registered as a staff member.</li>
        <li><strong>Order and delivery data</strong> — delivery schedules, bottle quantities, invoices, and payment status.</li>
        <li><strong>Location data (staff app only)</strong> — with permission, the mobile app collects the device location of our own delivery drivers and sales staff while they are on an active route, to power live dispatch and delivery tracking. Customers and partners are never location-tracked.</li>
        <li><strong>Communications</strong> — messages you exchange with us on WhatsApp or email, so we can respond and keep order records accurate. Some replies are generated with the assistance of AI; a human team member reviews escalated conversations.</li>
      </ul>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>How we use it</h2>
      <ul>
        <li>To schedule, deliver, and invoice water deliveries</li>
        <li>To respond to enquiries and send service notifications (delivery reminders, invoices, payment reminders)</li>
        <li>To operate internal logistics (routes, dispatch, inventory)</li>
      </ul>
      <p>We do not sell personal data, and we do not use it for third-party advertising.</p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>Service providers</h2>
      <p>We use trusted processors to run our service: Supabase (database hosting), Vercel (application hosting), Twilio (WhatsApp messaging), Resend (email), Google Maps Platform (routing and geocoding), Expo (mobile app notifications), and Anthropic (AI-assisted replies). Each receives only the data needed to perform its function.</p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>Data retention & deletion</h2>
      <p>We keep business records (orders, invoices) as long as required for legal and accounting purposes. You may request access to or deletion of your personal data at any time by contacting us; we will action requests within 30 days where the law allows.</p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>Security</h2>
      <p>Data is encrypted in transit, access is restricted to authorised staff, and credentials are stored using industry-standard practices.</p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>Contact</h2>
      <p>Kembali Water, Bali, Indonesia<br />Email: admin@kembaliwater.com</p>
    </main>
  )
}
