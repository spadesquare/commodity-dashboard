import { DT, DT_FULL } from './commodities'
export { DT, DT_FULL }

// ─── Data source note ──────────────────────────────────────────────────────
// Exchange rates are approximate monthly averages compiled from public sources
// (ECB Statistical Data Warehouse, FRED / Federal Reserve, IMF IFS) and are
// suitable for illustrative trend analysis. They are NOT real-time or
// guaranteed accurate. For production use replace with a live FX API
// (e.g. ECB Data Portal, Frankfurter.app, Open Exchange Rates).
// ──────────────────────────────────────────────────────────────────────────

export interface FxSeries {
  id: string
  label: string
  base: string
  quote: string
  baseFlag: string
  quoteFlag: string
  baseName: string    // currency code label on map
  quoteName: string
  baseLat: number; baseLng: number
  quoteLat: number; quoteLng: number
  c: string
  decimals: number
  description: string
}

// EUR-centric ordering — Europe buyer perspective
export const FX_SERIES: FxSeries[] = [
  { id:'eur_usd', label:'EUR/USD', base:'EUR', quote:'USD', baseFlag:'🇪🇺', quoteFlag:'🇺🇸', baseName:'EUR', quoteName:'USD', baseLat:50.11, baseLng:8.68,    quoteLat:40.71,  quoteLng:-74.01, c:'#6366f1', decimals:4, description:'Euro vs US Dollar' },
  { id:'eur_cny', label:'EUR/CNY', base:'EUR', quote:'CNY', baseFlag:'🇪🇺', quoteFlag:'🇨🇳', baseName:'EUR', quoteName:'CNY', baseLat:50.11, baseLng:8.68,    quoteLat:31.23,  quoteLng:121.47, c:'#06c4d4', decimals:4, description:'Euro vs Chinese Yuan' },
  { id:'eur_gbp', label:'EUR/GBP', base:'EUR', quote:'GBP', baseFlag:'🇪🇺', quoteFlag:'🇬🇧', baseName:'EUR', quoteName:'GBP', baseLat:50.11, baseLng:8.68,    quoteLat:51.51,  quoteLng:-0.13,  c:'#a78bfa', decimals:4, description:'Euro vs British Pound' },
  { id:'eur_brl', label:'EUR/BRL', base:'EUR', quote:'BRL', baseFlag:'🇪🇺', quoteFlag:'🇧🇷', baseName:'EUR', quoteName:'BRL', baseLat:50.11, baseLng:8.68,    quoteLat:-23.55, quoteLng:-46.63, c:'#22c55e', decimals:4, description:'Euro vs Brazilian Real' },
  { id:'eur_jpy', label:'EUR/JPY', base:'EUR', quote:'JPY', baseFlag:'🇪🇺', quoteFlag:'🇯🇵', baseName:'EUR', quoteName:'JPY', baseLat:50.11, baseLng:8.68,    quoteLat:35.68,  quoteLng:139.69, c:'#f87171', decimals:2, description:'Euro vs Japanese Yen' },
  { id:'usd_cny', label:'USD/CNY', base:'USD', quote:'CNY', baseFlag:'🇺🇸', quoteFlag:'🇨🇳', baseName:'USD', quoteName:'CNY', baseLat:40.71, baseLng:-74.01,  quoteLat:31.23,  quoteLng:121.47, c:'#f59e0b', decimals:4, description:'US Dollar vs Chinese Yuan (reference)' },
]
export const FX_MAP = Object.fromEntries(FX_SERIES.map(s => [s.id, s]))

