/**
 * Module-level stale-while-revalidate cache.
 * Lives in JS memory for the tab lifetime — survives route changes, clears on refresh.
 * TTL: 60s for list data, 30s for single records.
 */

type Entry<T> = { data: T; ts: number; promise?: Promise<T> }

const store = new Map<string, Entry<any>>()

const TTL_LIST   = 60_000   // 60 s for list queries
const TTL_RECORD = 30_000   // 30 s for single records

function isStale(entry: Entry<any>, ttl: number) {
  return Date.now() - entry.ts > ttl
}

/**
 * Read from cache. Returns null if no entry or too old to use as fallback.
 * "Too old" = 5 minutes (hard cap — always re-fetch after that).
 */
export function cacheRead<T>(key: string): T | null {
  const e = store.get(key)
  if (!e) return null
  if (Date.now() - e.ts > 5 * 60_000) { store.delete(key); return null }
  return e.data as T
}

/** Write a fresh value into the cache. */
export function cacheWrite(key: string, data: any) {
  store.set(key, { data, ts: Date.now() })
}

/** Invalidate one key or all keys matching a prefix. */
export function cacheInvalidate(keyOrPrefix: string) {
  for (const k of store.keys()) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix + ':')) {
      store.delete(k)
    }
  }
}

/**
 * Stale-while-revalidate fetch.
 * - If we have a cached value (even stale) → return it immediately, kick off background refresh
 * - If nothing cached → await the fetch normally (first load)
 */
export async function swr<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = TTL_LIST,
  onFresh?: (data: T) => void,
): Promise<T> {
  const e = store.get(key)

  if (e) {
    if (!isStale(e, ttl)) {
      // Fresh — return immediately
      return e.data as T
    }
    // Stale — return cached data NOW, revalidate in background
    if (!e.promise) {
      e.promise = fetcher().then(fresh => {
        cacheWrite(key, fresh)
        if (e) e.promise = undefined
        onFresh?.(fresh)
        return fresh
      }).catch(() => { if (e) e.promise = undefined; return e.data as T })
    }
    return e.data as T
  }

  // Nothing cached — block on first fetch
  const data = await fetcher()
  cacheWrite(key, data)
  return data
}
