const FX_CACHE_KEY = 'fx_live_data_v1'
const FX_CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 1 week

export async function loadFxData(): Promise<Record<string, (number | null)[]>> {
  try {
    const raw = localStorage.getItem(FX_CACHE_KEY)
    if (raw) {
      const { ts, data } = JSON.parse(raw) as { ts: number; data: Record<string, (number | null)[]> }
      if (Date.now() - ts < FX_CACHE_TTL) return data
    }
  } catch {}

  const res = await fetch('/api/fx')
  if (!res.ok) return {}

  const data: Record<string, (number | null)[]> = await res.json()

  try {
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
  } catch {}

  return data
}

export function clearFxCache() {
  try { localStorage.removeItem(FX_CACHE_KEY) } catch {}
}
