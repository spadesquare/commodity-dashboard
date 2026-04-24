"use client"

import { useState, useRef, useEffect } from "react"
import { Bar, Line } from "react-chartjs-2"
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, Tooltip, Legend, Filler, type ChartOptions
} from "chart.js"
import { DT, DT_FULL, SC_MAP, type RawData } from "@/data/commodities"
import { Plus, Trash2, Save, FolderOpen, Download, AlertCircle, ChevronDown, X, GripVertical, Layers } from "lucide-react"
import html2canvas from "html2canvas"

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend, Filler)

interface ModelRow { id: string; label: string; unit: string; weight: number }
interface SavedModel { name: string; rows: ModelRow[]; fromIdx: number; toIdx: number }
interface MixEntry { name: string; weight: number }

const STORED_KEY = 'commodity_cost_models'
const SEEDED_KEY = 'commodity_cost_models_seeded_v4'
const MIX_COLORS = ['#4a90d9','#e8900a','#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4','#84cc16']

// True indirect costs: energy (electricity + gas) + inflation benchmark. No materials, no shipping.
// Labor series kept in catalog but have no live FRED feed — add via Manage Data if needed.
const SEED_MODELS: SavedModel[] = [
  {
    name: 'Europe Indirect Costs', fromIdx: 0, toIdx: DT.length - 1,
    rows: [
      { id: 'elec_eu',    label: 'Electricity EU',       unit: '€/MWh',   weight: 0.40 },
      { id: 'nat_gas_eu', label: 'Natural Gas (Europe)', unit: '$/MMBtu', weight: 0.40 },
      { id: 'cpi_eu',     label: 'Services Inflation (EU)', unit: 'idx',    weight: 0.20 },
    ],
  },
  {
    name: 'China Indirect Costs', fromIdx: 0, toIdx: DT.length - 1,
    rows: [
      { id: 'elec_cn',    label: 'Electricity CN',          unit: 'CNY/MWh', weight: 0.40 },
      { id: 'nat_gas_cn', label: 'Natural Gas (Asia LNG)',  unit: '$/MMBtu', weight: 0.40 },
      { id: 'cpi_cn',     label: 'CPI (China)',             unit: 'idx',     weight: 0.20 },
    ],
  },
]

const loadModels = (): SavedModel[] => { try { return JSON.parse(localStorage.getItem(STORED_KEY) ?? '[]') } catch { return [] } }
const saveModels = (m: SavedModel[]) => localStorage.setItem(STORED_KEY, JSON.stringify(m))

function seedIfNeeded(): SavedModel[] {
  const existing = loadModels()
  if (localStorage.getItem(SEEDED_KEY)) return existing
  // Always replace any stale seed models by name, then prepend fresh ones
  const seedNames = new Set(SEED_MODELS.map(m => m.name))
  const merged = [...SEED_MODELS, ...existing.filter(m => !seedNames.has(m.name))]
  saveModels(merged)
  localStorage.setItem(SEEDED_KEY, '1')
  return merged
}

const MODEL_DEFAULTS: ModelRow[] = [
  { id: 'abs_eu',      label: 'ABS (EU)',       unit: '€/t',   weight: 0.22 },
  { id: 'ldpe_eu',     label: 'LDPE (EU)',      unit: '€/t',   weight: 0.18 },
  { id: 'pp_eu',       label: 'PP (EU)',         unit: '€/t',   weight: 0.15 },
  { id: 'aluminium',   label: 'Aluminium',      unit: '$/t',   weight: 0.12 },
  { id: 'copper',      label: 'Copper',         unit: '$/t',   weight: 0.08 },
  { id: 'brent',       label: 'Brent Crude',    unit: '$/bbl', weight: 0.10 },
  { id: 'elec_eu',     label: 'Electricity EU', unit: '€/MWh', weight: 0.08 },
  { id: 'ship_cn_neu', label: 'Ship CN→EU',     unit: '$/FEU', weight: 0.07 },
]

