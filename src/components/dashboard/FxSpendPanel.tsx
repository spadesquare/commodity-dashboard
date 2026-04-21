"use client"

import { useState, useEffect, useRef } from "react"
import { Line } from "react-chartjs-2"
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend, Filler, type ChartOptions
} from "chart.js"
import { DT, FX } from "@/data/currencies"
import { Plus, Trash2, Save, AlertCircle } from "lucide-react"
import html2canvas from "html2canvas"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const CCY_META: Record<string, { flag: string; name: string; c: string }> = {
  EUR: { flag: '🇪🇺', name: 'Euro',           c: '#6366f1' },
  USD: { flag: '🇺🇸', name: 'US Dollar',      c: '#f87171' },
  CNY: { flag: '🇨🇳', name: 'Chinese Yuan',   c: '#06c4d4' },
  GBP: { flag: '🇬🇧', name: 'British Pound',  c: '#a78bfa' },
  BRL: { flag: '🇧🇷', name: 'Brazilian Real', c: '#22c55e' },
  JPY: { flag: '🇯🇵', name: 'Japanese Yen',   c: '#f59e0b' },
}
const CCY_SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', CNY: '¥', BRL: 'R$', JPY: '¥' }
const ALL_CODES = ['EUR', 'USD', 'CNY', 'GBP', 'BRL', 'JPY']
const LS_KEY = 'fx_spend_profile_v2'

interface Alloc {
  code: string
  weight: number
  supplierRate: string   // rate(base→code) contracted with supplier; '' = not set
  controlRate: string    // rate(base→code) internal budget/plan rate; '' = not set
}
interface Profile { base: string; spend: number; allocations: Alloc[] }

const EMPTY_ALLOC_EXTRAS = { supplierRate: '', controlRate: '' }

const DEFAULT_ALLOCS: Alloc[] = [
  { code: 'EUR', weight: 40, ...EMPTY_ALLOC_EXTRAS },
  { code: 'USD', weight: 30, ...EMPTY_ALLOC_EXTRAS },
  { code: 'CNY', weight: 15, ...EMPTY_ALLOC_EXTRAS },
  { code: 'GBP', weight: 10, ...EMPTY_ALLOC_EXTRAS },
  { code: 'JPY', weight:  5, ...EMPTY_ALLOC_EXTRAS },
]

// rate(base → quote) at index idx, pivoting via EUR
function getRate(base: string, quote: string, idx: number): number | null {
  if (base === quote) return 1
  if (base === 'EUR') return FX[`eur_${quote.toLowerCase()}`]?.[idx] ?? null
  if (quote === 'EUR') {
    const r = FX[`eur_${base.toLowerCase()}`]?.[idx]
    return r ? 1 / r : null
  }
  const eurB = FX[`eur_${base.toLowerCase()}`]?.[idx]
  const eurQ = FX[`eur_${quote.toLowerCase()}`]?.[idx]
  if (!eurB || !eurQ) return null
  return eurQ / eurB
}

function parseRate(s: string): number | null {
  const v = parseFloat(s)
  return isFinite(v) && v > 0 ? v : null
}

function fmtRate(v: number | null): string {
  if (v == null) return '—'
  if (v >= 100) return v.toFixed(1)
  if (v >= 10)  return v.toFixed(2)
  return v.toFixed(4)
}

function deltaColor(v: number | null, isLight: boolean): string {
  if (v == null) return 'var(--d-dim)'
  return v < -0.1 ? (isLight ? '#16a34a' : '#22c55e')
       : v >  0.1 ? (isLight ? '#dc2626' : '#f87171')
       : 'var(--d-muted)'
}

function DeltaBadge({ v, isLight, size = 11 }: { v: number | null; isLight: boolean; size?: number }) {
  if (v == null) return <span style={{ color: 'var(--d-dim)', fontFamily: "'Fira Code',monospace", fontSize: size }}>—</span>
  const c = deltaColor(v, isLight)
  return <span style={{ fontFamily: "'Fira Code',monospace", fontSize: size, fontWeight: 600, color: c }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}%</span>
}

