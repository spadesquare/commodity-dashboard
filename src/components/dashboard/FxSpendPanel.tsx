"use client"

import { useState, useEffect, useRef } from "react"
import { Line } from "react-chartjs-2"
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Filler, type ChartOptions
} from "chart.js"
import { DT, FX } from "@/data/currencies"
import { Plus, Trash2, Save, AlertCircle } from "lucide-react"
import html2canvas from "html2canvas"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

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
const LS_KEY = 'fx_spend_profile'

interface Alloc { code: string; weight: number }
interface Profile { base: string; spend: number; allocations: Alloc[] }

const DEFAULT_PROFILE: Profile = {
  base: 'EUR',
  spend: 1_000_000,
  allocations: [
    { code: 'EUR', weight: 40 },
    { code: 'USD', weight: 30 },
    { code: 'CNY', weight: 15 },
    { code: 'GBP', weight: 10 },
    { code: 'JPY', weight: 5 },
  ],
}

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

function fmtRate(v: number | null): string {
  if (v == null) return '—'
  if (v >= 100) return v.toFixed(1)
  if (v >= 10) return v.toFixed(2)
  return v.toFixed(4)
}

export function FxSpendPanel({ isLight, fi, ti, toast }: {
  isLight: boolean; fi: number; ti: number; toast: (m: string, s?: boolean) => void
}) {
  const [base, setBase] = useState(DEFAULT_PROFILE.base)
  const [spend, setSpend] = useState(DEFAULT_PROFILE.spend)
  const [allocs, setAllocs] = useState<Alloc[]>(DEFAULT_PROFILE.allocations.map(a => ({ ...a })))
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') as Profile | null
      if (saved) { setBase(saved.base); setSpend(saved.spend); setAllocs(saved.allocations) }
    } catch {}
  }, [])

  const totalWeight = allocs.reduce((s, a) => s + a.weight, 0)
  const labels = DT.slice(fi, ti + 1)

  // cost ratio for currency C at time idx: how much cheaper/more expensive vs baseline
  function costRatio(code: string, idx: number): number | null {
    const r0 = getRate(base, code, fi)
    const rt = getRate(base, code, idx)
    if (!r0 || !rt) return null
    return r0 / rt
  }

  // basket index at time idx (baseline = 100)
  function basketAt(idx: number): number | null {
    let total = 0, wTotal = 0
    for (const a of allocs) {
      const cr = costRatio(a.code, idx)
      if (cr == null) continue
      total += cr * a.weight; wTotal += a.weight
    }
    return wTotal > 0 ? +(total / wTotal * 100).toFixed(3) : null
  }

  const basketData = labels.map((_, i) => basketAt(fi + i))
  const nowIndex = basketData.at(-1)
  const impact = nowIndex != null ? nowIndex - 100 : null

  // per-currency stats at ti
  const allocStats = allocs.map(a => {
    const r0 = getRate(base, a.code, fi)
    const rt = getRate(base, a.code, ti)
    const rateChg = r0 && rt ? (rt - r0) / r0 * 100 : null
    const cr = costRatio(a.code, ti)
    const costDelta = cr != null ? (cr - 1) * 100 : null
    return { ...a, r0, rt, rateChg, costDelta }
  })

  const foreignStats = allocStats.filter(s => s.code !== base && s.costDelta != null)
  const biggestWinner = foreignStats.length ? foreignStats.reduce((a, b) => b.costDelta! < a.costDelta! ? b : a) : null
  const biggestLoser  = foreignStats.length ? foreignStats.reduce((a, b) => b.costDelta! > a.costDelta! ? b : a) : null

  const winning = impact != null && impact < -0.1
  const losing  = impact != null && impact > 0.1
  const impactColor    = winning ? (isLight ? '#16a34a' : '#22c55e') : losing ? (isLight ? '#dc2626' : '#f87171') : 'var(--d-muted)'
  const impactColorHex = winning ? (isLight ? '#16a34a' : '#22c55e') : losing ? (isLight ? '#dc2626' : '#f87171') : undefined
  const absImpact = spend > 0 && impact != null ? spend * impact / 100 : null
  const sym = CCY_SYMBOL[base] ?? base

  const gc = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'
  const tc = isLight ? '#94a3b8' : '#4a5568'

  const chartOptions: ChartOptions<'line'> = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isLight ? '#fff' : '#060a10',
        borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)', borderWidth: 1,
        titleColor: isLight ? '#0f172a' : '#eef2ff',
        bodyColor: isLight ? '#475569' : '#9ca3af',
        titleFont: { family: "'Fira Code',monospace", size: 11 },
        bodyFont:  { family: "'Fira Code',monospace", size: 11 },
        callbacks: {
          label: ctx => {
            const v = ctx.parsed.y ?? 0
            return `Index: ${v.toFixed(2)}  (${v >= 100 ? '+' : ''}${(v - 100).toFixed(2)}%)`
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
    setAllocs(prev => [...prev, { code: next, weight: 0 }])
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Section header */}
      <div style={{ paddingTop: 10, borderTop: '1px solid var(--d-border)' }}>
        <h3 className="grad-text" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Procurement FX Exposure
        </h3>
        <p style={{ fontSize: 12, color: 'var(--d-muted)', marginTop: 3, fontFamily: "'Fira Code',monospace" }}>
          Model your currency spend mix · are you winning or losing vs the period baseline?
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
        <button className="d-btn" onClick={normalize}>Normalize 100%</button>
        <button className="d-btn-primary" onClick={saveProfile}><Save className="w-3 h-3" /> Save profile</button>
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

          <table className="d-table" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th>Currency</th>
                <th style={{ textAlign: 'right', width: 80 }}>Weight %</th>
                <th style={{ textAlign: 'right' }}>Rate baseline</th>
                <th style={{ textAlign: 'right' }}>Rate now</th>
                <th style={{ textAlign: 'right' }}>Rate Δ%</th>
                <th style={{ textAlign: 'right' }}>Cost Δ%</th>
                <th style={{ width: 28 }} />
              </tr>
            </thead>
            <tbody>
              {allocs.map((a, i) => {
                const s = allocStats[i]
                const meta = CCY_META[a.code]
                const isBase = a.code === base
                const costColor = isBase || s?.costDelta == null ? 'var(--d-dim)'
                  : s.costDelta < -0.1 ? (isLight ? '#16a34a' : '#22c55e')
                  : s.costDelta > 0.1  ? (isLight ? '#dc2626' : '#f87171')
                  : 'var(--d-muted)'
                const rateColor = isBase || s?.rateChg == null ? 'var(--d-dim)'
                  : s.rateChg > 0.1 ? 'var(--d-red)' : s.rateChg < -0.1 ? 'var(--d-green)' : 'var(--d-muted)'
                return (
                  <tr key={`${a.code}-${i}`}>
                    <td style={{ paddingTop: 6, paddingBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: meta?.c ?? '#888', flexShrink: 0 }} />
                        <select className="d-sel" style={{ minWidth: 130, fontSize: 11, padding: '5px 24px 5px 8px' }} value={a.code}
                          onChange={e => {
                            const next = [...allocs]; next[i] = { ...next[i], code: e.target.value }; setAllocs(next)
                          }}>
                          {ALL_CODES.map(c => <option key={c} value={c}>{CCY_META[c]?.flag} {c} — {CCY_META[c]?.name}</option>)}
                        </select>
                        {isBase && (
                          <span style={{ fontSize: 9, color: 'var(--d-muted)', background: 'var(--d-raised)', border: '1px solid var(--d-border)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.04em' }}>domestic</span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', paddingTop: 6, paddingBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                        <input type="number" min="0" max="100" step="1"
                          value={a.weight}
                          onChange={e => {
                            const pct = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                            const next = [...allocs]; next[i] = { ...next[i], weight: pct }; setAllocs(next)
                          }}
                          style={{ width: 52, textAlign: 'right', fontFamily: "'Fira Code',monospace", fontSize: 11, background: 'var(--d-raised)', color: 'var(--d-text)', border: '1px solid var(--d-border)', borderRadius: 5, padding: '4px 6px', outline: 'none' }}
                          onFocus={e => (e.currentTarget.style.borderColor = 'var(--d-border-f)')}
                          onBlur={e => (e.currentTarget.style.borderColor = 'var(--d-border)')}
                        />
                        <span style={{ fontSize: 11, color: 'var(--d-muted)', marginLeft: 2 }}>%</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: "'Fira Code',monospace", fontSize: 11, color: 'var(--d-muted)', paddingTop: 6, paddingBottom: 6 }}>
                      {isBase ? '—' : fmtRate(s?.r0 ?? null)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: "'Fira Code',monospace", fontSize: 11, color: 'var(--d-text)', paddingTop: 6, paddingBottom: 6 }}>
                      {isBase ? '—' : fmtRate(s?.rt ?? null)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: "'Fira Code',monospace", fontSize: 11, color: rateColor, paddingTop: 6, paddingBottom: 6 }}>
                      {isBase || s?.rateChg == null ? '—' : `${s.rateChg >= 0 ? '+' : ''}${s.rateChg.toFixed(2)}%`}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: "'Fira Code',monospace", fontSize: 11, color: costColor, paddingTop: 6, paddingBottom: 6 }}>
                      {isBase || s?.costDelta == null ? '—' : `${s.costDelta >= 0 ? '+' : ''}${s.costDelta.toFixed(2)}%`}
                    </td>
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

        {/* RIGHT: summary card */}
        <div className="d-card-premium" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ height: 3, background: impactColorHex ? `linear-gradient(90deg, ${impactColorHex}cc, ${impactColorHex}22)` : 'linear-gradient(90deg, var(--d-brand), transparent)' }} />
          <div style={{ padding: '18px 20px 16px' }}>

            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
              Basket FX Impact
            </p>

            {/* Big number + badge */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 6 }}>
              <div style={{ fontFamily: "'Fira Code',monospace", fontSize: 44, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em', color: impactColor }}>
                {impact == null ? '—' : `${impact >= 0 ? '+' : ''}${impact.toFixed(2)}%`}
              </div>
              {impact != null && (
                <div style={{
                  padding: '3px 10px', borderRadius: 20, marginBottom: 5, fontSize: 10, fontWeight: 700,
                  background: winning ? 'rgba(34,197,94,0.1)' : losing ? 'rgba(248,113,113,0.1)' : 'var(--d-raised)',
                  color: impactColor,
                  border: `1px solid ${winning ? 'rgba(34,197,94,0.25)' : losing ? 'rgba(248,113,113,0.25)' : 'var(--d-border)'}`,
                  letterSpacing: '0.06em',
                }}>
                  {winning ? 'WINNING' : losing ? 'LOSING' : 'NEUTRAL'}
                </div>
              )}
            </div>

            {/* Absolute impact */}
            {absImpact != null && spend > 0 && (
              <div style={{ fontFamily: "'Fira Code',monospace", fontSize: 14, fontWeight: 600, color: impactColor, marginBottom: 16 }}>
                {sym}{new Intl.NumberFormat('en').format(Math.abs(Math.round(absImpact)))}
                {' '}{winning ? 'saved' : losing ? 'extra cost' : 'no impact'}{' '}vs baseline
              </div>
            )}
            {spend === 0 && (
              <p style={{ fontSize: 11, color: 'var(--d-muted)', fontStyle: 'italic', marginBottom: 16 }}>
                Enter annual spend above to see absolute impact
              </p>
            )}

            {/* Base → Now */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--d-inset)', borderRadius: 8, border: '1px solid var(--d-border)', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 9, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 3 }}>Baseline</p>
                <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 17, fontWeight: 500, color: 'var(--d-text)', lineHeight: 1 }}>100.0</p>
                <p style={{ fontSize: 10, color: 'var(--d-muted)', marginTop: 3 }}>{DT[fi]}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ color: 'var(--d-muted)', fontSize: 16 }}>→</span>
                {impact != null && (
                  <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: impactColor, fontWeight: 600 }}>
                    {impact >= 0 ? '+' : ''}{impact.toFixed(2)}%
                  </span>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 9, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 3 }}>Now</p>
                <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 17, fontWeight: 500, color: impactColor, lineHeight: 1 }}>{nowIndex?.toFixed(1) ?? '—'}</p>
                <p style={{ fontSize: 10, color: 'var(--d-muted)', marginTop: 3 }}>{DT[ti]}</p>
              </div>
            </div>

            {/* Best / worst currency */}
            {(biggestWinner || biggestLoser) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
                <p style={{ fontSize: 9, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2 }}>By Currency</p>
                {biggestWinner && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: 'rgba(34,197,94,0.07)', borderRadius: 7, border: '1px solid rgba(34,197,94,0.16)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: CCY_META[biggestWinner.code]?.c ?? '#22c55e', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--d-text)', flex: 1 }}>{CCY_META[biggestWinner.code]?.flag} {biggestWinner.code}</span>
                    <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-muted)', marginRight: 4 }}>best pair</span>
                    <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 11, fontWeight: 600, color: isLight ? '#16a34a' : '#22c55e' }}>
                      {biggestWinner.costDelta! >= 0 ? '+' : ''}{biggestWinner.costDelta!.toFixed(2)}%
                    </span>
                  </div>
                )}
                {biggestLoser && biggestLoser.code !== biggestWinner?.code && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: 'rgba(248,113,113,0.07)', borderRadius: 7, border: '1px solid rgba(248,113,113,0.16)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: CCY_META[biggestLoser.code]?.c ?? '#f87171', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--d-text)', flex: 1 }}>{CCY_META[biggestLoser.code]?.flag} {biggestLoser.code}</span>
                    <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-muted)', marginRight: 4 }}>worst pair</span>
                    <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 11, fontWeight: 600, color: isLight ? '#dc2626' : '#f87171' }}>
                      {biggestLoser.costDelta! >= 0 ? '+' : ''}{biggestLoser.costDelta!.toFixed(2)}%
                    </span>
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
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--d-muted)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: CCY_META[a.code]?.c ?? '#888', flexShrink: 0 }} />
                  <span style={{ color: 'var(--d-text)', fontSize: 10 }}>{CCY_META[a.code]?.flag} {a.code}</span>
                  <span style={{ fontFamily: "'Fira Code',monospace", color: 'var(--d-dim)' }}>{a.weight.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Full-width basket index line chart */}
      <div ref={chartRef} className="d-card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--d-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Weighted Basket Cost Index
            </h3>
            <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-muted)', marginTop: 2 }}>
              Baseline = 100 · below 100 = winning · above 100 = losing · base: {CCY_META[base]?.flag} {base} · {DT[fi]} → {DT[ti]}
            </p>
          </div>
          <button className="d-btn" style={{ padding: '5px 12px', fontSize: 11 }} onClick={exportChart}>
            Export PNG
          </button>
        </div>
        <div style={{ position: 'relative', width: '100%', height: 'clamp(200px,32vh,380px)' }}>
          <Line
            data={{
              labels,
              datasets: [{
                data: basketData,
                borderColor: impactColorHex ?? '#6366f1',
                backgroundColor: `${impactColorHex ?? '#6366f1'}14`,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0.35,
                fill: true,
                spanGaps: true,
              }]
            }}
            options={chartOptions}
          />
        </div>
      </div>

    </div>
  )
}
