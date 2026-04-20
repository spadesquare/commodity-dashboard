"use client"

import { useState, useCallback } from "react"
import { DT, DT_FULL, R as DefaultR, SC, CATEGORIES, type RawData, type Series } from "@/data/commodities"
import { Upload, Download, RefreshCw, CheckCircle, AlertCircle, Plus, Trash2, Layers } from "lucide-react"

const CUSTOM_SERIES_KEY = 'commodity_custom_series'
const loadCustomSeries = (): Series[] => { try { return JSON.parse(localStorage.getItem(CUSTOM_SERIES_KEY) ?? '[]') } catch { return [] } }
const saveCustomSeries = (s: Series[]) => localStorage.setItem(CUSTOM_SERIES_KEY, JSON.stringify(s))

interface Props {
  R: RawData
  onSave: (data: RawData) => void
  onReset: () => void
  toast: (msg: string, success?: boolean) => void
  customSeries: Series[]
  onSeriesSaved: (series: Series[]) => void
}

// ── CSV helpers ─────────────────────────────────────────────────────
function dataToCSV(R: RawData): string {
  const ids = Object.keys(R)
  const header = ['Date', ...ids].join(',')
  const rows = DT.map((dt, i) => [dt, ...ids.map(id => R[id]?.[i] ?? '')].join(','))
  return [header, ...rows].join('\n')
}

function parseCSV(text: string): { data: RawData; errors: string[] } | null {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return null
  const errors: string[] = []
  const headers = lines[0].split(',').map(h => h.trim())
  const dateCol = headers[0]
  const ids = headers.slice(1)
  const data: RawData = {}
  ids.forEach(id => { data[id] = [] })
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    ids.forEach((id, j) => {
      const raw = cols[j + 1]?.trim()
      const v = raw === '' || raw === undefined ? null : parseFloat(raw)
      if (v !== null && isNaN(v)) errors.push(`Row ${i + 1}, col ${id}: invalid number "${raw}"`)
      data[id].push(isNaN(v as number) ? null : v)
    })
  }
  return { data, errors }
}

type ViewMode = 'csv' | 'table' | 'series'

const BLANK_SERIES: Omit<Series, 'id'> = { label: '', cat: 'other', unit: '', c: '#4f8ef7' }