// Small editable rate cell
function RateInput({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text" inputMode="decimal" value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{
        width: 76, textAlign: 'right', fontFamily: "'Fira Code',monospace", fontSize: 11,
        background: 'var(--d-raised)', color: value ? 'var(--d-text)' : 'var(--d-dim)',
        border: `1px solid ${value ? 'var(--d-border-f)' : 'var(--d-border)'}`,
        borderRadius: 5, padding: '4px 6px', outline: 'none',
      }}
      onFocus={e => (e.currentTarget.style.borderColor = 'var(--d-border-f)')}
      onBlur={e => (e.currentTarget.style.borderColor = e.currentTarget.value ? 'var(--d-border-f)' : 'var(--d-border)')}
    />
  )
}

export function FxSpendPanel({ isLight, fi, ti, toast }: {
  isLight: boolean; fi: number; ti: number; toast: (m: string, s?: boolean) => void
}) {
  const [base, setBase]           = useState('EUR')
  const [spend, setSpend]         = useState(1_000_000)
  const [allocs, setAllocs]       = useState<Alloc[]>(DEFAULT_ALLOCS.map(a => ({ ...a })))
  const [showSupplier, setShowSupplier] = useState(false)
  const [showControl,  setShowControl]  = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') as Profile | null
      if (saved) {
        setBase(saved.base)
        setSpend(saved.spend)
        // migrate rows that may lack the new fields
        setAllocs(saved.allocations.map(a => ({ ...EMPTY_ALLOC_EXTRAS, ...a })))
      }
    } catch {}
  }, [])

  const totalWeight = allocs.reduce((s, a) => s + a.weight, 0)
  const labels = DT.slice(fi, ti + 1)

  // Generalised basket: for each alloc, getRef returns the "baseline rate" to use
  // cost_ratio = ref_rate / market_now → < 1 means cheaper than ref, > 1 means pricier
  function computeBasket(getRef: (a: Alloc) => number | null): (number | null)[] {
    return labels.map((_, i) => {
      const absIdx = fi + i
      let total = 0, wTotal = 0
      for (const a of allocs) {
        const ref = getRef(a)
        const rt  = getRate(base, a.code, absIdx)
        if (!ref || !rt) continue
        total += (ref / rt) * a.weight; wTotal += a.weight
      }
      return wTotal > 0 ? +(total / wTotal * 100).toFixed(3) : null
    })
  }

  const mktBasket  = computeBasket(a => getRate(base, a.code, fi))
  const suppBasket = computeBasket(a => parseRate(a.supplierRate) ?? getRate(base, a.code, fi))
  const ctrlBasket = computeBasket(a => parseRate(a.controlRate)  ?? getRate(base, a.code, fi))

  const mktNow  = mktBasket.at(-1);   const mktImpact  = mktNow  != null ? mktNow  - 100 : null
  const suppNow = suppBasket.at(-1);  const suppImpact = suppNow != null ? suppNow - 100 : null
  const ctrlNow = ctrlBasket.at(-1);  const ctrlImpact = ctrlNow != null ? ctrlNow - 100 : null

  const hasSupplierRates = allocs.some(a => parseRate(a.supplierRate) != null)
  const hasControlRates  = allocs.some(a => parseRate(a.controlRate)  != null)

  // Per-row stats at ti
  const allocStats = allocs.map(a => {
    const r0   = getRate(base, a.code, fi)
    const rt   = getRate(base, a.code, ti)
    const mktDelta  = r0 && rt ? (r0 / rt - 1) * 100 : null
    const rateChg   = r0 && rt ? (rt - r0) / r0 * 100 : null
    const sr = parseRate(a.supplierRate)
    const cr = parseRate(a.controlRate)
    const suppDelta = sr && rt ? (sr / rt - 1) * 100 : null
    const ctrlDelta = cr && rt ? (cr / rt - 1) * 100 : null
    return { ...a, r0, rt, rateChg, mktDelta, suppDelta, ctrlDelta }
  })

  const foreign = allocStats.filter(s => s.code !== base && s.mktDelta != null)
  const bestMkt  = foreign.length ? foreign.reduce((a, b) => b.mktDelta! < a.mktDelta! ? b : a) : null
  const worstMkt = foreign.length ? foreign.reduce((a, b) => b.mktDelta! > a.mktDelta! ? b : a) : null

  const winning = mktImpact != null && mktImpact < -0.1
  const losing  = mktImpact != null && mktImpact > 0.1
  const mktColor    = deltaColor(mktImpact, isLight)
  const mktColorHex = winning ? (isLight ? '#16a34a' : '#22c55e') : losing ? (isLight ? '#dc2626' : '#f87171') : undefined
  const absImpact   = spend > 0 && mktImpact != null ? spend * mktImpact / 100 : null
  const sym = CCY_SYMBOL[base] ?? base

  // Chart
  const gc = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'
  const tc = isLight ? '#94a3b8' : '#4a5568'

  const activeMeasures = [
    { label: 'Market',   data: mktBasket,  color: mktColorHex ?? '#6366f1', always: true  },
    { label: 'Supplier', data: suppBasket, color: '#f59e0b',                always: false, active: showSupplier && hasSupplierRates },
    { label: 'Budget',   data: ctrlBasket, color: '#a78bfa',                always: false, active: showControl  && hasControlRates  },
  ].filter(m => m.always || m.active)

  const chartDatasets = [
    ...activeMeasures.map((m, idx) => ({
      label: m.label,
      data: m.data,
      borderColor: m.color,
      backgroundColor: idx === 0 ? `${m.color}14` : 'transparent',
      borderWidth: idx === 0 ? 2 : 1.5,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.35,
      fill: idx === 0,
      spanGaps: true,
    })),
    // Reference line at 100
    {
      label: 'Baseline',
      data: labels.map(() => 100),
      borderColor: isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.12)',
      backgroundColor: 'transparent',
      borderWidth: 1,
      pointRadius: 0,
      fill: false,
      tension: 0,
      spanGaps: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  ]

  const showLegend = activeMeasures.length > 1

  const chartOptions: ChartOptions<'line'> = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: showLegend,
        labels: { color: tc, font: { family: "'Fira Code',monospace", size: 10 }, boxWidth: 12, padding: 14,
          filter: item => item.text !== 'Baseline' }
      },
      tooltip: {
        backgroundColor: isLight ? '#fff' : '#060a10',
        borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)', borderWidth: 1,
        titleColor: isLight ? '#0f172a' : '#eef2ff',
        bodyColor: isLight ? '#475569' : '#9ca3af',
        titleFont: { family: "'Fira Code',monospace", size: 11 },
        bodyFont:  { family: "'Fira Code',monospace", size: 11 },
        filter: item => item.dataset.label !== 'Baseline',
        callbacks: {
          label: ctx => {
            const v = ctx.parsed.y ?? 0
            return ` ${ctx.dataset.label}: ${v.toFixed(2)} (${v >= 100 ? '+' : ''}${(v - 100).toFixed(2)}%)`
          }
        }
      }
    },
    scales: {
      x: { grid: { color: gc }, ticks: { color: tc, font: { family: "'Fira Code',monospace", size: 10 }, maxTicksLimit: 14 } },
      y: { grid: { color: gc }, ticks: { color: tc, font: { family: "'Fira Code',monospace", size: 10 }, callback: v => (+v).toFixed(1) } },
    },
  }

  function saveProfile() {
    localStorage.setItem(LS_KEY, JSON.stringify({ base, spend, allocations: allocs }))
    toast('Profile saved', true)
  }

  function normalize() {
    if (totalWeight === 0) return
    const scale = 100 / totalWeight
    setAllocs(prev => prev.map(a => ({ ...a, weight: Math.round(a.weight * scale) })))
  }

  function addRow() {
    const used = new Set(allocs.map(a => a.code))
    const next = ALL_CODES.find(c => !used.has(c))
    if (!next) return
    setAllocs(prev => [...prev, { code: next, weight: 0, ...EMPTY_ALLOC_EXTRAS }])
  }

  function updateAlloc(i: number, patch: Partial<Alloc>) {
    setAllocs(prev => { const next = [...prev]; next[i] = { ...next[i], ...patch }; return next })
  }

  async function exportChart() {
    if (!chartRef.current) return
    const bg = isLight ? '#f0f4fa' : '#060a14'
    const el = chartRef.current
    const prev = { bg: el.style.background, bd: el.style.backdropFilter }
    const style = el.style as CSSStyleDeclaration & Record<string, string>
    const prevWbd = style['-webkit-backdrop-filter'] ?? ''
    el.style.background = bg; el.style.backdropFilter = 'none'; style['-webkit-backdrop-filter'] = 'none'
    try {
      const canvas = await html2canvas(el, { backgroundColor: bg, scale: 2, logging: false, useCORS: true, allowTaint: true })
      const a = document.createElement('a'); a.download = 'fx-basket-index.png'; a.href = canvas.toDataURL(); a.click()
      toast('Chart exported', true)
    } finally {
      el.style.background = prev.bg; el.style.backdropFilter = prev.bd; style['-webkit-backdrop-filter'] = prevWbd
    }
  }

  // Column toggle button style
  const toggleBtn = (active: boolean, color: string) => ({
    padding: '4px 10px', fontSize: 10, fontWeight: 600,
    borderRadius: 20, cursor: 'pointer', letterSpacing: '0.04em',
    border: `1px solid ${active ? color : 'var(--d-border)'}`,
    background: active ? `${color}18` : 'var(--d-raised)',
    color: active ? color : 'var(--d-muted)',
    transition: 'all 0.15s',
  } as React.CSSProperties)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Section header */}
      <div style={{ paddingTop: 10, borderTop: '1px solid var(--d-border)' }}>
        <h3 className="grad-text" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Procurement FX Exposure
        </h3>
        <p style={{ fontSize: 12, color: 'var(--d-muted)', marginTop: 3, fontFamily: "'Fira Code',monospace" }}>
          Model your currency spend mix · compare market rates, supplier contracts, and budget rates
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Base</span>
          <select className="d-sel" value={base} onChange={e => setBase(e.target.value)}>
            {ALL_CODES.map(c => <option key={c} value={c}>{CCY_META[c].flag} {c}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Annual spend</span>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 8, fontFamily: "'Fira Code',monospace", fontSize: 12, color: 'var(--d-muted)', pointerEvents: 'none' }}>{sym}</span>
            <input type="number" min="0" step="100000" value={spend}
              onChange={e => setSpend(Math.max(0, +e.target.value))}
              className="d-input"
              style={{ paddingLeft: sym.length > 1 ? 30 : 20, width: 155, fontFamily: "'Fira Code',monospace", fontSize: 12 }}
            />
          </div>
        </div>

        {/* Column toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 10, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginRight: 2 }}>Show</span>
          <button style={toggleBtn(showSupplier, '#f59e0b')} onClick={() => setShowSupplier(v => !v)}>
            {showSupplier ? '✕' : '+'} Supplier rates
          </button>
          <button style={toggleBtn(showControl, '#a78bfa')} onClick={() => setShowControl(v => !v)}>
            {showControl ? '✕' : '+'} Budget rates
          </button>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="d-btn" onClick={normalize}>Normalize 100%</button>
          <button className="d-btn-primary" onClick={saveProfile}><Save className="w-3 h-3" /> Save</button>
        </div>
      </div>

      {/* 2-column: allocation table | summary card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 440px', gap: 14, alignItems: 'start' }}>

        {/* LEFT: allocation table */}
        <div className="d-card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px 10px', borderBottom: '1px solid var(--d-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--d-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Currency Allocations</h3>
              {Math.abs(totalWeight - 100) > 0.5 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--d-amber)', fontSize: 10 }}>
                  <AlertCircle className="w-3 h-3" />
                  {totalWeight.toFixed(0)}% total
                </div>
              )}
            </div>
            <button className="d-btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={addRow}>
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="d-table" style={{ fontSize: 11, minWidth: showSupplier && showControl ? 820 : showSupplier || showControl ? 640 : 480 }}>
              <thead>
                <tr>
                  <th>Currency</th>
                  <th style={{ textAlign: 'right', width: 72 }}>Weight %</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Mkt baseline</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Mkt now</th>
                  <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Mkt cost Δ</th>
                  {showSupplier && <>
                    <th style={{ textAlign: 'right', whiteSpace: 'nowrap', color: '#f59e0b', borderLeft: '1px solid var(--d-border)' }}>Supplier rate</th>
                    <th style={{ textAlign: 'right', whiteSpace: 'nowrap', color: '#f59e0b' }}>vs Supplier</th>
                  </>}
                  {showControl && <>
                    <th style={{ textAlign: 'right', whiteSpace: 'nowrap', color: '#a78bfa', borderLeft: '1px solid var(--d-border)' }}>Budget rate</th>
                    <th style={{ textAlign: 'right', whiteSpace: 'nowrap', color: '#a78bfa' }}>vs Budget</th>
                  </>}
                  <th style={{ width: 28 }} />
                </tr>
              </thead>
              <tbody>
                {allocs.map((a, i) => {
                  const s = allocStats[i]
                  const meta = CCY_META[a.code]
                  const isBase = a.code === base
                  const r0hint = fmtRate(s?.r0 ?? null)
                  return (
                    <tr key={`${a.code}-${i}`}>
                      {/* Currency */}
                      <td style={{ paddingTop: 6, paddingBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 9, height: 9, borderRadius: '50%', background: meta?.c ?? '#888', flexShrink: 0 }} />
                          <select className="d-sel" style={{ minWidth: 130, fontSize: 11, padding: '5px 24px 5px 8px' }} value={a.code}
                            onChange={e => updateAlloc(i, { code: e.target.value })}>
                            {ALL_CODES.map(c => <option key={c} value={c}>{CCY_META[c]?.flag} {c} — {CCY_META[c]?.name}</option>)}
                          </select>
                          {isBase && (
                            <span style={{ fontSize: 9, color: 'var(--d-muted)', background: 'var(--d-raised)', border: '1px solid var(--d-border)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>domestic</span>
                          )}
                        </div>
                      </td>

                      {/* Weight */}
                      <td style={{ textAlign: 'right', paddingTop: 6, paddingBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                          <input type="number" min="0" max="100" step="1"
                            value={a.weight}
                            onChange={e => updateAlloc(i, { weight: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                            style={{ width: 48, textAlign: 'right', fontFamily: "'Fira Code',monospace", fontSize: 11, background: 'var(--d-raised)', color: 'var(--d-text)', border: '1px solid var(--d-border)', borderRadius: 5, padding: '4px 6px', outline: 'none' }}
                            onFocus={e => (e.currentTarget.style.borderColor = 'var(--d-border-f)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'var(--d-border)')}
                          />
                          <span style={{ fontSize: 11, color: 'var(--d-muted)' }}>%</span>
                        </div>
                      </td>

                      {/* Market baseline */}
                      <td style={{ textAlign: 'right', fontFamily: "'Fira Code',monospace", fontSize: 11, color: 'var(--d-muted)', paddingTop: 6, paddingBottom: 6 }}>
                        {isBase ? '—' : fmtRate(s?.r0 ?? null)}
                      </td>
                      {/* Market now */}
                      <td style={{ textAlign: 'right', fontFamily: "'Fira Code',monospace", fontSize: 11, color: 'var(--d-text)', paddingTop: 6, paddingBottom: 6 }}>
                        {isBase ? '—' : fmtRate(s?.rt ?? null)}
                      </td>
                      {/* Mkt cost delta */}
                      <td style={{ textAlign: 'right', paddingTop: 6, paddingBottom: 6 }}>
                        {isBase ? <span style={{ color: 'var(--d-dim)', fontFamily: "'Fira Code',monospace", fontSize: 11 }}>—</span>
                          : <DeltaBadge v={s?.mktDelta ?? null} isLight={isLight} />}
                      </td>

                      {/* Supplier rate columns */}
                      {showSupplier && <>
                        <td style={{ textAlign: 'right', paddingTop: 6, paddingBottom: 6, borderLeft: '1px solid var(--d-border)' }}>
                          {isBase
                            ? <span style={{ color: 'var(--d-dim)', fontFamily: "'Fira Code',monospace", fontSize: 11 }}>—</span>
                            : <RateInput value={a.supplierRate} placeholder={r0hint} onChange={v => updateAlloc(i, { supplierRate: v })} />}
                        </td>
                        <td style={{ textAlign: 'right', paddingTop: 6, paddingBottom: 6 }}>
                          {isBase ? <span style={{ color: 'var(--d-dim)', fontFamily: "'Fira Code',monospace", fontSize: 11 }}>—</span>
                            : <DeltaBadge v={s?.suppDelta ?? null} isLight={isLight} />}
                        </td>
                      </>}

                      {/* Control/budget rate columns */}
                      {showControl && <>
                        <td style={{ textAlign: 'right', paddingTop: 6, paddingBottom: 6, borderLeft: '1px solid var(--d-border)' }}>
                          {isBase
                            ? <span style={{ color: 'var(--d-dim)', fontFamily: "'Fira Code',monospace", fontSize: 11 }}>—</span>
                            : <RateInput value={a.controlRate} placeholder={r0hint} onChange={v => updateAlloc(i, { controlRate: v })} />}
                        </td>
                        <td style={{ textAlign: 'right', paddingTop: 6, paddingBottom: 6 }}>
                          {isBase ? <span style={{ color: 'var(--d-dim)', fontFamily: "'Fira Code',monospace", fontSize: 11 }}>—</span>
                            : <DeltaBadge v={s?.ctrlDelta ?? null} isLight={isLight} />}
                        </td>
                      </>}

                      {/* Delete */}
                      <td style={{ paddingTop: 6, paddingBottom: 6 }}>
                        <button onClick={() => setAllocs(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--d-dim)', padding: 3, display: 'flex' }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--d-red)')}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--d-dim)')}
                        ><Trash2 className="w-3 h-3" /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Column hint */}
          {(showSupplier || showControl) && (
            <div style={{ padding: '8px 14px', borderTop: '1px solid var(--d-border)', fontSize: 10, color: 'var(--d-dim)', fontStyle: 'italic' }}>
              {showSupplier && <span style={{ color: '#f59e0b' }}>Supplier rate</span>}{showSupplier && <span> — contracted rate with your supplier (e.g. hedge/forward). Enter as {base}/currency (same unit as market baseline). Negative Δ = market is cheaper than contract.</span>}
              {showSupplier && showControl && <br />}
              {showControl && <span style={{ color: '#a78bfa' }}>Budget rate</span>}{showControl && <span> — internal plan/controlling rate. Negative Δ = under budget, positive Δ = over budget.</span>}
            </div>
          )}
        </div>

        {/* RIGHT: summary card */}
        <div className="d-card-premium" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ height: 3, background: mktColorHex ? `linear-gradient(90deg, ${mktColorHex}cc, ${mktColorHex}22)` : 'linear-gradient(90deg, var(--d-brand), transparent)' }} />
          <div style={{ padding: '18px 20px 16px' }}>

            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
              Basket FX Impact
            </p>

            {/* Hero: market impact */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 6 }}>
              <div style={{ fontFamily: "'Fira Code',monospace", fontSize: 44, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em', color: mktColor }}>
                {mktImpact == null ? '—' : `${mktImpact >= 0 ? '+' : ''}${mktImpact.toFixed(2)}%`}
              </div>
              {mktImpact != null && (
                <div style={{
                  padding: '3px 10px', borderRadius: 20, marginBottom: 5, fontSize: 10, fontWeight: 700,
                  background: winning ? 'rgba(34,197,94,0.1)' : losing ? 'rgba(248,113,113,0.1)' : 'var(--d-raised)',
                  color: mktColor,
                  border: `1px solid ${winning ? 'rgba(34,197,94,0.25)' : losing ? 'rgba(248,113,113,0.25)' : 'var(--d-border)'}`,
                  letterSpacing: '0.06em',
                }}>
                  {winning ? 'WINNING' : losing ? 'LOSING' : 'NEUTRAL'}
                </div>
              )}
            </div>

            {/* Absolute impact */}
            {absImpact != null && spend > 0 && (
              <div style={{ fontFamily: "'Fira Code',monospace", fontSize: 14, fontWeight: 600, color: mktColor, marginBottom: 12 }}>
                {sym}{new Intl.NumberFormat('en').format(Math.abs(Math.round(absImpact)))}
                {' '}{winning ? 'saved' : losing ? 'extra cost' : 'no impact'}{' '}vs market baseline
              </div>
            )}
            {spend === 0 && (
              <p style={{ fontSize: 11, color: 'var(--d-muted)', fontStyle: 'italic', marginBottom: 12 }}>
                Enter annual spend above to see absolute figures
              </p>
            )}

            {/* Base → Now block */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--d-inset)', borderRadius: 8, border: '1px solid var(--d-border)', marginBottom: 14 }}>
              <div>
                <p style={{ fontSize: 9, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 3 }}>Baseline</p>
                <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 17, fontWeight: 500, color: 'var(--d-text)', lineHeight: 1 }}>100.0</p>
                <p style={{ fontSize: 10, color: 'var(--d-muted)', marginTop: 3 }}>{DT[fi]}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ color: 'var(--d-muted)', fontSize: 16 }}>→</span>
                {mktImpact != null && <DeltaBadge v={mktImpact} isLight={isLight} size={10} />}
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 9, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 3 }}>Now</p>
                <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 17, fontWeight: 500, color: mktColor, lineHeight: 1 }}>{mktNow?.toFixed(1) ?? '—'}</p>
                <p style={{ fontSize: 10, color: 'var(--d-muted)', marginTop: 3 }}>{DT[ti]}</p>
              </div>
            </div>

            {/* Optional measure comparison rows */}
            {(showSupplier || showControl) && (hasSupplierRates || hasControlRates) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
                <p style={{ fontSize: 9, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2 }}>Measure comparison</p>

                {showSupplier && hasSupplierRates && suppImpact != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--d-raised)', borderRadius: 7, border: '1px solid var(--d-border)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 11, color: 'var(--d-text)' }}>Market vs Supplier</p>
                      <p style={{ fontSize: 9, color: 'var(--d-muted)' }}>{suppImpact < 0 ? 'market cheaper than contracts' : 'contracts protecting you'}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <DeltaBadge v={suppImpact} isLight={isLight} size={13} />
                      {spend > 0 && <p style={{ fontSize: 10, color: 'var(--d-muted)', fontFamily: "'Fira Code',monospace" }}>
                        {sym}{new Intl.NumberFormat('en').format(Math.abs(Math.round(spend * suppImpact / 100)))}
                      </p>}
                    </div>
                  </div>
                )}

                {showControl && hasControlRates && ctrlImpact != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--d-raised)', borderRadius: 7, border: '1px solid var(--d-border)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a78bfa', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 11, color: 'var(--d-text)' }}>Market vs Budget</p>
                      <p style={{ fontSize: 9, color: 'var(--d-muted)' }}>{ctrlImpact < 0 ? 'under budget' : 'over budget'}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <DeltaBadge v={ctrlImpact} isLight={isLight} size={13} />
                      {spend > 0 && <p style={{ fontSize: 10, color: 'var(--d-muted)', fontFamily: "'Fira Code',monospace" }}>
                        {sym}{new Intl.NumberFormat('en').format(Math.abs(Math.round(spend * ctrlImpact / 100)))}
                      </p>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Best / worst currency */}
            {(bestMkt || worstMkt) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
                <p style={{ fontSize: 9, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2 }}>By currency (market)</p>
                {bestMkt && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: 'rgba(34,197,94,0.07)', borderRadius: 7, border: '1px solid rgba(34,197,94,0.16)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: CCY_META[bestMkt.code]?.c ?? '#22c55e', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--d-text)', flex: 1 }}>{CCY_META[bestMkt.code]?.flag} {bestMkt.code}</span>
                    <span style={{ fontSize: 10, color: 'var(--d-muted)', marginRight: 4 }}>best</span>
                    <DeltaBadge v={bestMkt.mktDelta} isLight={isLight} />
                  </div>
                )}
                {worstMkt && worstMkt.code !== bestMkt?.code && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: 'rgba(248,113,113,0.07)', borderRadius: 7, border: '1px solid rgba(248,113,113,0.16)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: CCY_META[worstMkt.code]?.c ?? '#f87171', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--d-text)', flex: 1 }}>{CCY_META[worstMkt.code]?.flag} {worstMkt.code}</span>
                    <span style={{ fontSize: 10, color: 'var(--d-muted)', marginRight: 4 }}>worst</span>
                    <DeltaBadge v={worstMkt.mktDelta} isLight={isLight} />
                  </div>
                )}
              </div>
            )}

            {/* Spend allocation bar */}
            <p style={{ fontSize: 9, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>Spend allocation</p>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1.5, marginBottom: 8 }}>
              {allocs.map((a, i) => {
                const pct = totalWeight > 0 ? (a.weight / totalWeight * 100) : 0
                return <div key={i} title={`${a.code}: ${a.weight.toFixed(0)}%`} style={{ flex: pct, background: CCY_META[a.code]?.c ?? '#888', minWidth: 2, borderRadius: 2 }} />
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
              {allocs.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: CCY_META[a.code]?.c ?? '#888', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--d-text)' }}>{CCY_META[a.code]?.flag} {a.code}</span>
                  <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-dim)' }}>{a.weight.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Full-width basket index chart */}
      <div ref={chartRef} className="d-card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--d-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Weighted Basket Cost Index
            </h3>
            <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-muted)', marginTop: 2 }}>
              Baseline = 100 · below 100 = cheaper than reference · base: {CCY_META[base]?.flag} {base} · {DT[fi]} → {DT[ti]}
            </p>
          </div>
          <button className="d-btn" style={{ padding: '5px 12px', fontSize: 11 }} onClick={exportChart}>
            Export PNG
          </button>
        </div>
        <div style={{ position: 'relative', width: '100%', height: 'clamp(200px,32vh,380px)' }}>
          <Line data={{ labels, datasets: chartDatasets }} options={chartOptions} />
        </div>
      </div>

    </div>
  )
}
