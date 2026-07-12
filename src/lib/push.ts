/**
 * Expo push notifications — server-side sender.
 * Staff (reps/drivers) register their Expo push token from the mobile app;
 * this helper sends via Expo's push service. No credentials required for
 * Expo Go / EAS builds using the default push infrastructure.
 */

export async function sendPush(opts: {
  to: string | string[]
  title: string
  body: string
  data?: Record<string, unknown>
}): Promise<{ ok: boolean }> {
  const tokens = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter(t => t?.startsWith('ExponentPushToken'))
  if (!tokens.length) return { ok: false }

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokens.map(to => ({
        to,
        title: opts.title,
        body: opts.body,
        sound: 'default',
        data: opts.data ?? {},
      }))),
    })
    return { ok: res.ok }
  } catch {
    return { ok: false }
  }
}
