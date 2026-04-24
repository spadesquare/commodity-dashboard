"use client"

import { useRef, useState } from "react"
import { Line } from "react-chartjs-2"
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, type ChartOptions } from "chart.js"
import { DT, DT_FULL, SC, SC_MAP, type RawData } from "@/data/commodities"
import { Download, Share2 } from "lucide-react"
import html2canvas from "html2canvas"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

export function MarketSnapshot({ isLight, R, toast, liveIds }: { isLight: boolean; R: RawData; toast: (msg: string, success?: boolean) => void; liveIds?: Set<string> }) {
  const [commodityId, setCommodityId] = useState('copper')
  const [fromIdx, setFromIdx] = useState(0)
  const [toIdx, setToIdx] = useState(DT.length - 1)
  const cardRef = useRef<HTMLDivElement>(null)

  const sc = SC_MAP[commodityId]
  const fi = Math.min(fromIdx, toIdx), ti = Math.max(fromIdx, toIdx)
  const data = R[commodityId] ?? []
  const baseVal = data[fi], endVal = data[ti]
  const pctChange = baseVal && endVal && baseVal !== 0 ? ((endVal - baseVal) / baseVal * 100) : 0
  const absChange = baseVal && endVal ? endVal - baseVal : 0
  const labels = DT.slice(fi, ti + 1)
  const chartData = data.slice(fi, ti + 1)
  const color = pctChange > 0 ? 'var(--d-red)' : 'var(--d-green)'
  const colorHex = pctChange > 0 ? (isLight ? '#dc2626' : '#f87171') : (isLight ? '#16a34a' : '#22c55e')

  const gc = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'
  const tc = isLight ? '#94a3b8' : '#4a5568'

  const options: ChartOptions<'line'> = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
    scales: {
      x: { grid: { color: gc }, ticks: { color: tc, font: { family: "'Fira Code',monospace", size: 10 }, maxTicksLimit: 10 } },
      y: { grid: { color: gc }, ticks: { color: tc, font: { family: "'Fira Code',monospace", size: 10 }, callback: v => (+v).toFixed(0) } },
    },
  }

  async function exportPng() {
    if (!cardRef.current) return
    const canvas = await html2canvas(cardRef.current, { backgroundColor: isLight ? '#f4f7fd' : '#04060d', scale: 2, logging: false, useCORS: true })
    const a = document.createElement('a'); a.download = `snapshot-${commodityId}.png`; a.href = canvas.toDataURL(); a.click()
    toast('Snapshot exported', true)
  }

  async function copyPng() {
    if (!cardRef.current) return
    try {
      const canvas = await html2canvas(cardRef.current, { backgroundColor: isLight ? '#f4f7fd' : '#04060d', scale: 2, logging: false, useCORS: true })
      canvas.toBlob(async blob => {
        if (!blob) return
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        toast('Copied to clipboard', true)
      })
    } catch { toast('Copy failed — try Export instead') }
  }

  const Label = ({ children }: { children: string }) => (
    <p style={{ fontSize: 10, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: 4 }}>{children}</p>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`@keyframes snap-live{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>

      {/* Builder controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        <div>
          <Label>Commodity</Label>
          <select className="d-sel" style={{ width: '100%' }} value={commodityId} onChange={e => setCommodityId(e.target.value)}>
            {SC.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <Label>From</Label>
          <select className="d-sel" style={{ width: '100%' }} value={fromIdx} onChange={e => setFromIdx(+e.target.value)}>
            {DT_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        <div>
          <Label>To</Label>
          <select className="d-sel" style={{ width: '100%' }} value={toIdx} onChange={e => setToIdx(+e.target.value)}>
            {DT_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Premium snapshot card */}
      <div ref={cardRef} className="d-card-premium" style={{ padding: '28px 30px' }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${sc?.c}18`, border: `1px solid ${sc?.c}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Fira Code',monospace", fontWeight: 700, fontSize: 13, color: sc?.c, flexShrink: 0 }}>
              {sc?.label?.charAt(0) ?? '?'}
            </div>
            <div>
              <p style={{ fontSize: 10, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Market Snapshot</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--d-text)', lineHeight: 1.2 }}>{sc?.label ?? '—'}</p>
                {liveIds?.has(commodityId) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color: '#22c55e', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.28)', borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', animation: 'snap-live 1.5s ease-in-out infinite' }} />
                    LIVE
                  </span>
                )}
              </div>
            </div>
          </div>
          <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-muted)', textAlign: 'right', lineHeight: 1.7 }}>
            {DT_FULL[fi]}<br />→ {DT_FULL[ti]}
          </p>
        </div>

        {/* Big number */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
          <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 52, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em', color: colorHex }}>
            {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Absolute Δ</span>
            <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 16, color: 'var(--d-text)' }}>
              {absChange >= 0 ? '+' : ''}{absChange.toFixed(0)} {sc?.unit}
            </span>
          </div>
          <span style={{ marginLeft: 'auto', fontFamily: "'Fira Code',monospace", fontSize: 11, color: 'var(--d-muted)', marginBottom: 4 }}>{Math.abs(ti - fi)} months</span>
        </div>

        {/* Endpoints */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--d-inset)', borderRadius: 8, border: '1px solid var(--d-border)', marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 10, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>Base</p>
            <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 18, fontWeight: 500, color: 'var(--d-text)' }}>{baseVal?.toFixed(0) ?? '—'}</p>
            <p style={{ fontSize: 11, color: 'var(--d-muted)', marginTop: 2 }}>{DT[fi]}</p>
          </div>
          <span style={{ color: 'var(--d-muted)', fontSize: 20 }}>→</span>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 10, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>Now</p>
            <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 18, fontWeight: 500, color: colorHex }}>{endVal?.toFixed(0) ?? '—'}</p>
            <p style={{ fontSize: 11, color: 'var(--d-muted)', marginTop: 2 }}>{DT[ti]}</p>
          </div>
        </div>

        {/* Mini chart */}
        <div style={{ position: 'relative', width: '100%', height: 110, marginBottom: 16 }}>
          <Line data={{ labels, datasets: [{ data: chartData, borderColor: colorHex, backgroundColor: `${colorHex}12`, borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: true, spanGaps: true }] }} options={options} />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--d-border)', fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-muted)', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc?.c }} />
            {sc?.unit}
          </div>
          <span>Commodity Price Dashboard · {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="d-btn-primary" onClick={exportPng}>
          <Download className="w-4 h-4" /> Export as PNG
        </button>
        <button className="d-btn" onClick={copyPng}>
          <Share2 className="w-4 h-4" /> Copy to Clipboard
        </button>
      </div>
    </div>
  )
}
