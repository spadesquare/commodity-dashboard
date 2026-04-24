import type { RawData } from '@/data/commodities'

// ourId → FRED series ID
export const FRED_MAP: Record<string, string> = {
  // Energy
  nat_gas_us: 'MHHNGSP',            // Henry Hub Natural Gas, $/MMBtu (monthly)
  nat_gas_eu: 'PNGASEUUSDM',        // Natural Gas Europe, $/MMBtu (World Bank, monthly)
  nat_gas_cn: 'PNGASJPUSDM',        // Japan/Asia LNG spot, $/MMBtu (best FRED proxy for CN)
  // Labor (US)
  labor_us:   'CES0500000003',       // Avg Hourly Earnings, All Private, $/hr (monthly)
  // Labor (EU / Germany) — quarterly ULC REER, forward-filled to monthly
  labor_eu:   'CCRETT02EZQ661N',    // Unit Labour Costs REER, Euro Area (quarterly)
  labor_de:   'CCRETT02DEQ661N',    // Unit Labour Costs REER, Germany (quarterly, →2026-Q1)
  // CPI / Inflation
  cpi_us:     'CPIAUCSL',           // CPI All Urban Consumers, US (monthly)
  cpi_eu:     'CP1100EZ19M086NEST', // HICP Restaurants & Hotels, EU — labor-intensive proxy
  cpi_cn:     'CHNCPIALLMINMEI',    // CPI All Items, China (OECD, monthly)
  // EU country CPI (OECD MEI, 2015=100, monthly)
  cpi_de:     'DEUCPIALLMINMEI',    // Germany CPI
  cpi_fr:     'FRACPIALLMINMEI',    // France CPI
  cpi_it:     'ITACPIALLMINMEI',    // Italy CPI
  cpi_es:     'ESPCPIALLMINMEI',    // Spain CPI
  cpi_at:     'AUTCPIALLMINMEI',    // Austria CPI
  // PPI / Other
  ppi_us:     'PPIACO',             // PPI All Commodities, US
  pallet:     'PCU3219132191',      // PPI: Wood Pallets & Skids (BLS)
  trucking:   'WPU3012',            // PPI: Truck Transportation of Freight (BLS)
  // Note: labor_cn has no reliable FRED series — add via Manage Data if needed
}

// Set of our series IDs that have live FRED data
export const LIVE_FRED_IDS = new Set(Object.keys(FRED_MAP))

// Bump this key when adding new series to force a cache refresh
const CACHE_KEY = 'fred_data_v2'
const CACHE_TTL = 4 * 60 * 60 * 1000 // 4 hours

export async function loadFredData(): Promise<RawData> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const { ts, data } = JSON.parse(raw) as { ts: number; data: RawData }
      if (Date.now() - ts < CACHE_TTL) return data
    }
  } catch {}

  const fredIds = Object.values(FRED_MAP).join(',')
  const res = await fetch(`/api/fred?series=${fredIds}`)
  if (!res.ok) return {}

  const byFredId: Record<string, (number | null)[]> = await res.json()

  const result: RawData = {}
  for (const [ourId, fredId] of Object.entries(FRED_MAP)) {
    if (byFredId[fredId]) result[ourId] = byFredId[fredId]
  }

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: result }))
  } catch {}

  return result
}

export function clearFredCache() {
  try { localStorage.removeItem(CACHE_KEY) } catch {}
}