// Unique map locations with currency labels
export const FX_LOCATIONS: { code: string; flag: string; lat: number; lng: number; xPct: number; yPct: number }[] = [
  { code:'EUR', flag:'🇪🇺', lat:50.11,  lng:8.68,    xPct:53.0, yPct:19.5 },
  { code:'USD', flag:'🇺🇸', lat:40.71,  lng:-74.01,  xPct:29.5, yPct:27.5 },
  { code:'CNY', flag:'🇨🇳', lat:31.23,  lng:121.47,  xPct:83.7, yPct:33.0 },
  { code:'BRL', flag:'🇧🇷', lat:-23.55, lng:-46.63,  xPct:37.0, yPct:63.5 },
  { code:'GBP', flag:'🇬🇧', lat:51.51,  lng:-0.13,   xPct:49.5, yPct:17.5 },
  { code:'JPY', flag:'🇯🇵', lat:35.68,  lng:139.69,  xPct:88.8, yPct:30.5 },
]

// Monthly data Jan 2023 → Apr 2026 (40 points)
// Source: approximate monthly averages — see note above
export const FX: Record<string, number[]> = {
  // EUR/USD — Euro area, ECB reference rate
  eur_usd: [1.0752,1.0731,1.0882,1.0982,1.0774,1.0921,1.1118,1.0869,1.0581,1.0601,1.0884,1.1032,1.0850,1.0798,1.0883,1.0649,1.0848,1.0733,1.0869,1.1013,1.1101,1.0929,1.0561,1.0462,1.0302,1.0375,1.0817,1.0729,1.1362,1.1352,1.1782,1.1048,1.1063,1.0931,1.0570,1.0480,1.0413,1.0682,1.0940,1.1201],
  // EUR/CNY — derived: EUR/USD × USD/CNY
  eur_cny: [7.258,7.377,7.479,7.606,7.593,7.847,7.946,7.919,7.739,7.741,7.890,7.888,7.788,7.805,7.856,7.706,7.863,7.801,7.887,7.861,7.849,7.787,7.644,7.492,7.471,7.516,7.840,7.840,8.243,8.247,8.452,7.844,7.911,7.909,7.651,7.613,7.607,7.728,7.868,8.112],
  // EUR/GBP — derived: EUR/USD ÷ GBP/USD
  eur_gbp: [0.8989,0.8906,0.8840,0.8829,0.8633,0.8585,0.8686,0.8545,0.8659,0.8733,0.8770,0.8666,0.8529,0.8534,0.8569,0.8541,0.8542,0.8445,0.8426,0.8659,0.8436,0.8388,0.8356,0.8238,0.8288,0.8214,0.8373,0.8104,0.8524,0.8855,0.9162,0.8414,0.8420,0.8422,0.8343,0.8331,0.8384,0.8261,0.8461,0.8603],
  // EUR/BRL — derived: EUR/USD × BRL/USD
  eur_brl: [5.467,5.542,5.691,5.512,5.357,5.282,5.333,5.423,5.308,5.273,5.307,5.353,5.334,5.354,5.404,5.383,5.596,5.790,5.912,5.961,6.094,6.177,6.131,5.102,6.026,5.953,6.346,6.534,6.729,6.847,6.817,6.433,6.405,6.374,6.320,6.404,6.115,6.316,6.420,6.443],
  // EUR/JPY — derived: EUR/USD × JPY/USD
  eur_jpy: [140.4,141.3,143.2,147.1,147.3,154.9,154.8,157.1,157.3,158.4,162.9,157.1,160.6,162.5,164.5,161.3,170.3,169.6,174.7,162.6,158.7,166.3,161.7,165.1,159.9,156.4,161.5,164.7,163.2,164.6,181.9,161.9,158.2,163.4,162.7,163.6,160.6,158.2,163.8,159.4],
  // USD/CNY — PBOC fixing reference
  usd_cny: [6.752,6.875,6.874,6.927,7.050,7.186,7.146,7.285,7.315,7.303,7.252,7.151,7.178,7.227,7.221,7.236,7.247,7.270,7.256,7.143,7.071,7.124,7.239,7.163,7.253,7.241,7.246,7.305,7.256,7.266,7.175,7.099,7.153,7.236,7.238,7.264,7.308,7.236,7.192,7.243],
}
