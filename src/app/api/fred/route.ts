import { NextRequest, NextResponse } from 'next/server'

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'
const OBS_START = '2023-01-01'
const OBS_END   = '2026-05-01'

// Quarterly series — FRED rejects frequency=m for these
const QUARTERLY_IDS = new Set(['CCRETT02EZQ661N', 'CCRETT02DEQ661N'])

// Align to 40-month grid with forward-fill.
// Forward-fill handles publication lags (trailing nulls) and quarterly→monthly expansion.
function toGrid(obs: { date: string; value: string }[]): (number | null)[] {
  const map = new Map<string, number | null>()
  for (const o of obs) {
    const key = o.date.slice(0, 7)
    const v = parseFloat(o.value)
    map.set(key, isNaN(v) ? null : v)
  }
  const raw: (number | null)[] = []
  for (let m = 0; m < 40; m++) {
    const d = new Date(Date.UTC(2023, m, 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    raw.push(map.get(key) ?? null)
  }
  let last: number | null = null
  return raw.map(v => { if (v != null) last = v; return last })
}

export async function GET(req: NextRequest) {
  const seriesParam = req.nextUrl.searchParams.get("series")
  if (!seriesParam) return NextResponse.json({}, { status: 400 })

  const apiKey = process.env.FRED_API_KEY
  if (!apiKey) return NextResponse.json({ error: "FRED_API_KEY not configured" }, { status: 500 })

  const ids = seriesParam.split(",").map(s => s.trim()).filter(Boolean)

  const results = await Promise.allSettled(
    ids.map(async id => {
      const isQ = QUARTERLY_IDS.has(id)
      const url =
        `${FRED_BASE}?series_id=${id}&api_key=${apiKey}` +
        `&file_type=json&observation_start=${OBS_START}&observation_end=${OBS_END}` +
        `&frequency=${isQ ? "q" : "m"}&aggregation_method=avg`
      const res = await fetch(url, { next: { revalidate: 3600 } })
      if (!res.ok) throw new Error(`FRED HTTP ${res.status} for ${id}`)
      const json = await res.json()
      if (json.error_message) throw new Error(`FRED error for ${id}: ${json.error_message}`)
      return { id, data: toGrid(json.observations ?? []) }
    })
  )

  const out: Record<string, (number | null)[]> = {}
  for (const r of results) {
    if (r.status === "fulfilled") out[r.value.id] = r.value.data
  }

  return NextResponse.json(out)
}
