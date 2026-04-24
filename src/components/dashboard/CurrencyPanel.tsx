"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Line } from "react-chartjs-2"
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend, Filler, type ChartOptions
} from "chart.js"
import { WorldMap } from "@/components/ui/map"
import { DT, DT_FULL, FX, FX_SERIES, FX_MAP, FX_LOCATIONS, ADVANCED_FX_SERIES, ALL_FX_MAP, type FxSeries } from "@/data/currencies"
import { loadFxData } from "@/lib/frankfurter"
import { TrendingUp, TrendingDown, Minus, Download, Info, Plus, X } from "lucide-react"
import { FxSpendPanel } from "./FxSpendPanel"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

// ─── Helpers ────────────────────────────────────────────────────────────────
function sparklinePath(data: (number | null)[], w = 90, h = 28): string {
  const vals = data.filter((v): v is number => v != null)
  if (vals.length < 2) return ""
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = max - min || 0.001
  return vals.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (vals.length - 1)) * w} ${h - ((v - min) / range) * h}`).join(" ")
}

function fmt(val: number | null | undefined, dec: number) {
  return val != null ? val.toFixed(dec) : "—"
}

function pctColor(v: number | null, isLight: boolean) {
  if (v == null) return "var(--d-muted)"
  return v > 0.1 ? (isLight ? "#dc2626" : "#f87171") : v < -0.1 ? (isLight ? "#16a34a" : "#22c55e") : "var(--d-muted)"
}

function LiveBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
      color: "#22c55e", background: "rgba(34,197,94,0.12)",
      border: "1px solid rgba(34,197,94,0.28)",
      borderRadius: 4, padding: "1px 5px", textTransform: "uppercase", flexShrink: 0,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", animation: "fx-live-pulse 1.5s ease-in-out infinite" }} />
      LIVE
    </span>
  )
}

// ─── FxRow ──────────────────────────────────────────────────────────────────
function FxRow({ s, data, selected, fi, ti, onClick, isLight, isLive, onRemove }: {
  s: FxSeries; data: (number | null)[]; selected: boolean
  fi: number; ti: number; onClick: () => void; isLight: boolean; isLive: boolean
  onRemove?: () => void
}) {
  const cur = data[ti] ?? null
  const prev1m = ti > 0 ? (data[ti - 1] ?? null) : null
  const base = data[fi] ?? null
  const chg1m = prev1m && prev1m !== 0 && cur != null ? (cur - prev1m) / prev1m * 100 : null
  const chgPeriod = base && base !== 0 && cur != null ? (cur - base) / base * 100 : null
  const spark = sparklinePath(data.slice(fi, ti + 1), 90, 26)
  const sc = chgPeriod == null ? s.c : chgPeriod > 0.5 ? (isLight ? "#dc2626" : "#f87171") : chgPeriod < -0.5 ? (isLight ? "#16a34a" : "#22c55e") : s.c

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 9, marginBottom: 3 }}>
      <div onClick={onClick} style={{
        display: "flex", alignItems: "center", gap: 8, flex: 1, cursor: "pointer",
        transition: "all 0.15s",
        background: selected ? `${s.c}15` : "transparent",
        border: `1px solid ${selected ? `${s.c}40` : "transparent"}`,
        borderRadius: 8, padding: "6px 8px",
      }}
        onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = "var(--d-hover)" }}
        onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent" }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.c, flexShrink: 0, boxShadow: selected ? `0 0 8px ${s.c}` : "none" }} />
        <div style={{ minWidth: 80 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 12, fontWeight: 700, color: "var(--d-text)" }}>{s.label}</span>
            {isLive && <LiveBadge />}
          </div>
          <div style={{ fontSize: 9, color: "var(--d-dim)" }}>{s.baseFlag}{s.quoteFlag}</div>
        </div>
        <div style={{ flex: 1, textAlign: "right", fontFamily: "'Fira Code',monospace", fontSize: 14, fontWeight: 700, color: "var(--d-text)" }}>
          {fmt(cur, s.decimals)}
        </div>
        <div style={{ minWidth: 50, textAlign: "right" }}>
          <div style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, fontWeight: 600, color: pctColor(chg1m, isLight) }}>
            {chg1m != null ? `${chg1m >= 0 ? "+" : ""}${chg1m.toFixed(2)}%` : "—"}
          </div>
          <div style={{ fontSize: 9, color: "var(--d-dim)" }}>1M</div>
        </div>
        <div style={{ minWidth: 50, textAlign: "right" }}>
          <div style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, fontWeight: 600, color: pctColor(chgPeriod, isLight) }}>
            {chgPeriod != null ? `${chgPeriod >= 0 ? "+" : ""}${chgPeriod.toFixed(1)}%` : "—"}
          </div>
          <div style={{ fontSize: 9, color: "var(--d-dim)" }}>period</div>
        </div>
        <svg width={80} height={24} style={{ flexShrink: 0, overflow: "visible" }}>
          <path d={spark} fill="none" stroke={sc} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {onRemove && (
        <button onClick={onRemove} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--d-dim)", padding: 3, flexShrink: 0, opacity: 0.6, borderRadius: 4 }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "0.6"}
        >
          <X style={{ width: 12, height: 12 }} />
        </button>
      )}
    </div>
  )
}

// ─── Main panel ──────────────────────────────────────────────────────────────
export function CurrencyPanel({ isLight, toast }: { isLight: boolean; toast: (m: string, s?: boolean) => void }) {
  const [selectedId, setSelectedId] = useState<string>("eur_usd")
  const [fromIdx, setFromIdx] = useState(0)
  const [toIdx, setToIdx] = useState(DT.length - 1)
  const [preset, setPreset] = useState("all")
  const [showInfo, setShowInfo] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [enabledAdvanced, setEnabledAdvanced] = useState<Set<string>>(new Set())
  const [mounted, setMounted] = useState(false)

  // Load live FX data — initialise from localStorage cache synchronously to avoid flash
  const [liveData, setLiveData] = useState<Record<string, (number | null)[]>>(() => {
    if (typeof window === "undefined") return {}
    try {
      const raw = localStorage.getItem("fx_live_data_v1")
      if (raw) {
        const { ts, data } = JSON.parse(raw)
        if (Date.now() - ts < 4 * 60 * 60 * 1000) return data
      }
    } catch {}
    return {}
  })
  const [liveLoaded, setLiveLoaded] = useState(false)

  const cardRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    loadFxData()
      .then(data => { setLiveData(data); setLiveLoaded(true) })
      .catch(() => setLiveLoaded(true))
  }, [])

  function getPairData(id: string): (number | null)[] {
    return liveData[id] ?? FX[id] ?? []
  }

  const isLive = Object.keys(liveData).length > 0

  function toggleAdvanced(id: string) {
    setEnabledAdvanced(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); if (selectedId === id) setSelectedId("eur_usd") }
      else next.add(id)
      return next
    })
  }

  function setDatePreset(p: string) {
    setPreset(p); const last = DT.length - 1
    const map: Record<string, [number, number]> = { "6m": [last - 5, last], "1y": [last - 11, last], "2y": [last - 23, last], "all": [0, last] }
    const [f, t] = map[p] ?? [0, last]; setFromIdx(Math.max(0, f)); setToIdx(t)
  }

  const selected = ALL_FX_MAP[selectedId] ?? FX_MAP["eur_usd"]
  const fi = Math.min(fromIdx, toIdx), ti = Math.max(fromIdx, toIdx)
  const labels = DT.slice(fi, ti + 1)
  const rawData = getPairData(selectedId).slice(fi, ti + 1)

  const gc = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.04)"
  const tc = isLight ? "#94a3b8" : "#4a5568"

  const externalTooltip = useCallback((context: { chart: ChartJS; tooltip: import("chart.js").TooltipModel<"line"> }) => {
    const { chart, tooltip } = context
    const tip = tooltipRef.current; if (!tip) return
    if (tooltip.opacity === 0) { tip.style.opacity = "0"; return }
    const absIdx = fi + (tooltip.dataPoints?.[0]?.dataIndex ?? 0)
    const title = DT_FULL[absIdx] ?? DT[absIdx]
    const p = tooltip.dataPoints?.[0]; if (!p) return
    const val = p.raw as number
    const base = rawData.find(v => v != null) ?? val
    const pct = base !== 0 ? (val - base) / base * 100 : 0
    const pc = pct > 0.1 ? "var(--d-red)" : pct < -0.1 ? "var(--d-green)" : "var(--d-muted)"
    tip.innerHTML = `
      <div style="font-size:14px;font-weight:700;color:var(--d-text);margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--d-border)">${title}</div>
      <div style="display:flex;align-items:center;gap:12px">
        <span style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--d-muted)">
          <span style="width:10px;height:10px;border-radius:50%;background:${selected.c};flex-shrink:0"></span>${selected.label}
        </span>
        <span style="font-family:'Fira Code',monospace;font-size:16px;font-weight:700;color:var(--d-text);margin-left:auto">${fmt(val, selected.decimals)}</span>
        <span style="font-family:'Fira Code',monospace;font-size:12px;font-weight:600;color:${pc}">${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%</span>
      </div>`
    tip.style.visibility = "hidden"; tip.style.opacity = "0"; tip.style.left = "0"; tip.style.top = "0"
    const cr = chart.canvas.getBoundingClientRect()
    const cx = tooltip.caretX, cy = tooltip.caretY
    const tw = tip.offsetWidth || 280, th = tip.offsetHeight || 80
    const left = cx + 18 + tw > cr.width ? Math.max(4, cx - 18 - tw) : cx + 18
    const top = Math.max(4, Math.min(cy - th / 2, cr.height - th - 4))
    tip.style.left = left + "px"; tip.style.top = top + "px"
    tip.style.visibility = "visible"; tip.style.opacity = "1"
  }, [fi, selectedId, rawData, selected])

  const chartData = {
    labels,
    datasets: [{
      label: selected.label, data: rawData,
      borderColor: selected.c, backgroundColor: `${selected.c}14`,
      borderWidth: 2, pointRadius: 0, pointHoverRadius: 5,
      tension: 0.35, fill: true, spanGaps: true,
    }]
  }

  const chartOptions: ChartOptions<"line"> = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: { enabled: false, external: externalTooltip as never } },
    scales: {
      x: { grid: { color: gc }, ticks: { color: tc, font: { family: "'Fira Code',monospace", size: 11 }, maxTicksLimit: 14 } },
      y: { grid: { color: gc }, ticks: { color: tc, font: { family: "'Fira Code',monospace", size: 11 }, callback: v => (+v).toFixed(selected.decimals <= 2 ? 1 : 3) } },
    },
  }

  const pairData = getPairData(selectedId)
  const cur = pairData[ti] ?? null
  const base = pairData[fi] ?? null
  const chgTotal = base && cur != null ? (cur - base) / base * 100 : null
  const chgColor = pctColor(chgTotal, isLight)

  async function exportPNG() {
    if (!cardRef.current) return
    const { default: html2canvas } = await import("html2canvas")
    const el = cardRef.current, bg = isLight ? "#eef2fa" : "#05080f"
    const prev = { bg: el.style.background, bd: el.style.backdropFilter }
    el.style.background = bg; el.style.backdropFilter = "none"
    try {
      const canvas = await html2canvas(el, { backgroundColor: bg, scale: 2, logging: false, useCORS: true, allowTaint: true })
      const a = document.createElement("a"); a.download = `fx-${selectedId}.png`; a.href = canvas.toDataURL(); a.click()
      toast("Exported", true)
    } finally { el.style.background = prev.bg; el.style.backdropFilter = prev.bd }
  }

  const validRaw = rawData.filter((v): v is number => v != null)
  const advancedEnabled = ADVANCED_FX_SERIES.filter(s => enabledAdvanced.has(s.id))
  const availableToAdd = ADVANCED_FX_SERIES.filter(s => !enabledAdvanced.has(s.id))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`@keyframes fx-live-pulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="seg-pill">
          {["6m","1y","2y","all"].map(p => (
            <button key={p} className={preset === p ? "active" : ""} onClick={() => setDatePreset(p)}>{p.toUpperCase()}</button>
          ))}
        </div>
        {isLive && (
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#22c55e", fontFamily: "'Fira Code',monospace" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "fx-live-pulse 1.5s ease-in-out infinite", display: "inline-block" }} />
            Live · Frankfurter
          </span>
        )}
        {!liveLoaded && !isLive && (
          <span style={{ fontSize: 11, color: "var(--d-muted)", fontFamily: "'Fira Code',monospace" }}>Loading live rates…</span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <select className="d-sel" value={fromIdx} onChange={e => { setFromIdx(+e.target.value); setPreset("") }}>
            {DT_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <span style={{ color: "var(--d-muted)" }}>→</span>
          <select className="d-sel" value={toIdx} onChange={e => { setToIdx(+e.target.value); setPreset("") }}>
            {DT_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Map + FX card */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)", gap: 16, alignItems: "stretch" }}>

        {/* ── Map card — always shows core 6 pairs only ── */}
        <div className="d-card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--d-border)", flexShrink: 0 }}>
            <h3 className="grad-text" style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Global FX Flow</h3>
            <p style={{ fontSize: 12, color: "var(--d-muted)", marginTop: 3, fontFamily: "'Fira Code',monospace" }}>
              Core pairs radiate from EUR · Click a currency to select
            </p>
          </div>

          <div style={{ flex: 1, position: "relative", minHeight: 220 }}>
            {mounted ? (
              <WorldMap
                dots={FX_SERIES.map(s => ({ start: { lat: s.baseLat, lng: s.baseLng }, end: { lat: s.quoteLat, lng: s.quoteLng } }))}
                lineColor={selected.c}
                showLabels={false}
                isDark={!isLight}
                animationDuration={2.5}
                loop={true}
                fillHeight={true}
              />
            ) : (
              <div style={{ flex: 1, height: "100%", background: "var(--d-raised)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 11, color: "var(--d-dim)", fontFamily: "'Fira Code',monospace" }}>Loading map…</span>
              </div>
            )}

            {mounted && (
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {FX_LOCATIONS.filter(loc => FX_SERIES.some(s => s.base === loc.code || s.quote === loc.code)).map(loc => {
                  const isActive = FX_SERIES.some(s => selectedId === s.id && (s.base === loc.code || s.quote === loc.code))
                  const isEur = loc.code === "EUR"
                  return (
                    <div key={loc.code}
                      style={{ position: "absolute", left: `${loc.xPct}%`, top: `${loc.yPct}%`, transform: "translate(-50%, -50%)", pointerEvents: "auto", cursor: "pointer", zIndex: isEur ? 10 : 5 }}
                      onClick={() => {
                        const pair = FX_SERIES.find(s => s.base === loc.code || s.quote === loc.code)
                        if (pair) setSelectedId(pair.id)
                      }}
                    >
                      <div style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: isEur ? "5px 10px" : "4px 8px", borderRadius: 20,
                        background: isActive ? (isEur ? `${selected.c}30` : "rgba(255,255,255,0.15)") : "rgba(0,0,0,0.55)",
                        border: `1px solid ${isActive ? (isEur ? selected.c : "rgba(255,255,255,0.5)") : "rgba(255,255,255,0.15)"}`,
                        backdropFilter: "blur(8px)",
                        boxShadow: isActive ? `0 0 12px ${selected.c}60` : "0 2px 8px rgba(0,0,0,0.4)",
                        transition: "all 0.2s", whiteSpace: "nowrap",
                      }}>
                        <span style={{ fontSize: isEur ? 13 : 11 }}>{loc.flag}</span>
                        <span style={{ fontFamily: "'Fira Code',monospace", fontSize: isEur ? 13 : 11, fontWeight: 700, color: isActive ? (isLight ? "#0f172a" : "#fff") : (isLight ? "#0f172a" : "#e2e8f0") }}>{loc.code}</span>
                      </div>
                      {isActive && !isEur && (
                        <div style={{ position: "absolute", inset: -4, borderRadius: 24, border: `1px solid ${selected.c}60`, animation: "pulse 2s ease-out infinite", pointerEvents: "none" }} />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <style>{`@keyframes pulse{0%{transform:scale(1);opacity:0.8}100%{transform:scale(1.6);opacity:0}}`}</style>
          </div>

          {/* Core pair pills — fixed, never changes */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 14px 14px", borderTop: "1px solid var(--d-border)", flexShrink: 0 }}>
            {FX_SERIES.map(s => (
              <button key={s.id} onClick={() => setSelectedId(s.id)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "5px 12px",
                borderRadius: 20, border: `1px solid ${selectedId === s.id ? s.c : "var(--d-border)"}`,
                background: selectedId === s.id ? `${s.c}18` : "var(--d-raised)",
                color: selectedId === s.id ? s.c : "var(--d-muted)",
                fontFamily: "'Fira Code',monospace", fontSize: 12, fontWeight: selectedId === s.id ? 700 : 500,
                cursor: "pointer", transition: "all 0.15s",
                boxShadow: selectedId === s.id ? `0 0 10px ${s.c}28` : "none",
              }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.c, flexShrink: 0 }} />
                {s.baseFlag}{s.quoteFlag} {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── FX Rates card ── */}
        <div className="d-card-premium" style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
          <div style={{ height: 3, background: "linear-gradient(90deg,#6366f1,#06c4d4,#a78bfa,#22c55e,#f87171,#f59e0b)" }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px 18px 14px", overflow: "auto" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <h3 className="grad-text" style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>FX Rates</h3>
                <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 11, color: "var(--d-muted)", marginTop: 2 }}>
                  {DT[fi]} → {DT[ti]} · European buyer view
                </p>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button title="Data source" onClick={() => setShowInfo(v => !v)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--d-dim)", padding: 4 }}>
                  <Info className="w-4 h-4" />
                </button>
                <button className="d-btn" style={{ padding: "3px 9px", fontSize: 11 }} onClick={exportPNG}>
                  <Download className="w-3 h-3" /> PNG
                </button>
              </div>
            </div>

            {showInfo && (
              <div style={{ padding: "10px 12px", background: "var(--d-brand-bg)", border: "1px solid var(--d-border-f)", borderRadius: 8, marginBottom: 12, fontSize: 11, color: "var(--d-muted)", lineHeight: 1.7 }}>
                <strong style={{ color: "var(--d-brand)" }}>Source:</strong> Live monthly averages from <strong>Frankfurter.dev</strong> (ECB reference rates). USD/CNY derived. 4-hour cache.
              </div>
            )}

            {/* Selected pair hero */}
            <div style={{ padding: "14px 16px", borderRadius: 12, background: `${selected.c}12`, border: `1px solid ${selected.c}35`, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 12, color: "var(--d-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                  {selected.baseFlag}{selected.quoteFlag} {selected.label}
                  {isLive && <LiveBadge />}
                </span>
                {chgTotal != null && (
                  <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 12, fontWeight: 700, color: chgColor, display: "flex", alignItems: "center", gap: 4 }}>
                    {chgTotal > 0.1 ? <TrendingUp style={{ width: 13, height: 13 }} /> : chgTotal < -0.1 ? <TrendingDown style={{ width: 13, height: 13 }} /> : <Minus style={{ width: 13, height: 13 }} />}
                    {chgTotal >= 0 ? "+" : ""}{chgTotal.toFixed(2)}%
                  </span>
                )}
              </div>
              <div style={{ fontFamily: "'Fira Code',monospace", fontSize: 36, fontWeight: 700, color: "var(--d-text)", lineHeight: 1, letterSpacing: "-0.02em" }}>
                {fmt(cur, selected.decimals)}
              </div>
              <div style={{ fontSize: 11, color: "var(--d-muted)", marginTop: 4 }}>{selected.description}</div>
            </div>

            {/* Core pairs */}
            <div>
              {FX_SERIES.map(s => (
                <FxRow key={s.id} s={s} data={getPairData(s.id)} selected={selectedId === s.id}
                  fi={fi} ti={ti} onClick={() => setSelectedId(s.id)} isLight={isLight} isLive={isLive} />
              ))}
            </div>

            {/* Additional pairs section */}
            {advancedEnabled.length > 0 && (
              <div style={{ borderTop: "1px solid var(--d-border)", marginTop: 8, paddingTop: 8 }}>
                <p style={{ fontSize: 10, color: "var(--d-dim)", fontFamily: "'Fira Code',monospace", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4, padding: "0 10px" }}>Additional pairs</p>
                {advancedEnabled.map(s => (
                  <FxRow key={s.id} s={s} data={getPairData(s.id)} selected={selectedId === s.id}
                    fi={fi} ti={ti} onClick={() => setSelectedId(s.id)} isLight={isLight} isLive={isLive}
                    onRemove={() => toggleAdvanced(s.id)} />
                ))}
              </div>
            )}

            {/* Add pair button */}
            <div style={{ marginTop: 10, position: "relative" }}>
              {availableToAdd.length > 0 && (
                <button onClick={() => setShowAddMenu(v => !v)} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  width: "100%", padding: "8px 12px", borderRadius: 8,
                  border: `1px dashed ${showAddMenu ? "var(--d-brand)" : "var(--d-border)"}`,
                  background: showAddMenu ? "var(--d-brand-bg)" : "transparent",
                  color: showAddMenu ? "var(--d-brand)" : "var(--d-dim)",
                  fontSize: 12, fontFamily: "'Fira Code',monospace",
                  cursor: "pointer", transition: "all 0.15s",
                }}>
                  <Plus style={{ width: 13, height: 13 }} />
                  Add currency pair
                  <span style={{ marginLeft: "auto", fontSize: 10, opacity: 0.7 }}>{availableToAdd.length} available</span>
                </button>
              )}

              {showAddMenu && (
                <div style={{
                  marginTop: 6, padding: "10px 10px 8px",
                  border: "1px solid var(--d-border)", borderRadius: 10,
                  background: "var(--d-raised)",
                }}>
                  <p style={{ fontSize: 10, color: "var(--d-dim)", fontFamily: "'Fira Code',monospace", marginBottom: 8 }}>
                    Select pairs to track — data live via Frankfurter
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {availableToAdd.map(s => (
                      <button key={s.id} onClick={() => { toggleAdvanced(s.id); setShowAddMenu(false) }} style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                        borderRadius: 20, border: `1px solid var(--d-border)`,
                        background: "var(--d-bg)", color: "var(--d-text)",
                        fontFamily: "'Fira Code',monospace", fontSize: 11,
                        cursor: "pointer", transition: "all 0.12s",
                      }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = s.c; (e.currentTarget as HTMLElement).style.color = s.c }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--d-border)"; (e.currentTarget as HTMLElement).style.color = "var(--d-text)" }}
                      >
                        <span style={{ fontSize: 14 }}>{s.quoteFlag}</span>
                        <span style={{ fontWeight: 600 }}>{s.label}</span>
                        <span style={{ fontSize: 10, color: "var(--d-muted)" }}>{s.description.split(" ").slice(-1)[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ── Line chart ── */}
      <div ref={cardRef} className="d-card" style={{ padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--d-text)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 8 }}>
              {selected.baseFlag}{selected.quoteFlag} {selected.label} — Rate History
              {isLive && <LiveBadge />}
            </h3>
            <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 11, color: "var(--d-muted)", marginTop: 2 }}>
              {selected.description} · {DT[fi]} → {DT[ti]}
            </p>
          </div>
          {chgTotal != null && (
            <div style={{
              padding: "6px 14px", borderRadius: 22,
              border: `1px solid ${chgTotal > 0.1 ? "rgba(248,113,113,0.3)" : chgTotal < -0.1 ? "rgba(34,197,94,0.3)" : "var(--d-border)"}`,
              background: chgTotal > 0.1 ? "rgba(248,113,113,0.08)" : chgTotal < -0.1 ? "rgba(34,197,94,0.08)" : "var(--d-raised)",
              fontFamily: "'Fira Code',monospace", fontSize: 13, fontWeight: 700, color: chgColor,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {chgTotal > 0.1 ? <TrendingUp className="w-4 h-4" /> : chgTotal < -0.1 ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
              {chgTotal >= 0 ? "+" : ""}{chgTotal.toFixed(2)}% over period
            </div>
          )}
        </div>

        <div style={{ position: "relative", width: "100%", height: "clamp(280px,42vh,520px)" }}>
          <div ref={tooltipRef} className="d-tooltip" style={{ opacity: 0, visibility: "hidden" }} />
          <Line data={chartData} options={chartOptions} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-around", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--d-border)", flexWrap: "wrap", gap: 12 }}>
          {[
            { label: `Base (${DT[fi]})`, val: fmt(pairData[fi], selected.decimals), color: "var(--d-text)" },
            { label: `Latest (${DT[ti]})`, val: fmt(pairData[ti], selected.decimals), color: chgColor },
            { label: "Period Min", val: validRaw.length ? fmt(Math.min(...validRaw), selected.decimals) : "—", color: "var(--d-green)" },
            { label: "Period Max", val: validRaw.length ? fmt(Math.max(...validRaw), selected.decimals) : "—", color: "var(--d-red)" },
            { label: "Avg", val: validRaw.length ? fmt(validRaw.reduce((a,b)=>a+b,0)/validRaw.length, selected.decimals) : "—", color: "var(--d-muted)" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "var(--d-muted)", marginBottom: 3 }}>{label}</p>
              <p style={{ fontFamily: "'Fira Code',monospace", fontSize: 16, fontWeight: 700, color }}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── FX Spend Panel ── */}
      <FxSpendPanel isLight={isLight} fi={fi} ti={ti} toast={toast} liveData={liveData} />

    </div>
  )
}
