"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { DT, DT_FULL, R as DefaultR, SC, CATEGORIES, type Category, type RawData, type Series } from "@/data/commodities"
import { loadFredData, LIVE_FRED_IDS } from "@/lib/fred"
import { PriceTrendsChart } from "./PriceTrendsChart"
import { CostModelPanel } from "./CostModelPanel"
import { MarketSnapshot } from "./MarketSnapshot"
import { SpreadsPanel } from "./SpreadsPanel"
import { DataManager } from "./DataManager"
import { CurrencyPanel } from "./CurrencyPanel"
import { Sun, Moon, TrendingUp, TrendingDown, Activity, Calendar, BarChart2 } from "lucide-react"

const DATA_KEY = 'commodity_custom_data'
const SERIES_KEY = 'commodity_custom_series'

function loadCustomData(): RawData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(DATA_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function loadCustomSeries(): Series[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SERIES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

// ─── Static KPI cards ─────────────────────────────────────────────
interface KpiDef {
  label: string
  main: string
  mainColor?: string
  sub: string
  dotColor?: string
  icon: React.ReactNode
}

function computeKpis(cat: Category, fromIdx: number, toIdx: number, hidden: Set<string>, R: RawData): KpiDef[] {
  const activeSC = cat === 'all' ? SC : SC.filter(s => s.cat === cat)
  const visible = activeSC.filter(s => !hidden.has(s.id))
  const fi = Math.min(fromIdx, toIdx), ti = Math.max(fromIdx, toIdx)
  const monthSpan = ti - fi

  const stats = visible.map(s => {
    const d = R[s.id]; const fv = d?.[fi], tv = d?.[ti]
    if (fv == null || tv == null || fv === 0) return null
    return { ...s, change: ((tv - fv) / fv) * 100 }
  }).filter(Boolean) as (typeof SC[0] & { change: number })[]

  const avgChange = stats.length ? stats.reduce((a, s) => a + s.change, 0) / stats.length : 0
  const inc = stats.length ? stats.reduce((a, b) => b.change > a.change ? b : a) : null
  const dec = stats.length ? stats.reduce((a, b) => b.change < a.change ? b : a) : null

  return [
    {
      label: 'Period',
      main: monthSpan === 0 ? '1 mo' : `${monthSpan} mo`,
      sub: `${DT[fi]} → ${DT[ti]}`,
      icon: <Calendar className="w-4 h-4" />,
    },
    {
      label: 'Showing',
      main: `${visible.length}/${activeSC.length}`,
      sub: cat === 'all' ? 'All categories' : cat.charAt(0).toUpperCase() + cat.slice(1),
      icon: <BarChart2 className="w-4 h-4" />,
    },
    {
      label: 'Avg Change',
      main: stats.length ? `${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(1)}%` : '—',
      mainColor: avgChange > 0.5 ? 'var(--d-red)' : avgChange < -0.5 ? 'var(--d-green)' : undefined,
      sub: `across ${stats.length} series`,
      icon: <Activity className="w-4 h-4" />,
    },
    {
      label: 'Biggest Increase',
      main: inc ? `+${inc.change.toFixed(1)}%` : '—',
      mainColor: 'var(--d-red)',
      sub: inc?.label ?? 'No data',
      dotColor: 'var(--d-red)',
      icon: <TrendingUp className="w-4 h-4" style={{ color: 'var(--d-red)' }} />,
    },
    {
      label: 'Biggest Decrease',
      main: dec ? `${dec.change.toFixed(1)}%` : '—',
      mainColor: 'var(--d-green)',
      sub: dec?.label ?? 'No data',
      dotColor: 'var(--d-green)',
      icon: <TrendingDown className="w-4 h-4" style={{ color: 'var(--d-green)' }} />,
    },
  ]
}

function KpiStrip({ kpis }: { kpis: KpiDef[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10, marginBottom: 24 }}>
      {kpis.map((k, i) => (
        <div key={i} className="kpi-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--d-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k.label}</span>
            <span style={{ color: 'var(--d-dim)', opacity: 0.7 }}>{k.icon}</span>
          </div>
          <div style={{ fontFamily: "'Fira Code',monospace", fontSize: 26, fontWeight: 600, lineHeight: 1.1, color: k.mainColor ?? 'var(--d-text)', marginBottom: 6, letterSpacing: '-0.02em' }}>{k.main}</div>
          <div style={{ fontSize: 12, color: 'var(--d-muted)', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {k.dotColor && <span style={{ width: 7, height: 7, borderRadius: '50%', background: k.dotColor, flexShrink: 0, display: 'inline-block' }} />}
            {k.sub}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Tab types ─────────────────────────────────────────────────────
type Tab = 'trends' | 'model' | 'snapshot' | 'spreads' | 'currency' | 'data'

const TABS: { id: Tab; label: string }[] = [
  { id: 'trends',   label: 'Price Trends' },
  { id: 'model',    label: 'Cost Model' },
  { id: 'snapshot', label: 'Market Snapshot' },
  { id: 'spreads',  label: 'EU / CN Spreads' },
  { id: 'currency', label: 'FX / Currencies' },
  { id: 'data',     label: 'Manage Data' },
]

// ─── Main Dashboard ───────────────────────────────────────────────
export function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('trends')
  const [cat, setCat] = useState<Category>('all')
  const [fromIdx, setFromIdx] = useState(0)
  const [toIdx, setToIdx] = useState(DT.length - 1)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [isLight, setIsLight] = useState(true)
  const [customR, setCustomR] = useState<RawData | null>(null)
  const [customSeries, setCustomSeries] = useState<Series[]>([])
  const [fredR, setFredR] = useState<RawData>({})
  const [fredLoaded, setFredLoaded] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [toastSuccess, setToastSuccess] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setCustomR(loadCustomData())
    setCustomSeries(loadCustomSeries())
    loadFredData().then(data => { setFredR(data); setFredLoaded(true) }).catch(() => setFredLoaded(true))
  }, [])

  // Priority: user custom data > FRED live data > static defaults
  const R = useMemo<RawData>(() => ({
    ...DefaultR,
    ...fredR,
    ...(customR ?? {}),
  }), [customR, fredR])
  const effectiveSC = useMemo(() => [...SC, ...customSeries], [customSeries])

  const onSeriesSaved = useCallback((series: Series[]) => {
    setCustomSeries(series)
    localStorage.setItem(SERIES_KEY, JSON.stringify(series))
  }, [])

  const toast = useCallback((msg: string, success = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToastMsg(msg); setToastSuccess(success); setToastVisible(true)
    toastTimer.current = setTimeout(() => setToastVisible(false), 2600)
  }, [])

  const onDataSaved = useCallback((newR: RawData) => {
    setCustomR(newR)
    localStorage.setItem(DATA_KEY, JSON.stringify(newR))
    toast('Data updated successfully', true)
  }, [toast])

  const kpis = computeKpis(cat, fromIdx, toIdx, hidden, R)

  return (
    <div className={isLight ? 'light' : ''} style={{ minHeight: '100vh', background: 'var(--d-bg)', color: 'var(--d-text)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '32px clamp(16px,4vw,56px)' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
          <div>
            <h1 className="grad-text" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.2 }}>
              Commodity Price Dashboard
            </h1>
            <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 12, color: 'var(--d-muted)', marginTop: 5 }}>
              {fredLoaded ? `${SC.length} series` : '21 series · loading live data…'} · Jan 2023 – Apr 2026 · Plastics · Metals · Energy · Labor · Macro
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {customR && (
              <span style={{ fontSize: 11, fontFamily: "'Fira Code',monospace", color: 'var(--d-brand)', background: 'var(--d-brand-bg)', border: '1px solid var(--d-border-f)', borderRadius: 6, padding: '4px 10px' }}>
                Custom data active
              </span>
            )}
            <button
              className="d-btn"
              onClick={() => setIsLight(v => !v)}
              style={{ gap: 6, padding: '8px 16px', fontSize: 13, borderRadius: 22 }}
            >
              {isLight ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
              {isLight ? 'Dark' : 'Light'}
            </button>
          </div>
        </div>

        {/* ── KPI Strip ── */}
        <KpiStrip kpis={kpis} />

        {/* ── Tabs ── */}
        <div className="tab-bar" style={{ marginBottom: 24 }}>
          {TABS.map(t => (
            <button key={t.id} className={`tab-bar-item${activeTab === t.id ? ' active' : ''}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Panels ── */}
        {activeTab === 'trends' && (
          <PriceTrendsChart
            cat={cat} setCat={setCat}
            fromIdx={fromIdx} setFromIdx={setFromIdx}
            toIdx={toIdx} setToIdx={setToIdx}
            hidden={hidden} setHidden={setHidden}
            isLight={isLight} R={R} toast={toast}
            liveIds={fredLoaded ? new Set(Object.keys(fredR)) : new Set<string>()}
          />
        )}
        {activeTab === 'model' && <CostModelPanel isLight={isLight} R={R} toast={toast} liveIds={fredLoaded ? new Set(Object.keys(fredR)) : new Set<string>()} />}
        {activeTab === 'snapshot' && <MarketSnapshot isLight={isLight} R={R} toast={toast} liveIds={fredLoaded ? new Set(Object.keys(fredR)) : new Set<string>()} />}
        {activeTab === 'spreads' && <SpreadsPanel R={R} />}
        {activeTab === 'currency' && <CurrencyPanel isLight={isLight} toast={toast} />}
        {activeTab === 'data' && <DataManager R={R} onSave={onDataSaved} onReset={() => { setCustomR(null); localStorage.removeItem(DATA_KEY); toast('Reset to default data', true) }} toast={toast} customSeries={customSeries} onSeriesSaved={onSeriesSaved} />}

        {/* ── Footer ── */}
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--d-border)', fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-dim)', lineHeight: 1.8 }}>
          Plastics: EUR/t (Europe), USD/t (China) · Metals: USD/t (LME) · Shipping: USD/FEU · Energy: EUR/MWh, CNY/MWh, USD/bbl<br />
          <span style={{ color: 'var(--d-red)' }}>Red = price rising (bad for buyers)</span>
          {' · '}
          <span style={{ color: 'var(--d-green)' }}>Green = price falling (good for buyers)</span>
        </div>
      </div>

      {/* ── Toast ── */}
      <div className={`d-toast${toastVisible ? ' show' : ''}${toastSuccess ? ' success' : ''}`}>
        {toastMsg}
      </div>
    </div>
  )
}