export function DataManager({ R, onSave, onReset, toast, customSeries, onSeriesSaved }: Props) {
  const [csvText, setCsvText] = useState('')
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [parseOk, setParseOk] = useState(false)
  const [parsedData, setParsedData] = useState<RawData | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('csv')
  const [editR, setEditR] = useState<RawData>(() => JSON.parse(JSON.stringify(R)))
  const [dirtyCell, setDirtyCell] = useState<Set<string>>(new Set())
  const [newSeries, setNewSeries] = useState<Omit<Series, 'id'> & { id: string }>(
    { id: '', ...BLANK_SERIES }
  )
  const [seriesError, setSeriesError] = useState('')

  const handleCsvChange = useCallback((text: string) => {
    setCsvText(text)
    if (!text.trim()) { setParseErrors([]); setParseOk(false); setParsedData(null); return }
    const result = parseCSV(text)
    if (!result) { setParseErrors(['Could not parse CSV — check format']); setParseOk(false); setParsedData(null); return }
    if (result.errors.length > 0) { setParseErrors(result.errors); setParseOk(false); setParsedData(null) }
    else { setParseErrors([]); setParseOk(true); setParsedData(result.data) }
  }, [])

  function downloadCurrentCSV() {
    const csv = dataToCSV(R)
    const blob = new Blob([csv], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'commodity-data.csv'
    link.click()
    toast('Downloaded current data as CSV', true)
  }

  function downloadDefaultCSV() {
    const csv = dataToCSV(DefaultR)
    const blob = new Blob([csv], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'commodity-data-default.csv'
    link.click()
    toast('Downloaded default data template', true)
  }

  function applyCSV() {
    if (!parsedData) return
    onSave(parsedData); setCsvText(''); setParseOk(false); setParsedData(null)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => handleCsvChange(ev.target?.result as string ?? '')
    reader.readAsText(file)
    e.target.value = ''
  }

  function applyTableEdits() {
    onSave(editR); setDirtyCell(new Set())
  }

  function addSeries() {
    const id = newSeries.id.trim().replace(/\s+/g, '_').toLowerCase()
    if (!id) { setSeriesError('ID is required'); return }
    if (!newSeries.label.trim()) { setSeriesError('Label is required'); return }
    if (SC.some(s => s.id === id) || customSeries.some(s => s.id === id)) {
      setSeriesError(`ID "${id}" already exists`); return
    }
    const series: Series = { ...newSeries, id, label: newSeries.label.trim(), unit: newSeries.unit.trim() }
    const updated = [...customSeries, series]
    onSeriesSaved(updated)
    // Add empty data column for this series
    const newR = { ...R, [id]: Array(DT.length).fill(null) }
    onSave(newR)
    setNewSeries({ id: '', ...BLANK_SERIES })
    setSeriesError('')
    toast(`Added series "${series.label}"`, true)
  }

  function deleteCustomSeries(id: string) {
    const updated = customSeries.filter(s => s.id !== id)
    onSeriesSaved(updated)
    toast('Series removed', true)
  }

  const ids = Object.keys(R)
  const displayIds = SC.map(s => s.id).filter(id => ids.includes(id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── How-to card ── */}
      <div className="d-card" style={{ padding: '18px 20px', background: 'var(--d-brand-bg)', borderColor: 'var(--d-border-f)' }}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--d-brand)', marginBottom: 10 }}>How to update your data</h3>
        <ol style={{ fontSize: 12, color: 'var(--d-muted)', lineHeight: 1.9, paddingLeft: 20, margin: 0 }}>
          <li><strong style={{ color: 'var(--d-text)' }}>Download</strong> the current data as a CSV template below.</li>
          <li><strong style={{ color: 'var(--d-text)' }}>Edit</strong> it in Excel, Google Sheets, or any spreadsheet tool — update values, add months, etc.</li>
          <li><strong style={{ color: 'var(--d-text)' }}>Paste</strong> the updated CSV in the text area, or <strong style={{ color: 'var(--d-text)' }}>upload</strong> the file.</li>
          <li>Click <strong style={{ color: 'var(--d-text)' }}>Apply</strong> — data updates instantly across all charts.</li>
        </ol>
        <p style={{ fontSize: 11, color: 'var(--d-dim)', marginTop: 8, fontFamily: "'Fira Code',monospace" }}>
          Data is stored locally in your browser. No server required.
        </p>
      </div>

      {/* ── Download templates ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="d-btn-primary" onClick={downloadCurrentCSV}>
          <Download className="w-3.5 h-3.5" /> Download current data (CSV)
        </button>
        <button className="d-btn" onClick={downloadDefaultCSV}>
          <Download className="w-3.5 h-3.5" /> Download default template
        </button>
        <button className="d-btn" onClick={onReset} style={{ marginLeft: 'auto', color: 'var(--d-red)' }}>
          <RefreshCw className="w-3.5 h-3.5" /> Reset to defaults
        </button>
      </div>

      {/* ── View mode toggle ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="seg-pill">
          <button className={viewMode === 'csv' ? 'active' : ''} onClick={() => setViewMode('csv')}>
            CSV Paste / Upload
          </button>
          <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>
            Inline Table Editor
          </button>
          <button className={viewMode === 'series' ? 'active' : ''} onClick={() => setViewMode('series')}>
            Manage Series
          </button>
        </div>
      </div>

      {viewMode === 'csv' ? (
        /* ── CSV mode ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="d-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--d-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Paste CSV or Upload File
              </h3>
              <label className="d-btn" style={{ cursor: 'pointer' }}>
                <Upload className="w-3.5 h-3.5" />
                Upload .csv file
                <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
            </div>

            <textarea
              value={csvText}
              onChange={e => handleCsvChange(e.target.value)}
              placeholder={`Date,abs_eu,abs_cn,ldpe_eu,...\nJan 23,2325.5,1270.95,...\nFeb 23,2333,1354.65,...`}
              style={{
                width: '100%', height: 220, background: 'var(--d-inset)', color: 'var(--d-text)',
                border: `1px solid ${parseErrors.length > 0 ? 'var(--d-red)' : parseOk ? 'var(--d-green)' : 'var(--d-border)'}`,
                borderRadius: 8, padding: '12px 14px', fontFamily: "'Fira Code',monospace",
                fontSize: 11, outline: 'none', resize: 'vertical', lineHeight: 1.7,
                transition: 'border-color 0.15s',
              }}
            />

            {/* Parse feedback */}
            {parseErrors.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 8, color: 'var(--d-red)', fontSize: 11 }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  {parseErrors.slice(0, 3).map((e, i) => <p key={i}>{e}</p>)}
                  {parseErrors.length > 3 && <p>+ {parseErrors.length - 3} more errors</p>}
                </div>
              </div>
            )}
            {parseOk && parsedData && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: 'var(--d-green)', fontSize: 11 }}>
                <CheckCircle className="w-4 h-4" />
                CSV parsed successfully — {Object.keys(parsedData).length} series, {Object.values(parsedData)[0]?.length ?? 0} rows
              </div>
            )}

            {parseOk && parsedData && (
              <button className="d-btn-primary" onClick={applyCSV} style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}>
                <CheckCircle className="w-4 h-4" /> Apply & Update All Charts
              </button>
            )}
          </div>

          {/* Format reference */}
          <div className="d-card" style={{ padding: '16px 18px' }}>
            <h4 style={{ fontSize: 10, fontWeight: 600, color: 'var(--d-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Expected CSV Format
            </h4>
            <div style={{ fontFamily: "'Fira Code',monospace", fontSize: 11, color: 'var(--d-muted)', lineHeight: 1.8 }}>
              <div style={{ color: 'var(--d-brand)' }}>Date,abs_eu,abs_cn,ldpe_eu,ldpe_cn,pp_eu,...(21 columns)</div>
              <div>Jan 23,2325.5,1270.95,1990.5,1026.89,1510.5,...</div>
              <div>Feb 23,2333,1354.65,1944.25,1077.59,1504.25,...</div>
              <div style={{ color: 'var(--d-dim)', marginTop: 4, fontSize: 10 }}>
                ↳ Empty cells = null (missing data). Add new months at the bottom. Column order must match header.
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {displayIds.map(id => (
                <span key={id} style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-dim)', background: 'var(--d-raised)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--d-border)' }}>{id}</span>
              ))}
            </div>
          </div>
        </div>
      ) : viewMode === 'series' ? (
        /* ── Series manager ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Add new series form */}
          <div className="d-card" style={{ padding: '18px 20px' }}>
            <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--d-text)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
              Add New Commodity
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 10, color: 'var(--d-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                  ID <span style={{ color: 'var(--d-dim)', fontStyle: 'italic', textTransform: 'none' }}>(unique key, no spaces)</span>
                </label>
                <input className="d-input" value={newSeries.id} placeholder="e.g. pvc_eu"
                  onChange={e => { setNewSeries(p => ({ ...p, id: e.target.value })); setSeriesError('') }}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--d-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Label</label>
                <input className="d-input" value={newSeries.label} placeholder="e.g. PVC — Europe"
                  onChange={e => setNewSeries(p => ({ ...p, label: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--d-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Category</label>
                <select className="d-sel" value={newSeries.cat}
                  onChange={e => setNewSeries(p => ({ ...p, cat: e.target.value }))}
                  style={{ width: '100%' }}>
                  {CATEGORIES.filter(c => c !== 'all').map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                  <option value="custom">Custom…</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--d-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Unit</label>
                <input className="d-input" value={newSeries.unit} placeholder="e.g. €/t"
                  onChange={e => setNewSeries(p => ({ ...p, unit: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: 'var(--d-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Color</label>
              <input type="color" value={newSeries.c}
                onChange={e => setNewSeries(p => ({ ...p, c: e.target.value }))}
                style={{ width: 36, height: 28, padding: 2, border: '1px solid var(--d-border)', borderRadius: 6, cursor: 'pointer', background: 'var(--d-raised)' }}
              />
              <span style={{ width: 10, height: 10, borderRadius: 2, background: newSeries.c, border: '1px solid var(--d-border)' }} />
              <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 11, color: 'var(--d-muted)' }}>{newSeries.c}</span>
            </div>
            {seriesError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--d-red)', fontSize: 11, marginBottom: 10 }}>
                <AlertCircle className="w-3.5 h-3.5" /> {seriesError}
              </div>
            )}
            <button className="d-btn-primary" onClick={addSeries} style={{ gap: 6 }}>
              <Plus className="w-3.5 h-3.5" /> Add Commodity
            </button>
            <p style={{ fontSize: 10, color: 'var(--d-dim)', fontFamily: "'Fira Code',monospace", marginTop: 8 }}>
              New series are added with empty data — fill in values via the Table Editor or CSV upload.
            </p>
          </div>

          {/* Custom series list */}
          {customSeries.length > 0 && (
            <div className="d-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--d-border)' }}>
                <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--d-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Custom Series ({customSeries.length})
                </h3>
              </div>
              <table className="d-table" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Label</th>
                    <th>Category</th>
                    <th>Unit</th>
                    <th>Color</th>
                    <th style={{ width: 32 }} />
                  </tr>
                </thead>
                <tbody>
                  {customSeries.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontFamily: "'Fira Code',monospace" }}>{s.id}</td>
                      <td>{s.label}</td>
                      <td>{s.cat}</td>
                      <td style={{ fontFamily: "'Fira Code',monospace", color: 'var(--d-muted)' }}>{s.unit}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 14, height: 14, borderRadius: 3, background: s.c, border: '1px solid var(--d-border)', flexShrink: 0 }} />
                          <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-muted)' }}>{s.c}</span>
                        </div>
                      </td>
                      <td>
                        <button onClick={() => deleteCustomSeries(s.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--d-dim)', padding: 4, display: 'flex' }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--d-red)')}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--d-dim)')}
                        ><Trash2 className="w-3 h-3" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Built-in series reference */}
          <div className="d-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--d-border)' }}>
              <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--d-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Built-in Series ({SC.length})
              </h3>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 14 }}>
              {SC.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--d-raised)', borderRadius: 5, border: '1px solid var(--d-border)', fontSize: 11 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: s.c, flexShrink: 0 }} />
                  <span style={{ color: 'var(--d-text)' }}>{s.label}</span>
                  <span style={{ fontFamily: "'Fira Code',monospace", fontSize: 10, color: 'var(--d-dim)' }}>{s.unit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── Table editor mode ── */
        <div className="d-card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid var(--d-border)', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--d-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Inline Table Editor
              </h3>
              <p style={{ fontSize: 11, color: 'var(--d-muted)', marginTop: 2 }}>Click any cell to edit. Dirty cells are highlighted.</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {dirtyCell.size > 0 && (
                <button className="d-btn" onClick={() => { setEditR(JSON.parse(JSON.stringify(R))); setDirtyCell(new Set()) }}>
                  Discard changes ({dirtyCell.size})
                </button>
              )}
              <button
                className="d-btn-primary"
                onClick={applyTableEdits}
                style={{ opacity: dirtyCell.size === 0 ? 0.5 : 1 }}
                disabled={dirtyCell.size === 0}
              >
                <CheckCircle className="w-3.5 h-3.5" /> Apply {dirtyCell.size > 0 ? `(${dirtyCell.size} changes)` : ''}
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
            <table className="d-table" style={{ minWidth: 'max-content' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--d-card)', zIndex: 10 }}>
                <tr>
                  <th style={{ minWidth: 80, position: 'sticky', left: 0, background: 'var(--d-card)', zIndex: 20 }}>Date</th>
                  {displayIds.map(id => (
                    <th key={id} style={{ minWidth: 90, textAlign: 'right' }}>{id}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DT.map((dt, ri) => (
                  <tr key={dt}>
                    <td style={{ fontFamily: "'Fira Code',monospace", fontSize: 11, color: 'var(--d-muted)', position: 'sticky', left: 0, background: 'var(--d-card)', fontWeight: 500 }}>
                      {dt}
                    </td>
                    {displayIds.map(id => {
                      const cellKey = `${id}-${ri}`
                      const val = editR[id]?.[ri]
                      const isDirty = dirtyCell.has(cellKey)
                      return (
                        <td key={id} style={{ textAlign: 'right', padding: '4px 8px' }}>
                          <input
                            type="number"
                            step="any"
                            defaultValue={val ?? ''}
                            onBlur={e => {
                              const newVal = e.target.value === '' ? null : parseFloat(e.target.value)
                              const oldVal = editR[id]?.[ri]
                              if (newVal === oldVal) return
                              const newR = { ...editR, [id]: [...(editR[id] ?? [])] }
                              newR[id][ri] = isNaN(newVal as number) ? null : newVal
                              setEditR(newR)
                              setDirtyCell(prev => { const s = new Set(prev); s.add(cellKey); return s })
                            }}
                            style={{
                              width: 80, textAlign: 'right', fontFamily: "'Fira Code',monospace",
                              fontSize: 11, background: isDirty ? 'rgba(79,142,247,0.1)' : 'transparent',
                              color: 'var(--d-text)', border: `1px solid ${isDirty ? 'var(--d-border-f)' : 'transparent'}`,
                              borderRadius: 4, padding: '3px 6px', outline: 'none',
                              transition: 'background 0.15s, border-color 0.15s',
                            }}
                            onFocus={e => (e.currentTarget.style.borderColor = 'var(--d-border-f)')}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
