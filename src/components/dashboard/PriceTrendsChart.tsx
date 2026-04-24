"use client"

import { useRef, useState, useCallback } from "react"
import { Line } from "react-chartjs-2"
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend, Filler, type ChartOptions, type TooltipModel
} from "chart.js"
import { DT, DT_FULL, SC, CATEGORIES, type Category, type RawData } from "@/data/commodities"
import { Download } from "lucide-react"
import html2canvas from "html2canvas"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

interface Props {
  cat: Category; setCat: (c: Category) => void
  fromIdx: number; setFromIdx: (i: number) => void
  toIdx: number; setToIdx: (i: number) => void
  hidden: Set<string>; setHidden: (h: Set<string>) => void
  isLight: boolean; R: RawData
  toast: (msg: string, success?: boolean) => void
  liveIds?: Set<string>
}

export function PriceTrendsChart({ cat, setCat, fromIdx, setFromIdx, toIdx, setToIdx, hidden, setHidden, isLight, R, toast, liveIds }: Props) {
  const [viewMode, setViewMode] = useState<'absolute' | 'indexed'>('absolute')
  const [preset, setPreset] = useState('all')
  const cardRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const getActiveSC = useCallback(() => cat === 'all' ? SC : SC.filter(s => s.cat === cat), [cat])

  function setDatePreset(p: string) {
    setPreset(p); const last = DT.length - 1
    const map: Record<string, [number, number]> = { '6m': [last - 5, last], '1y': [last - 11, last], '2y': [last - 23, last], 'all': [0, last] }
    const [f, t] = map[p] ?? [0, last]
    setFromIdx(Math.max(0, f)); setToIdx(t)
  }

  const externalTooltip = useCallback((context: { chart: ChartJS; tooltip: TooltipModel<'line'> }) => {
    const { chart, tooltip } = context
    const tip = tooltipRef.current; if (!tip) return
    if (tooltip.opacity === 0) { tip.style.opacity = '0'; return }

    const fi = Math.min(fromIdx, toIdx)
    const rawIdx = tooltip.dataPoints?.[0]?.dataIndex ?? 0
    const absIdx = fi + rawIdx
    const title = DT_FULL[absIdx] ?? DT[absIdx] ?? ''
    const items = tooltip.dataPoints?.filter(p => p.raw !== null).sort((a, b) => (b.raw as number) - (a.raw as number)).slice(0, 12) ?? []

    const rows = items.map(p => {
      const ds = p.dataset as typeof p.dataset & { _id?: string; _unit?: string }
      const sc = ds._id ? SC.find(s => s.id === ds._id) : null
      const val = p.raw as number
      const unit = sc?.unit ?? ''
      const formatted = viewMode === 'indexed' ? val.toFixed(1) : val >= 1000 ? (val / 1000).toFixed(2) + 'k' : val.toFixed(0)
      const color = (p.dataset.borderColor as string) || 'var(--d-brand)'
      let pct: number | null = null
      if (viewMode === 'indexed') {
        pct = val - 100
      } else if (ds._id) {
        const bv = R[ds._id]?.[fi]
        if (bv != null && bv !== 0) pct = (val - bv) / bv * 100
      }
      const pc = pct == null ? '' : pct > 0.5 ? 'var(--d-red)' : pct < -0.5 ? 'var(--d-green)' : 'var(--d-muted)'
      const pl = pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : ''
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:5px">
        <span style="display:flex;align-items:center;gap:8px;color:var(--d-muted);font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 6px ${color}88"></span>${p.dataset.label ?? ''}
        </span>
        <span style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          <span style="font-family:'Fira Code',monospace;font-size:14px;font-weight:600;color:var(--d-text)">${formatted}${viewMode === 'indexed' ? '' : ' ' + unit}</span>
          ${pl ? `<span style="font-family:'Fira Code',monospace;font-size:12px;font-weight:600;color:${pc};min-width:54px;text-align:right">${pl}</span>` : ''}
        </span>
      </div>`
    }).join('')

    tip.innerHTML = `
      <div style="font-size:15px;font-weight:700;color:var(--d-text);margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--d-border);display:flex;justify-content:space-between;align-items:center">
        <span>${title}</span>
        <span style="font-size:11px;color:var(--d-muted);font-weight:400;font-family:'Fira Code',monospace;background:var(--d-raised);padding:2px 8px;border-radius:4px;border:1px solid var(--d-border)">${items.length} series</span>
      </div>${rows}`

    tip.style.visibility = 'hidden'; tip.style.opacity = '0'; tip.style.left = '0px'; tip.style.top = '0px'
    const cRect = chart.canvas.getBoundingClientRect()
    const cx = tooltip.caretX, cy = tooltip.caretY
    const tw = tip.offsetWidth || 280, th = tip.offsetHeight || 120
    const m = 16
    const left = cx + m + tw + 4 > cRect.width ? Math.max(4, cx - m - tw) : cx + m
    const top = Math.max(4, Math.min(cy - th / 2, cRect.height - th - 4))
    tip.style.left = left + 'px'; tip.style.top = top + 'px'
    tip.style.visibility = 'visible'; tip.style.opacity = '1'
  }, [fromIdx, toIdx, viewMode, R])

  const activeSC = getActiveSC()
  const fi = Math.min(fromIdx, toIdx), ti = Math.max(fromIdx, toIdx)
  const labels = DT.slice(fi, ti + 1)

  const datasets = activeSC.map(s => {
    const raw = (R[s.id] ?? []).slice(fi, ti + 1)
    const fv = raw.find(v => v !== null)
    return {
      label: s.label,
      data: raw.map(v => v === null ? null : viewMode === 'indexed' ? (fv ? +(v / fv * 100).toFixed(2) : null) : v),
      borderColor: s.c, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4,
      tension: 0.35, hidden: hidden.has(s.id), spanGaps: true, _id: s.id, _unit: s.unit,
    }
  })

  const gc = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'
  const tc = isLight ? '#94a3b8' : '#4a5568'

  const options: ChartOptions<'line'> = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: { enabled: false, external: externalTooltip as never } },
    scales: {
      x: { grid: { color: gc }, ticks: { color: tc, font: { family: "'Fira Code',monospace", size: 10 }, maxTicksLimit: 14 } },
      y: { grid: { color: gc }, ticks: { color: tc, font: { family: "'Fira Code',monospace", size: 10 }, callback: v => { const n = +v; return viewMode === 'indexed' ? n.toFixed(0) : n >= 1000 ? (n/1000).toFixed(1)+'k' : n.toFixed(0) } } },
    },
  }

  async function exportCard() {
    if (!cardRef.current) return
    const canvas = await html2canvas(cardRef.current, { backgroundColor: isLight ? '#f0f4fa' : '#000000', scale: 2, logging: false, useCORS: true })
    const a = document.createElement('a'); a.download = 'price-trends.png'; a.href = canvas.toDataURL(); a.click()
    toast('Exported', true)
  }

  const visibleCount = activeSC.filter(s => !hidden.has(s.id)).length

  const Btn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} className="d-btn" style={{ padding: '5px 11px', fontSize: 11 }}>{children}</button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Row 1: Category + view mode */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="seg-pill">
          {CATEGORIES.map(c => (
            <button key={c} className={cat === c ? 'active' : ''} onClick={() => setCat(c)}>
              {c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
        <div className="seg-pill">
          <button className={viewMode === 'absolute' ? 'active' : ''} onClick={() => setViewMode('absolute')}>Absolute</button>
          <button className={viewMode === 'indexed' ? 'active' : ''} onClick={() => setViewMode('indexed')}>Indexed</button>
        </div>
      </div>

      {/* Row 2: Date range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Period</span>
        <div className="seg-pill">
          {['6m','1y','2y','all'].map(p => (
            <button key={p} className={preset === p ? 'active' : ''} onClick={() => setDatePreset(p)}>{p.toUpperCase()}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <select className="d-sel" value={fromIdx} onChange={e => { setFromIdx(+e.target.value); setPreset('') }}>
            {DT_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <span style={{ color: 'var(--d-muted)' }}>→</span>
          <select className="d-sel" value={toIdx} onChange={e => { setToIdx(+e.target.value); setPreset('') }}>
            {DT_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Chart card */}
      <div ref={cardRef} className="d-card" style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--d-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Price Trends</h3>
          <button className="d-btn" style={{ padding: '5px 11px', fontSize: 11 }} onClick={exportCard}>
            <Download className="w-3 h-3" /> Export PNG
          </button>
        </div>

        <div style={{ position: 'relative', width: '100%', height: 'clamp(400px,58vh,700px)' }}>
          <div ref={tooltipRef} className="d-tooltip" style={{ opacity: 0, visibility: 'hidden' }} />
          <Line data={{ labels, datasets }} options={options} />
        </div>

        {/* Legend controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--d-border)', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 11, color: 'var(--d-muted)' }}>
            <span style={{ color: 'var(--d-text)', fontWeight: 500 }}>{visibleCount}</span> / {activeSC.length} visible
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn onClick={() => setHidden(new Set())}>Show all</Btn>
            <Btn onClick={() => setHidden(new Set(activeSC.map(s => s.id)))}>Hide all</Btn>
          </div>
        </div>
        <style>{`@keyframes leg-live{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {activeSC.map(s => {
            const live = liveIds?.has(s.id)
            return (
              <div key={s.id} className={`leg-item${hidden.has(s.id) ? ' dimmed' : ''}`}
                onClick={() => { const n = new Set(hidden); n.has(s.id) ? n.delete(s.id) : n.add(s.id); setHidden(n) }}
              >
                <span className="leg-swatch" style={{ background: s.c }} />
                {s.label}
                {live && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0, animation: 'leg-live 1.5s ease-in-out infinite', marginLeft: 2 }} title="Live FRED data" />
                )}
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: 10, color: 'var(--d-muted)', fontStyle: 'italic', marginTop: 10 }}>Click to toggle · <span style={{ color: '#22c55e' }}>●</span> = live FRED data</p>
      </div>
    </div>
  )
}
