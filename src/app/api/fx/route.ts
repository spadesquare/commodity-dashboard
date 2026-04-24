import { NextResponse } from 'next/server'

const BASE_URL = 'https://api.frankfurter.dev/v1/2023-01-01..2026-04-30'
const QUOTES = ['USD','CNY','GBP','BRL','JPY','CHF','INR','KRW','MXN','PLN','SEK','SGD','THB','TRY','ZAR']

const PAIR_MAP: Record<string, string> = {
  USD:'eur_usd', CNY:'eur_cny', GBP:'eur_gbp', BRL:'eur_brl', JPY:'eur_jpy',
  CHF:'eur_chf', INR:'eur_inr', KRW:'eur_krw', MXN:'eur_mxn', PLN:'eur_pln',
  SEK:'eur_sek', SGD:'eur_sgd', THB:'eur_thb', TRY:'eur_try', ZAR:'eur_zar',
}

function buildGrid(monthly: Record<string, number[]>): (number | null)[] {
  const grid: (number | null)[] = []
  for (let m = 0; m < 40; m++) {
    const d = new Date(Date.UTC(2023, m, 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const vals = monthly[key]
    grid.push(vals && vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null)
  }
  return grid
}

export async function GET() {
  try {
    const res = await fetch(`${BASE_URL}?base=EUR&to=${QUOTES.join(',')}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return NextResponse.json({}, { status: 502 })

    const json = await res.json()
    const rates: Record<string, Record<string, number>> = json.rates ?? {}

    // Group daily observations by month for each quote currency
    const byQuote: Record<string, Record<string, number[]>> = {}
    for (const [date, quoteMap] of Object.entries(rates)) {
      const month = date.slice(0, 7)
      for (const [quote, rate] of Object.entries(quoteMap)) {
        if (!byQuote[quote]) byQuote[quote] = {}
        if (!byQuote[quote][month]) byQuote[quote][month] = []
        byQuote[quote][month].push(rate as number)
      }
    }

    const out: Record<string, (number | null)[]> = {}
    for (const quote of QUOTES) {
      const pairId = PAIR_MAP[quote]
      out[pairId] = buildGrid(byQuote[quote] ?? {})
    }

    // USD/CNY derived from EUR/CNY ÷ EUR/USD
    const eurUsd = out['eur_usd'], eurCny = out['eur_cny']
    if (eurUsd && eurCny) {
      out['usd_cny'] = eurUsd.map((u, i) => {
        const c = eurCny[i]
        return u && c ? Math.round((c / u) * 10000) / 10000 : null
      })
    }

    return NextResponse.json(out)
  } catch {
    return NextResponse.json({}, { status: 502 })
  }
}
