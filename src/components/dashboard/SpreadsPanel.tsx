"use client"

import { DT, SC, type RawData } from "@/data/commodities"

const PAIRS = [
  { eu: 'abs_eu', cn: 'abs_cn', label: 'ABS' },
  { eu: 'ldpe_eu', cn: 'ldpe_cn', label: 'LDPE' },
  { eu: 'pp_eu', cn: 'pp_cn', label: 'PP' },
  { eu: 'ps_eu', cn: 'ps_cn', label: 'PS' },
  { eu: 'ss_eu', cn: 'ss_cn', label: 'Stainless 304' },
  { eu: 'elec_eu', cn: 'elec_cn', label: 'Electricity' },
]

const LAST = DT.length - 1
const YEAR_AGO = Math.max(0, LAST - 11)

export function SpreadsPanel({ R }: { R: RawData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: 'var(--d-muted)' }}>EUR/USD spread comparison — Europe contract vs China spot, latest month vs 12 months ago.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
        {PAIRS.map(pair => {
          const euNow = R[pair.eu]?.[LAST] ?? null
          const cnNow = R[pair.cn]?.[LAST] ?? null
          const euY = R[pair.eu]?.[YEAR_AGO] ?? null
          const cnY = R[pair.cn]?.[YEAR_AGO] ?? null
          const scEu = SC.find(s => s.id === pair.eu)
          const scCn = SC.find(s => s.id === pair.cn)

          const spreadNow = euNow !== null && cnNow !== null ? euNow - cnNow : null
          const spreadY = euY !== null && cnY !== null ? euY - cnY : null
          const spreadDelta = spreadNow !== null && spreadY !== null ? spreadNow - spreadY : null

          const euChg = euY && euNow && euY !== 0 ? ((euNow - euY) / euY * 100) : null
          const cnChg = cnY && cnNow && cnY !== 0 ? ((cnNow - cnY) / cnY * 100) : null

          const row = (label: string, val: string, color?: string) => (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Fira Code',monospace", fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: 'var(--d-muted)' }}>{label}</span>
              <span style={{ color: color ?? 'var(--d-text)' }}>{val}</span>
            </div>
          )
          return (
            <div key={pair.label} className="d-card" style={{ padding: 14 }}>
              <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--d-text)', marginBottom: 10 }}>{pair.label}</h4>
              {row('EU', euNow != null ? `${euNow.toFixed(0)} ${scEu?.unit}` : '—', '#4a90d9')}
              {row('CN', cnNow != null ? `${cnNow.toFixed(0)} ${scEu?.unit}` : '—', '#7ec8f7')}
              <div style={{ borderTop: '1px solid var(--d-border)', margin: '8px 0' }} />
              {row('EU–CN spread', spreadNow != null ? `${spreadNow >= 0 ? '+' : ''}${spreadNow.toFixed(0)}` : '—')}
              {row('Spread Δ 12m', spreadDelta != null ? `${spreadDelta >= 0 ? '+' : ''}${spreadDelta.toFixed(0)}` : '—',
                spreadDelta == null ? undefined : spreadDelta > 0 ? 'var(--d-red)' : 'var(--d-green)')}
              {row('EU Δ 12m', euChg != null ? `${euChg >= 0 ? '+' : ''}${euChg.toFixed(1)}%` : '—',
                euChg == null ? undefined : euChg > 0 ? 'var(--d-red)' : 'var(--d-green)')}
              {row('CN Δ 12m', cnChg != null ? `${cnChg >= 0 ? '+' : ''}${cnChg.toFixed(1)}%` : '—',
                cnChg == null ? undefined : cnChg > 0 ? 'var(--d-red)' : 'var(--d-green)')}
            </div>
          )
        })}
      </div>
    </div>
  )
}