export function CostModelPanel({ isLight, R, toast, liveIds }: { isLight: boolean; R: RawData; toast: (m: string, s?: boolean) => void; liveIds?: Set<string> }) {
  const [rows, setRows] = useState<ModelRow[]>(MODEL_DEFAULTS.map(d => ({ ...d })))
  const [fromIdx, setFromIdx] = useState(0)
  const [toIdx, setToIdx] = useState(DT.length - 1)
  const [modelName, setModelName] = useState('My Model')
  const [savedModels, setSavedModels] = useState<SavedModel[]>([])
  const [showLoad, setShowLoad] = useState(false)
  const [preset, setPreset] = useState('all')
  // Commodity row drag
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  // Mix mode
  const [mixActive, setMixActive] = useState(false)
  const [mixEntries, setMixEntries] = useState<MixEntry[]>([])
  const [mixDragIdx, setMixDragIdx] = useState<number | null>(null)
  const [mixOverIdx, setMixOverIdx] = useState<number | null>(null)
  const [showAddModel, setShowAddModel] = useState(false)
  const chartCardRef = useRef<HTMLDivElement>(null)
  const summaryCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setSavedModels(seedIfNeeded()) }, [])

  const fi = Math.min(fromIdx, toIdx), ti = Math.max(fromIdx, toIdx)
  const labels = DT.slice(fi, ti + 1)
  const totalWeight = rows.reduce((a, r) => a + r.weight, 0)
  const totalMixWeight = mixEntries.reduce((s, e) => s + e.weight, 0)

  // --- Blend computations ---

  function computeBlend(): (number | null)[] {
    return labels.map((_, li) => {
      let total = 0, wTotal = 0
      for (const row of rows) {
        const d = R[row.id]; if (!d) continue
        const fv = d[fi], cv = d[fi + li]
        if (fv == null || cv == null || fv === 0) continue
        total += (cv / fv * 100) * row.weight; wTotal += row.weight
      }
      return wTotal > 0 ? +(total / wTotal).toFixed(2) : null
    })
  }

  function modelBlendAt(model: SavedModel, li: number): number | null {
    let total = 0, wTotal = 0
    for (const row of model.rows) {
      const d = R[row.id]; if (!d) continue
      const fv = d[fi], cv = d[fi + li]
      if (fv == null || cv == null || fv === 0) continue
      total += (cv / fv * 100) * row.weight; wTotal += row.weight
    }
    return wTotal > 0 ? total / wTotal : null
  }

  function computeMixBlend(): (number | null)[] {
    if (totalMixWeight === 0) return labels.map(() => null)
    return labels.map((_, li) => {
      let composite = 0, wUsed = 0
      for (const entry of mixEntries) {
        if (entry.weight === 0) continue
        const model = savedModels.find(m => m.name === entry.name)
        if (!model) continue
        const idx = modelBlendAt(model, li)
        if (idx == null) continue
        composite += idx * entry.weight; wUsed += entry.weight
      }
      return wUsed > 0 ? +(composite / wUsed).toFixed(2) : null
    })
  }

  const blendData = mixActive ? computeMixBlend() : computeBlend()
  const endBlend = blendData.at(-1)
  const changeVsBase = endBlend != null ? endBlend - 100 : null
  const changeColor = changeVsBase == null ? 'var(--d-text)' : changeVsBase > 0 ? 'var(--d-red)' : changeVsBase < 0 ? 'var(--d-green)' : 'var(--d-muted)'
  const changeColorHex = changeVsBase == null ? undefined : changeVsBase > 0 ? (isLight ? '#dc2626' : '#f87171') : (isLight ? '#16a34a' : '#22c55e')

  const compStats = rows.map(row => {
    const d = R[row.id]; const baseVal = d?.[fi], endVal = d?.[ti]
    const delta = baseVal && endVal && baseVal !== 0 ? ((endVal - baseVal) / baseVal * 100) : null
    return { ...row, delta }
  })
  const validStats = compStats.filter(c => c.delta != null)
  const worstComp = validStats.length ? validStats.reduce((a, b) => b.delta! > a.delta! ? b : a) : null
  const bestComp  = validStats.length ? validStats.reduce((a, b) => b.delta! < a.delta! ? b : a) : null

  // Mix comp stats
  const mixStats = mixEntries.map((entry, ei) => {
    const model = savedModels.find(m => m.name === entry.name)
    const endIdx = model ? modelBlendAt(model, labels.length - 1) : null
    return { ...entry, color: MIX_COLORS[ei % MIX_COLORS.length], endIdx, delta: endIdx != null ? endIdx - 100 : null }
  })
  const mixWorst = mixStats.filter(s => s.delta != null).reduce<typeof mixStats[0] | null>((a, b) => (b.delta! > (a?.delta ?? -Infinity) ? b : a), null)
  const mixBest  = mixStats.filter(s => s.delta != null).reduce<typeof mixStats[0] | null>((a, b) => (b.delta! < (a?.delta ?? Infinity) ? b : a), null)

  // --- Chart datasets ---

  const barDatasets = rows.map(row => {
    const sc = SC_MAP[row.id]
    return {
      label: row.label,
      data: labels.map((_, li) => {
        const d = R[row.id]; if (!d) return null
        const bv = d[fi], cv = d[fi + li]
        if (bv == null || cv == null || bv === 0) return null
        return +((cv / bv * 100) * (row.weight / (totalWeight || 1))).toFixed(3)
      }),
      backgroundColor: `${sc?.c ?? '#4f8ef7'}bb`, borderColor: sc?.c ?? '#4f8ef7',
      borderWidth: 0, stack: 'blend', spanGaps: true,
    }
  })

  const mixBarDatasets = mixEntries.map((entry, ei) => {
    const model = savedModels.find(m => m.name === entry.name)
    const color = MIX_COLORS[ei % MIX_COLORS.length]
    return {
      label: entry.name,
      data: labels.map((_, li) => {
        if (!model || totalMixWeight === 0 || entry.weight === 0) return null
        const idx = modelBlendAt(model, li)
        return idx != null ? +((idx * entry.weight) / totalMixWeight).toFixed(3) : null
      }),
      backgroundColor: `${color}bb`, borderColor: color,
      borderWidth: 0, stack: 'blend', spanGaps: true,
    }
  })

  const activeDatasets = mixActive ? mixBarDatasets : barDatasets

  const miniLineDataset = [{
    data: blendData,
    borderColor: changeColorHex ?? 'var(--d-brand)',
    backgroundColor: `${changeColorHex ?? '#4f8ef7'}18`,
    borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: true, spanGaps: true,
  }]

  // --- Chart options ---

  const gc = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'
  const tc = isLight ? '#94a3b8' : '#4a5568'
  const tooltipBg = isLight ? '#ffffff' : '#060a10'
  const tooltipTitle = isLight ? '#0f172a' : '#eef2ff'
  const tooltipBody = isLight ? '#475569' : '#9ca3af'

  const barOptions: ChartOptions<'bar'> = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index', intersect: false,
        backgroundColor: tooltipBg, borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)', borderWidth: 1,
        titleColor: tooltipTitle, bodyColor: tooltipBody,
        titleFont: { family: "'Fira Code',monospace", size: 11 },
        bodyFont: { family: "'Fira Code',monospace", size: 10 },
        callbacks: {
          afterBody: (items) => {
            const total = items.reduce((s, i) => s + (i.parsed.y || 0), 0)
            return ['─────────', `Blended: ${total.toFixed(1)}  (${total >= 100 ? '+' : ''}${(total - 100).toFixed(1)}%)`]
          }
        }
      },
    },
    scales: {
      x: { stacked: true, grid: { color: gc }, ticks: { color: tc, font: { family: "'Fira Code',monospace", size: 10 }, maxTicksLimit: 14 } },
      y: { stacked: true, grid: { color: gc }, ticks: { color: tc, font: { family: "'Fira Code',monospace", size: 10 }, callback: v => (+v).toFixed(0) } },
    },
  }

  const miniOptions: ChartOptions<'line'> = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: { display: true, position: 'right', grid: { color: gc }, border: { display: false },
        ticks: { color: tc, font: { family: "'Fira Code',monospace", size: 9 }, maxTicksLimit: 4, callback: v => (+v).toFixed(0) } },
    },
  }

  // --- Actions ---

  function setDatePreset(p: string) {
    setPreset(p); const last = DT.length - 1
    const map: Record<string, [number, number]> = { '6m': [last - 5, last], '1y': [last - 11, last], '2y': [last - 23, last], 'all': [0, last] }
    const [f, t] = map[p] ?? [0, last]; setFromIdx(Math.max(0, f)); setToIdx(t)
  }

  function addRow() {
    const available = Object.keys(R).find(id => !rows.find(r => r.id === id)); if (!available) return
    const sc = SC_MAP[available]
    setRows(prev => [...prev, { id: available, label: sc?.label ?? available, unit: sc?.unit ?? '', weight: 0.05 }])
  }

  function saveModel() {
    const model: SavedModel = { name: modelName.trim() || 'Unnamed', rows: rows.map(r => ({ ...r })), fromIdx, toIdx }
    const updated = [...savedModels.filter(m => m.name !== model.name), model]
    setSavedModels(updated); saveModels(updated); toast(`Saved "${model.name}"`, true)
  }

  function loadModel(m: SavedModel) {
    setRows(m.rows.map(r => ({ ...r }))); setFromIdx(m.fromIdx); setToIdx(m.toIdx)
    setModelName(m.name); setShowLoad(false); setPreset(''); setMixActive(false)
    toast(`Loaded "${m.name}"`, true)
  }

  function toggleMix() {
    if (!mixActive) {
      if (savedModels.length < 2) { toast('Save at least 2 models first'); return }
      const eq = Math.round(100 / savedModels.length)
      setMixEntries(savedModels.map((m, i) => ({
        name: m.name,
        weight: i === savedModels.length - 1 ? 100 - eq * (savedModels.length - 1) : eq,
      })))
    }
    setMixActive(v => !v)
  }

  function addMixEntry(name: string) {
    setMixEntries(prev => [...prev, { name, weight: 50 }])
    setShowAddModel(false)
  }

  function handleMixDrop(i: number) {
    if (mixDragIdx === null || mixDragIdx === i) { setMixDragIdx(null); setMixOverIdx(null); return }
    const next = [...mixEntries]; const [moved] = next.splice(mixDragIdx, 1); next.splice(i, 0, moved)
    setMixEntries(next); setMixDragIdx(null); setMixOverIdx(null)
  }

  function handleRowDrop(i: number) {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setOverIdx(null); return }
    const next = [...rows]; const [moved] = next.splice(dragIdx, 1); next.splice(i, 0, moved)
    setRows(next); setDragIdx(null); setOverIdx(null)
  }

  function exportSummaryCSV() {
    const csvRows = [
      ['Date', 'Blended Index', 'Change vs Base (%)'],
      ...labels.map((d, i) => { const v = blendData[i]; return [d, v != null ? v.toFixed(2) : '', v != null ? (v - 100).toFixed(2) : ''] })
    ]
    const blob = new Blob([csvRows.map(r => r.join(',')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `cost-index-${modelName.replace(/\s+/g, '-').toLowerCase()}.csv`; a.click()
    toast('Index exported as CSV', true)
  }

  async function captureElement(el: HTMLElement, bg: string) {
    const prev = { bg: el.style.background, bd: el.style.backdropFilter }
    const style = el.style as CSSStyleDeclaration & Record<string, string>
    const prevWbd = style['-webkit-backdrop-filter'] ?? ''
    el.style.background = bg; el.style.backdropFilter = 'none'; style['-webkit-backdrop-filter'] = 'none'
    try { return await html2canvas(el, { backgroundColor: bg, scale: 2, logging: false, useCORS: true, allowTaint: true }) }
    finally { el.style.background = prev.bg; el.style.backdropFilter = prev.bd; style['-webkit-backdrop-filter'] = prevWbd }
  }

  async function exportSummaryPNG() {
    if (!summaryCardRef.current) return
    const bg = isLight ? '#f0f4fa' : '#060a14'
    const canvas = await captureElement(summaryCardRef.current, bg)
    const a = document.createElement('a')
    a.download = `cost-index-${modelName.replace(/\s+/g, '-').toLowerCase()}.png`
    a.href = canvas.toDataURL('image/png'); a.click(); toast('Card exported as PNG', true)
  }

  async function exportChart() {
    if (!chartCardRef.current) return
    const bg = isLight ? '#f0f4fa' : '#060a14'
    const canvas = await captureElement(chartCardRef.current, bg)
    const a = document.createElement('a')
    a.download = `cost-model-${modelName.replace(/\s+/g, '-').toLowerCase()}.png`
    a.href = canvas.toDataURL('image/png'); a.click(); toast('Chart exported', true)
  }

  const modelsNotInMix = savedModels.filter(m => !mixEntries.find(e => e.name === m.name))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`@keyframes cm-live{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>

      {/* ── Controls bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {!mixActive && (
          <>
            <input className="d-input" value={modelName} onChange={e => setModelName(e.target.value)} placeholder="Model name…" style={{ width: 170 }} />
            <button className="d-btn-primary" onClick={saveModel}><Save className="w-3.5 h-3.5" /> Save</button>
          </>
        )}

        {/* Load dropdown */}
        {!mixActive && (
          <div style={{ position: 'relative' }}>
            <button className="d-btn" onClick={() => setShowLoad(v => !v)}>
              <FolderOpen className="w-3.5 h-3.5" /> Load{savedModels.length > 0 ? ` (${savedModels.length})` : ''} <ChevronDown className="w-3 h-3" />
            </button>
            {showLoad && (
              <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, minWidth: 270, background: 'var(--d-card)', border: '1px solid var(--d-border-h)', borderRadius: 10, boxShadow: 'var(--d-shadow)', padding: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 8px', borderBottom: '1px solid var(--d-border)' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Saved Models</span>
                  <button onClick={() => setShowLoad(false)} style={{ color: 'var(--d-muted)', background: 'none', border: 'none', cursor: 'pointer' }}><X className="w-3.5 h-3.5" /></button>
                </div>
                {savedModels.length === 0
                  ? <p style={{ padding: '12px 8px', fontSize: 12, color: 'var(--d-muted)', fontStyle: 'italic' }}>No saved models yet.</p>
                  : savedModels.map(m => (
                    <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 6 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--d-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div onClick={() => loadModel(m)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--d-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</p>
                        <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-muted)' }}>{m.rows.length} rows · {DT[m.fromIdx]} → {DT[m.toIdx]}</p>
                      </div>
                      <button onClick={() => { const u = savedModels.filter(x => x.name !== m.name); setSavedModels(u); saveModels(u) }}
                        style={{ color: 'var(--d-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--d-red)')}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--d-muted)')}
                      ><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}

        {mixActive && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--d-text)', letterSpacing: '0.04em' }}>
            Model Mix
          </span>
        )}

        <button className={mixActive ? 'd-btn-primary' : 'd-btn'} onClick={toggleMix}>
          <Layers className="w-3.5 h-3.5" /> {mixActive ? 'Exit Mix' : 'Mix'}
        </button>

        {/* Date presets */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="seg-pill">
            {['6m','1y','2y','all'].map(p => (
              <button key={p} className={preset === p ? 'active' : ''} onClick={() => setDatePreset(p)}>{p.toUpperCase()}</button>
            ))}
          </div>
          <select className="d-sel" value={fromIdx} onChange={e => { setFromIdx(+e.target.value); setPreset('') }}>
            {DT_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <span style={{ color: 'var(--d-muted)' }}>→</span>
          <select className="d-sel" value={toIdx} onChange={e => { setToIdx(+e.target.value); setPreset('') }}>
            {DT_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* ── 2-column: left panel | summary card ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 440px', gap: 14, alignItems: 'start' }}>

        {/* LEFT: either commodity table or mix cards */}
        {mixActive ? (
          /* ── Mix cards panel ── */
          <div className="d-card" style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px 10px', borderBottom: '1px solid var(--d-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--d-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Composition</h3>
                {Math.abs(totalMixWeight - 100) > 0.5 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--d-amber)', fontSize: 10 }}>
                    <AlertCircle className="w-3 h-3" /> {totalMixWeight}% total
                  </div>
                )}
              </div>
              {/* Add model dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  className="d-btn" style={{ padding: '4px 10px', fontSize: 11 }}
                  onClick={() => setShowAddModel(v => !v)}
                  disabled={modelsNotInMix.length === 0}
                >
                  <Plus className="w-3 h-3" /> Add Model
                </button>
                {showAddModel && modelsNotInMix.length > 0 && (
                  <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 50, minWidth: 200, background: 'var(--d-card)', border: '1px solid var(--d-border-h)', borderRadius: 10, boxShadow: 'var(--d-shadow)', padding: 6 }}>
                    {modelsNotInMix.map(m => (
                      <div key={m.name} onClick={() => addMixEntry(m.name)}
                        style={{ padding: '7px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--d-text)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--d-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <p style={{ fontWeight: 500 }}>{m.name}</p>
                        <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-muted)' }}>{m.rows.length} rows</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mixEntries.length === 0
                ? <p style={{ fontSize: 12, color: 'var(--d-muted)', fontStyle: 'italic', padding: '12px 4px' }}>No models in mix.</p>
                : mixEntries.map((entry, i) => {
                  const model = savedModels.find(m => m.name === entry.name)
                  const color = MIX_COLORS[i % MIX_COLORS.length]
                  const pct = totalMixWeight > 0 ? (entry.weight / totalMixWeight * 100) : 0
                  const endIdx = model ? modelBlendAt(model, labels.length - 1) : null
                  const delta = endIdx != null ? endIdx - 100 : null
                  const deltaColor = delta == null ? 'var(--d-muted)' : delta > 0.5 ? 'var(--d-red)' : delta < -0.5 ? 'var(--d-green)' : 'var(--d-muted)'
                  const isCardDragging = mixDragIdx === i
                  const isCardOver = mixOverIdx === i && mixDragIdx !== null && mixDragIdx !== i
                  return (
                    <div
                      key={entry.name}
                      draggable
                      onDragStart={() => setMixDragIdx(i)}
                      onDragOver={e => { e.preventDefault(); setMixOverIdx(i) }}
                      onDrop={() => handleMixDrop(i)}
                      onDragEnd={() => { setMixDragIdx(null); setMixOverIdx(null) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 0,
                        background: 'var(--d-raised)', borderRadius: 9,
                        border: `1px solid ${isCardOver ? 'var(--d-brand)' : 'var(--d-border)'}`,
                        overflow: 'hidden', opacity: isCardDragging ? 0.35 : 1,
                        transition: 'opacity 0.12s, border-color 0.1s',
                        boxShadow: isCardOver ? '0 0 0 2px var(--d-brand)33' : 'none',
                      }}
                    >
                      {/* Color stripe */}
                      <div style={{ width: 4, alignSelf: 'stretch', background: color, flexShrink: 0 }} />

                      {/* Grip */}
                      <div style={{ padding: '14px 8px 14px 10px', cursor: 'grab', color: 'var(--d-dim)', flexShrink: 0, userSelect: 'none' }}>
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>

                      {/* Name + meta */}
                      <div style={{ flex: 1, minWidth: 0, padding: '10px 4px' }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--d-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                          <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-muted)' }}>{model?.rows.length ?? 0} rows</span>
                          {delta != null && (
                            <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, fontWeight: 600, color: deltaColor }}>
                              {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                            </span>
                          )}
                          {totalMixWeight > 0 && (
                            <span style={{ fontSize: 10, color: 'var(--d-brand)' }}>{pct.toFixed(0)}% of mix</span>
                          )}
                        </div>
                      </div>

                      {/* Weight input */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '0 10px 0 6px', flexShrink: 0 }}>
                        <input
                          type="number" min={0} max={100} step={5}
                          value={entry.weight}
                          onChange={e => {
                            const v = Math.max(0, Math.min(100, +e.target.value || 0))
                            setMixEntries(prev => prev.map((x, j) => j === i ? { ...x, weight: v } : x))
                          }}
                          style={{
                            width: 48, textAlign: 'right', fontFamily: "'Fira Code',monospace", fontSize: 12, fontWeight: 600,
                            background: 'var(--d-card)', color: 'var(--d-text)',
                            border: '1px solid var(--d-border)', borderRadius: 6, padding: '5px 6px', outline: 'none',
                          }}
                          onFocus={e => (e.currentTarget.style.borderColor = 'var(--d-border-f)')}
                          onBlur={e => (e.currentTarget.style.borderColor = 'var(--d-border)')}
                        />
                        <span style={{ fontSize: 11, color: 'var(--d-muted)' }}>%</span>
                      </div>

                      {/* Remove */}
                      <button
                        onClick={() => setMixEntries(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--d-dim)', padding: '14px 12px', display: 'flex', flexShrink: 0 }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--d-red)')}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--d-dim)')}
                      ><X className="w-3.5 h-3.5" /></button>
                    </div>
                  )
                })
              }

              {/* Weight bar */}
              {mixEntries.length > 1 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1.5 }}>
                    {mixEntries.map((e, i) => {
                      const pct = totalMixWeight > 0 ? (e.weight / totalMixWeight * 100) : 0
                      return <div key={i} title={`${e.name}: ${e.weight}%`} style={{ flex: pct, background: MIX_COLORS[i % MIX_COLORS.length], minWidth: 2, borderRadius: 2 }} />
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                    <button
                      className="d-btn" style={{ fontSize: 10, padding: '3px 9px' }}
                      onClick={() => {
                        const eq = Math.round(100 / Math.max(1, mixEntries.length))
                        setMixEntries(prev => prev.map((e, i) => ({ ...e, weight: i === prev.length - 1 ? 100 - eq * (prev.length - 1) : eq })))
                      }}
                    >Equal weights</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Commodity table ── */
          <div className="d-card" style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px 10px', borderBottom: '1px solid var(--d-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--d-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Components</h3>
                {Math.abs(totalWeight - 1) > 0.005 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--d-amber)', fontSize: 10 }}>
                    <AlertCircle className="w-3 h-3" />{(totalWeight * 100).toFixed(0)}% total
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
                  <th style={{ width: 20 }} />
                  <th>Commodity</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Weight %</th>
                  <th style={{ textAlign: 'right' }}>Base</th>
                  <th style={{ textAlign: 'right' }}>Now</th>
                  <th style={{ textAlign: 'right' }}>Δ%</th>
                  <th style={{ width: 28 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const d = R[row.id]; const baseVal = d?.[fi], endVal = d?.[ti]
                  const delta = baseVal && endVal && baseVal !== 0 ? ((endVal - baseVal) / baseVal * 100) : null
                  const sc = SC_MAP[row.id]
                  const deltaColor = delta == null ? 'var(--d-dim)' : delta > 0.5 ? 'var(--d-red)' : delta < -0.5 ? 'var(--d-green)' : 'var(--d-muted)'
                  return (
                    <tr key={`${row.id}-${i}`}
                      draggable
                      onDragStart={() => setDragIdx(i)}
                      onDragOver={e => { e.preventDefault(); setOverIdx(i) }}
                      onDrop={() => handleRowDrop(i)}
                      onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
                      style={{
                        opacity: dragIdx === i ? 0.35 : 1,
                        outline: overIdx === i && dragIdx !== null && dragIdx !== i ? '2px solid var(--d-brand)' : 'none',
                        outlineOffset: -1, transition: 'opacity 0.12s',
                      }}
                    >
                      <td style={{ paddingTop: 6, paddingBottom: 6, paddingLeft: 10, cursor: 'grab', color: 'var(--d-dim)', userSelect: 'none' }}>
                        <GripVertical className="w-3 h-3" />
                      </td>
                      <td style={{ paddingTop: 6, paddingBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 9, height: 9, borderRadius: 2, background: sc?.c ?? '#4f8ef7', flexShrink: 0 }} />
                          <select className="d-sel" style={{ minWidth: 150, fontSize: 11, padding: '5px 24px 5px 8px' }} value={row.id}
                            onChange={e => {
                              const sc2 = SC_MAP[e.target.value]
                              const next = [...rows]; next[i] = { ...next[i], id: e.target.value, label: sc2?.label ?? e.target.value, unit: sc2?.unit ?? '' }
                              setRows(next)
                            }}>
                            {Object.entries(SC_MAP).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
                          </select>
                          {liveIds?.has(row.id) && (
                            <span title="Live FRED data" style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0, animation: 'cm-live 1.5s ease-in-out infinite' }} />
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', paddingTop: 6, paddingBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                          <input type="number" min="0" max="100" step="1"
                            value={Math.round(row.weight * 100)}
                            onChange={e => {
                              const pct = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                              const next = [...rows]; next[i] = { ...next[i], weight: pct / 100 }; setRows(next)
                            }}
                            style={{ width: 52, textAlign: 'right', fontFamily: "'Fira Code',monospace", fontSize: 11, background: 'var(--d-raised)', color: 'var(--d-text)', border: '1px solid var(--d-border)', borderRadius: 5, padding: '4px 6px', outline: 'none' }}
                            onFocus={e => (e.currentTarget.style.borderColor = 'var(--d-border-f)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'var(--d-border)')}
                          />
                          <span style={{ fontSize: 11, color: 'var(--d-muted)', marginLeft: 2 }}>%</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: "'Fira Code',monospace", fontSize: 11, color: 'var(--d-muted)', paddingTop: 6, paddingBottom: 6 }}>{baseVal != null ? baseVal.toFixed(0) : '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: "'Fira Code',monospace", fontSize: 11, color: 'var(--d-text)', paddingTop: 6, paddingBottom: 6 }}>{endVal != null ? endVal.toFixed(0) : '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: "'Fira Code',monospace", fontSize: 11, color: deltaColor, paddingTop: 6, paddingBottom: 6 }}>{delta != null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%` : '—'}</td>
                      <td style={{ paddingTop: 6, paddingBottom: 6 }}>
                        <button onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}
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
        )}

        {/* RIGHT: Summary card */}
        <div ref={summaryCardRef} className="d-card-premium" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ height: 3, background: changeColorHex ? `linear-gradient(90deg, ${changeColorHex}cc, ${changeColorHex}22)` : 'linear-gradient(90deg, var(--d-brand), transparent)' }} />

          <div style={{ padding: '18px 20px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {mixActive ? 'Mix Index' : 'Blended Cost Index'}
              </p>
              <div style={{ display: 'flex', gap: 5 }}>
                <button className="d-btn" style={{ padding: '3px 9px', fontSize: 10, gap: 4 }} onClick={exportSummaryCSV}><Download className="w-3 h-3" /> CSV</button>
                <button className="d-btn" style={{ padding: '3px 9px', fontSize: 10, gap: 4 }} onClick={exportSummaryPNG}><Download className="w-3 h-3" /> PNG</button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 6 }}>
              <div style={{ fontFamily: "'Fira Code',monospace", fontSize: 44, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em', color: changeColor }}>
                {changeVsBase == null ? '—' : `${changeVsBase >= 0 ? '+' : ''}${changeVsBase.toFixed(1)}%`}
              </div>
              {changeVsBase != null && (
                <div style={{
                  padding: '3px 9px', borderRadius: 20, marginBottom: 5, fontSize: 10, fontWeight: 600,
                  background: changeVsBase > 0.5 ? 'rgba(248,113,113,0.1)' : changeVsBase < -0.5 ? 'rgba(34,197,94,0.1)' : 'var(--d-raised)',
                  color: changeVsBase > 0.5 ? 'var(--d-red)' : changeVsBase < -0.5 ? 'var(--d-green)' : 'var(--d-muted)',
                  border: `1px solid ${changeVsBase > 0.5 ? 'rgba(248,113,113,0.2)' : changeVsBase < -0.5 ? 'rgba(34,197,94,0.2)' : 'var(--d-border)'}`,
                  letterSpacing: '0.04em',
                }}>{changeVsBase > 0.5 ? 'Rising' : changeVsBase < -0.5 ? 'Falling' : 'Stable'}</div>
              )}
            </div>
            <div style={{ fontFamily: "'Fira Code',monospace", fontSize: 11, color: 'var(--d-muted)', marginBottom: 16 }}>
              vs base {DT[fi]} → now {endBlend != null ? `(idx ${endBlend.toFixed(1)})` : ''}
            </div>

            <div style={{ position: 'relative', width: '100%', height: 90, marginBottom: 16 }}>
              <Line data={{ labels, datasets: miniLineDataset }} options={miniOptions} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--d-inset)', borderRadius: 8, border: '1px solid var(--d-border)', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 9, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 3 }}>Base</p>
                <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 17, fontWeight: 500, color: 'var(--d-text)', lineHeight: 1 }}>100.0</p>
                <p style={{ fontSize: 10, color: 'var(--d-muted)', marginTop: 3 }}>{DT[fi]}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ color: 'var(--d-muted)', fontSize: 16 }}>→</span>
                {changeVsBase != null && (
                  <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: changeColor, fontWeight: 600 }}>
                    {changeVsBase >= 0 ? '+' : ''}{changeVsBase.toFixed(1)}%
                  </span>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 9, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 3 }}>Now</p>
                <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 17, fontWeight: 500, color: changeColor, lineHeight: 1 }}>{endBlend?.toFixed(1) ?? '—'}</p>
                <p style={{ fontSize: 10, color: 'var(--d-muted)', marginTop: 3 }}>{DT[ti]}</p>
              </div>
            </div>

            {/* Drivers */}
            {mixActive ? (
              (mixWorst || mixBest) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
                  <p style={{ fontSize: 9, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2 }}>Model Breakdown</p>
                  {mixWorst && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: 'rgba(248,113,113,0.07)', borderRadius: 7, border: '1px solid rgba(248,113,113,0.16)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--d-red)', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'var(--d-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mixWorst.name}</span>
                      <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 11, fontWeight: 600, color: 'var(--d-red)', flexShrink: 0 }}>{mixWorst.delta! >= 0 ? '+' : ''}{mixWorst.delta!.toFixed(1)}%</span>
                    </div>
                  )}
                  {mixBest && mixBest.name !== mixWorst?.name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: 'rgba(34,197,94,0.07)', borderRadius: 7, border: '1px solid rgba(34,197,94,0.16)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--d-green)', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'var(--d-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mixBest.name}</span>
                      <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 11, fontWeight: 600, color: 'var(--d-green)', flexShrink: 0 }}>{mixBest.delta! >= 0 ? '+' : ''}{mixBest.delta!.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              )
            ) : (
              (worstComp || bestComp) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
                  <p style={{ fontSize: 9, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2 }}>Biggest Drivers</p>
                  {worstComp && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: 'rgba(248,113,113,0.07)', borderRadius: 7, border: '1px solid rgba(248,113,113,0.16)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--d-red)', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'var(--d-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{worstComp.label}</span>
                      <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 11, fontWeight: 600, color: 'var(--d-red)', flexShrink: 0 }}>{worstComp.delta! >= 0 ? '+' : ''}{worstComp.delta!.toFixed(1)}%</span>
                    </div>
                  )}
                  {bestComp && bestComp.id !== worstComp?.id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: 'rgba(34,197,94,0.07)', borderRadius: 7, border: '1px solid rgba(34,197,94,0.16)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--d-green)', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'var(--d-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bestComp.label}</span>
                      <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 11, fontWeight: 600, color: 'var(--d-green)', flexShrink: 0 }}>{bestComp.delta! >= 0 ? '+' : ''}{bestComp.delta!.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              )
            )}

            {/* Weight distribution */}
            <p style={{ fontSize: 9, color: 'var(--d-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>
              {mixActive ? 'Mix Distribution' : 'Weight Distribution'}
            </p>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1.5, marginBottom: 8 }}>
              {mixActive
                ? mixEntries.map((e, i) => {
                    const pct = totalMixWeight > 0 ? (e.weight / totalMixWeight * 100) : 0
                    return <div key={i} title={`${e.name}: ${e.weight}%`} style={{ flex: pct, background: MIX_COLORS[i % MIX_COLORS.length], minWidth: 2, borderRadius: 2 }} />
                  })
                : rows.map((row, i) => {
                    const sc = SC_MAP[row.id]; const pct = totalWeight > 0 ? (row.weight / totalWeight * 100) : 0
                    return <div key={i} title={`${row.label}: ${(row.weight * 100).toFixed(0)}%`} style={{ flex: pct, background: sc?.c ?? '#4f8ef7', minWidth: 2, borderRadius: 2 }} />
                  })
              }
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
              {mixActive
                ? mixEntries.map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--d-muted)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: MIX_COLORS[i % MIX_COLORS.length], flexShrink: 0 }} />
                      <span style={{ color: 'var(--d-text)', fontSize: 10 }}>{e.name}</span>
                      <span style={{ fontFamily: "'Fira Code',monospace", color: 'var(--d-dim)' }}>{e.weight}%</span>
                    </div>
                  ))
                : rows.map((row, i) => {
                    const sc = SC_MAP[row.id]
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--d-muted)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: sc?.c ?? '#4f8ef7', flexShrink: 0 }} />
                        <span style={{ color: 'var(--d-text)', fontSize: 10 }}>{row.label}</span>
                        <span style={{ fontFamily: "'Fira Code',monospace", color: 'var(--d-dim)' }}>{(row.weight * 100).toFixed(0)}%</span>
                      </div>
                    )
                  })
              }
            </div>
          </div>
        </div>
      </div>

      {/* ── Full-width stacked bar chart ── */}
      <div ref={chartCardRef} className="d-card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--d-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {mixActive ? 'Mix Decomposition' : 'Cost Decomposition'}
            </h3>
            <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-muted)', marginTop: 2 }}>
              {mixActive
                ? 'Indexed (base = 100) · Each segment = weighted model contribution'
                : 'Indexed (base = 100) · Bar height = blended index · Segments = component contributions'}
            </p>
          </div>
          <button className="d-btn" style={{ padding: '5px 12px', fontSize: 11 }} onClick={exportChart}>
            <Download className="w-3 h-3" /> Export PNG
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
          {activeDatasets.map((ds, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--d-muted)', padding: '3px 8px', background: 'var(--d-raised)', borderRadius: 4, border: '1px solid var(--d-border)' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: ds.borderColor as string }} />
              {ds.label}
              {!mixActive && <span style={{ fontFamily: "'Fira Code',monospace", color: 'var(--d-dim)' }}>{(rows[i]?.weight * 100).toFixed(0)}%</span>}
              {mixActive && <span style={{ fontFamily: "'Fira Code',monospace", color: 'var(--d-dim)' }}>{mixEntries[i]?.weight}%</span>}
            </div>
          ))}
        </div>

        <div style={{ position: 'relative', width: '100%', height: 'clamp(280px,40vh,460px)' }}>
          <Bar data={{ labels, datasets: activeDatasets }} options={barOptions} />
        </div>
      </div>
    </div>
  )
}
