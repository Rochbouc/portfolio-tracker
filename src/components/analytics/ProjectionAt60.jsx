import { useState, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts"
import { Target, RotateCcw, Pencil, Check, X, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Default spreadsheet data ──────────────────────────────────────
const DEFAULTS = {
  roch: {
    label:"Roch Personal Investments", startAge:49, endAge:65, retireAge:60,
    goal:225000, goalAge:58,
    actuals:      {48:89033,49:96782.99,50:111304,51:146150.65,52:193424.97,53:229000},
    contributions:{49:3533.75,50:3000,51:8192,52:8235,53:8000,54:8000,55:8000,56:8000,57:8000,58:8000,59:5000,60:5000,61:5000,62:5000,63:5000,64:5000,65:5000},
  },
  rrrsp: {
    label:"Roch RRSP (with Allen)", startAge:49, endAge:65, retireAge:60,
    goal:500000, goalAge:58,
    actuals:      {48:248713.20,49:244425.51,50:268076.55,51:299164.91,52:334148.95,53:370420},
    contributions:{49:7245.37,50:7904,51:7904,52:7904,53:7904,54:7904,55:7904,56:7904,57:7904,58:7904,59:8000,60:8000,61:8000,62:8000,63:8000,64:8000,65:8000},
  },
  drrsp: {
    label:"Daniele RRSP (with Allen)", startAge:50, endAge:67, retireAge:58,
    goal:800000, goalAge:60,
    actuals:      {50:490973.61,51:467059.72,52:496180.65,53:539216.31,54:582227.69,55:606382},
    contributions:{50:0,51:0,52:0,53:0,54:0,55:0,56:0,57:0,58:0,59:0,60:0,61:0,62:0,63:0,64:0,65:0,66:0,67:0},
  },
  dcorpo: {
    label:"Daniele Corpo (with Allen)", startAge:50, endAge:67, retireAge:58,
    goal:800000, goalAge:60,
    actuals:      {50:0,51:61895.15,52:201695.19,53:330320.48,54:524353.13,55:646446.77},
    contributions:{51:60388,52:130000,53:105000,54:130000,55:130000,56:30000,57:30000,58:30000,59:0,60:0,61:0,62:0,63:0,64:0,65:0,66:0,67:0},
  },
}

const STORAGE_KEY = "proj60_accounts_v3"
const SETTINGS_KEY = "proj60_settings_v1"
const RATES       = [0.12, 0.10, 0.08, 0.06, 0.04, 0.02]
const RATE_LABELS = ["12%","10%","8%","6%","4%","2%"]
const RATE_COLORS = ["#6366f1","#3b82f6","#10b981","#f59e0b","#f97316","#6b7280"]

function loadAccounts() {
  try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY)); return s ? {...structuredClone(DEFAULTS),...s} : structuredClone(DEFAULTS) }
  catch { return structuredClone(DEFAULTS) }
}
function saveAccounts(d) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) }

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {} } catch { return {} }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) }

// formula: identical to spreadsheet
function buildTable(acct) {
  const { startAge, endAge, actuals, contributions } = acct
  const actualAges = Object.keys(actuals).map(Number).sort((a,b) => a-b)
  const lastActAge = actualAges[actualAges.length-1]
  const rows = []
  const projVals = RATES.map(() => actuals[lastActAge])
  for (let age = startAge; age <= endAge; age++) {
    const contrib  = contributions?.[age] ?? 0
    const actual   = actuals?.[age] ?? null
    const projected = RATES.map((rate, ri) => {
      if (age <= lastActAge) return null
      projVals[ri] = projVals[ri] * (1 + rate) + contrib
      return projVals[ri]
    })
    rows.push({ age, contrib, actual, projected })
  }
  return rows
}

function fmtM(n) {
  if (n == null || isNaN(n)) return "—"
  if (Math.abs(n) >= 1e6) return "$" + (n/1e6).toFixed(2) + "M"
  if (Math.abs(n) >= 1e3) return "$" + (n/1000).toFixed(1) + "K"
  return "$" + n.toFixed(0)
}
function fmtFull(n) {
  if (n == null || isNaN(n)) return "—"
  return new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD",minimumFractionDigits:2,maximumFractionDigits:2}).format(n)
}

// ── Inline editable cell ──────────────────────────────────────────
function EditableCell({ value, onSave, className, placeholder="—" }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState("")
  function startEdit() { setDraft(value != null ? String(value) : ""); setEditing(true) }
  function commit()    { const p = parseFloat(draft.replace(/[$,]/g,"")); onSave(isNaN(p) ? null : p); setEditing(false) }
  function cancel()    { setEditing(false) }
  if (editing) return (
    <td className={cn("px-1 py-0.5 whitespace-nowrap", className)}>
      <div className="flex items-center gap-0.5">
        <input autoFocus type="number" step="0.01" value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if(e.key==="Enter") commit(); if(e.key==="Escape") cancel() }}
          className="w-24 text-[11px] border border-blue-400 rounded px-1 py-0.5 text-right focus:outline-none" />
        <button onClick={commit}  className="text-green-500 p-0.5"><Check className="h-3 w-3" /></button>
        <button onClick={cancel}  className="text-gray-400 p-0.5"><X className="h-3 w-3" /></button>
      </div>
    </td>
  )
  return (
    <td className={cn("px-2 py-1 whitespace-nowrap cursor-pointer group/cell relative", className)} onClick={startEdit} title="Click to edit">
      {value != null ? fmtFull(value) : <span className="text-gray-300">{placeholder}</span>}
      <Pencil className="h-2.5 w-2.5 text-gray-300 group-hover/cell:text-blue-400 absolute top-1 right-1 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
    </td>
  )
}

// ── Projection table ──────────────────────────────────────────────
function ProjectionTable({ acctId, acct, onUpdateActual, onUpdateContrib, liveVal }) {
  const effectiveAcct = useMemo(() => {
    if (!liveVal) return acct
    const lastActAge = Math.max(...Object.keys(acct.actuals).map(Number))
    return { ...acct, actuals: { ...acct.actuals, [lastActAge]: liveVal } }
  }, [acct, liveVal])

  const rows = useMemo(() => buildTable(effectiveAcct), [effectiveAcct])
  const chartData = rows.map(r => {
    const pt = { age: r.age }
    if (r.actual != null) pt.Actual = r.actual
    RATES.forEach((_,i) => { if (r.projected[i] != null) pt[RATE_LABELS[i]] = Math.round(r.projected[i]) })
    return pt
  })

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{top:4,right:8,left:0,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="age" tick={{fontSize:10}} axisLine={false} tickLine={false} />
          <YAxis tick={{fontSize:9}} axisLine={false} tickLine={false} width={54}
            tickFormatter={v => v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1000?`$${(v/1000).toFixed(0)}K`:`$${v}`} />
          <Tooltip formatter={(v,name) => [fmtFull(v), name]} labelFormatter={v => `Age ${v}`} />
          {acct.goal && <ReferenceLine y={acct.goal} stroke="#f59e0b" strokeDasharray="5 3" label={{value:`Goal ${fmtM(acct.goal)}`,fontSize:9,fill:"#d97706",position:"insideTopRight"}} />}
          {acct.retireAge && <ReferenceLine x={acct.retireAge} stroke="#6b7280" strokeDasharray="4 2" label={{value:"Retire",fontSize:9,fill:"#6b7280",position:"insideTopLeft"}} />}
          <Line type="monotone" dataKey="Actual" stroke="#1d4ed8" strokeWidth={3} dot={{r:3}} connectNulls={false} />
          {RATES.map((_,i) => <Line key={i} type="monotone" dataKey={RATE_LABELS[i]} stroke={RATE_COLORS[i]} strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls={false} />)}
        </LineChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-1.5 text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded px-3 py-1.5">
        <Pencil className="h-3 w-3 flex-shrink-0" />
        Click any <strong className="mx-0.5">Actual $</strong> or <strong className="mx-0.5">Contribution</strong> cell to edit · Enter to save · Esc to cancel
      </div>

      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-1.5 text-left text-gray-500 font-medium sticky left-0 bg-gray-50 z-10">Age</th>
              <th className="px-2 py-1.5 text-right text-gray-600 font-semibold bg-blue-50/50 border-l border-blue-100">
                <span className="flex items-center justify-end gap-1">Contribution <Pencil className="h-2.5 w-2.5 text-blue-300" /></span>
              </th>
              {RATE_LABELS.map((r,i) => (
                <th key={r} className="px-2 py-1.5 text-right font-medium" style={{color:RATE_COLORS[i]}}>{r}</th>
              ))}
              <th className="px-2 py-1.5 text-right text-blue-700 font-semibold bg-blue-50/50 border-l border-blue-100">
                <span className="flex items-center justify-end gap-1">Actual $ <Pencil className="h-2.5 w-2.5 text-blue-400" /></span>
              </th>
              <th className="px-2 py-1.5 text-right text-blue-500 font-medium">Actual %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const prevActual = rows[idx-1]?.actual
              const actualPct  = prevActual && r.actual ? ((r.actual - prevActual) / prevActual * 100) : null
              const isRetire   = r.age === acct.retireAge
              const isGoalAge  = r.age === acct.goalAge
              return (
                <tr key={r.age} className={cn("border-b border-gray-100 hover:bg-blue-50/20 transition-colors",
                  isRetire ? "bg-blue-50 font-semibold" : "", isGoalAge ? "bg-amber-50" : "")}>
                  <td className={cn("px-2 py-1 sticky left-0 font-semibold z-10",
                    isRetire ? "text-blue-700 bg-blue-50" : "text-gray-700 bg-white")}>
                    {r.age}
                    {isRetire && <span className="ml-1 text-[9px] text-blue-400">← retire</span>}
                    {isGoalAge && !isRetire && <span className="ml-1 text-[9px] text-amber-500">⚑</span>}
                  </td>
                  <EditableCell value={r.contrib||null} onSave={val => onUpdateContrib(r.age, val??0)}
                    className="text-right text-gray-600 bg-blue-50/30 border-l border-blue-100 hover:bg-blue-100/40" placeholder="0" />
                  {r.projected.map((val, i) => (
                    <td key={i} className="px-2 py-1 text-right" style={{color:val!=null?RATE_COLORS[i]:"#d1d5db"}}>
                      {val!=null ? fmtFull(val) : "—"}
                    </td>
                  ))}
                  <EditableCell value={r.actual} onSave={val => onUpdateActual(r.age, val)}
                    className="text-right font-semibold text-blue-700 bg-blue-50/30 border-l border-blue-100 hover:bg-blue-100/40" placeholder="add actual" />
                  <td className={cn("px-2 py-1 text-right",
                    actualPct==null?"text-gray-300":actualPct>=0?"text-green-600 font-medium":"text-red-500 font-medium")}>
                    {actualPct!=null ? `${actualPct>=0?"+":""}${actualPct.toFixed(2)}%` : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Inline number editor helper ───────────────────────────────────
function InlineNumber({ value, onSave, prefix="$", suffix="", label="", dark=false }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState("")
  function start() { setDraft(String(value)); setEditing(true) }
  function commit() { const p = parseFloat(draft); if (!isNaN(p)) onSave(p); setEditing(false) }
  if (editing) return (
    <span className="inline-flex items-center gap-1">
      {label && <span className="text-xs opacity-70">{label}</span>}
      <input autoFocus type="number" value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if(e.key==="Enter") commit(); if(e.key==="Escape") setEditing(false) }}
        className="w-28 text-sm font-bold border-2 border-white rounded px-2 py-0.5 focus:outline-none"
        style={{ background: dark ? "rgba(255,255,255,0.95)" : "white", color: "#1e3a5f" }} />
      <button onClick={commit} className={dark ? "text-white opacity-80 hover:opacity-100" : "text-green-500"}><Check className="h-3.5 w-3.5" /></button>
      <button onClick={() => setEditing(false)} className={dark ? "text-white opacity-60 hover:opacity-100" : "text-gray-400"}><X className="h-3.5 w-3.5" /></button>
    </span>
  )
  // Don't abbreviate years (2033 should stay 2033 not $2K)
  const displayVal = prefix === "$" && typeof value === "number" && value >= 1000
    ? fmtM(value)
    : value
  return (
    <button onClick={start} className={`inline-flex items-center gap-0.5 group transition-colors ${dark ? "hover:opacity-80" : "hover:text-blue-600"}`} title="Click to edit">
      {label && <span className={`text-xs mr-0.5 ${dark ? "opacity-70" : "text-gray-500"}`}>{label}</span>}
      <span className={dark ? "underline decoration-white/40 underline-offset-2" : ""}>{displayVal}{suffix}</span>
      <Pencil className={`h-2.5 w-2.5 ml-0.5 transition-colors ${dark ? "opacity-40 group-hover:opacity-80" : "text-gray-300 group-hover:text-blue-400"}`} />
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function ProjectionAt60({ stocks = [], prices = {} }) {
  const [accounts,      setAccounts]      = useState(() => loadAccounts())
  const [settings,      setSettings]      = useState(() => {
    const saved = loadSettings()
    const allIds = Object.keys(loadAccounts())
    // Always ensure all known accounts are included — merge saved with current
    const savedIds = saved.includedIds || []
    const mergedIds = [...new Set([...allIds, ...savedIds])].filter(id => allIds.includes(id))
    return {
      retireGoal:  2475000,
      retireYear:  2033,
      ...saved,
      includedIds: mergedIds,  // always includes all accounts
    }
  })
  const [activeSection, setActiveSection] = useState("roch")
  const [showAddAcct,   setShowAddAcct]   = useState(false)
  const [newAcctName,   setNewAcctName]   = useState("")

  // Live portfolio value for Roch Personal
  const livePersonal = stocks.reduce((s, st) => {
    const p = prices[st.symbol]?.price ?? st.avg_cost
    return s + p * (st.shares || 0)
  }, 0)

  function updateSetting(key, val) {
    setSettings(prev => { const next = {...prev, [key]:val}; saveSettings(next); return next })
  }

  // ── Mutations ────────────────────────────────────────────────────
  const updateActual = useCallback((acctId, age, val) => {
    setAccounts(prev => {
      const next = structuredClone(prev)
      if (val == null) delete next[acctId].actuals[age]
      else next[acctId].actuals[age] = val
      saveAccounts(next); return next
    })
  }, [])

  const updateContrib = useCallback((acctId, age, val) => {
    setAccounts(prev => {
      const next = structuredClone(prev)
      next[acctId].contributions[age] = val ?? 0
      saveAccounts(next); return next
    })
  }, [])

  const updateAcctField = useCallback((acctId, fields) => {
    setAccounts(prev => {
      const next = structuredClone(prev)
      Object.assign(next[acctId], fields)
      saveAccounts(next); return next
    })
  }, [])

  const resetAccount = useCallback((acctId) => {
    if (!DEFAULTS[acctId]) return
    if (!confirm(`Reset "${accounts[acctId]?.label}" to original values?`)) return
    setAccounts(prev => { const next = structuredClone(prev); next[acctId] = structuredClone(DEFAULTS[acctId]); saveAccounts(next); return next })
  }, [accounts])

  const deleteAccount = useCallback((acctId) => {
    if (DEFAULTS[acctId]) { alert("Cannot delete a built-in account. Use Reset instead."); return }
    if (!confirm(`Delete "${accounts[acctId]?.label}"?`)) return
    setAccounts(prev => {
      const next = structuredClone(prev)
      delete next[acctId]
      saveAccounts(next)
      return next
    })
    updateSetting("includedIds", settings.includedIds.filter(id => id !== acctId))
    if (activeSection === acctId) setActiveSection("roch")
  }, [accounts, settings.includedIds, activeSection])

  function addAccount() {
    if (!newAcctName.trim()) return
    const id = "custom_" + Date.now()
    const currentYear = new Date().getFullYear()
    const startAge    = 49
    const template    = { label:newAcctName.trim(), startAge, endAge:65, retireAge:60, goal:500000, goalAge:58,
      actuals:{}, contributions:{} }
    // seed empty contribution rows
    for (let age = startAge; age <= 65; age++) template.contributions[age] = 0
    setAccounts(prev => { const next = structuredClone(prev); next[id] = template; saveAccounts(next); return next })
    updateSetting("includedIds", [...settings.includedIds, id])
    setNewAcctName(""); setShowAddAcct(false); setActiveSection(id)
  }

  // ── Combined total at retirement ─────────────────────────────────
  // For each included account:
  //   Start from last ACTUAL value (or live price for Roch Personal)
  //   Compound forward with each year's contribution until retireYear
  //   Sum all accounts together
  const combinedTotal = useMemo(() => {
    return RATES.map((rate) => {
      return settings.includedIds.reduce((sum, id) => {
        let acct = accounts[id]
        if (!acct) return sum

        // Override last actual with live price for Roch Personal
        if (id === "roch" && livePersonal > 0) {
          const lastActAge = Math.max(...Object.keys(acct.actuals).map(Number))
          acct = { ...acct, actuals: { ...acct.actuals, [lastActAge]: livePersonal } }
        }

        // Find last known actual value and its age
        const actualAges = Object.keys(acct.actuals).map(Number).sort((a, b) => a - b)
        const lastActAge = actualAges[actualAges.length - 1]
        let value = acct.actuals[lastActAge] || 0

        // Determine the retire year for this account
        // retireAge is age-based; convert to year using Roch birth year 1973
        // Each account's retireAge maps to a target year
        const BIRTH_YEARS = { roch: 1973, rrrsp: 1973, drrsp: 1971, dcorpo: 1971 }
        const birthYear = BIRTH_YEARS[id] || 1973
        const acctRetireYear = birthYear + (acct.retireAge || 60)

        // Also respect the global retireYear setting — use whichever comes first
        const targetYear = Math.min(acctRetireYear, settings.retireYear + 2)

        // Convert lastActAge to a year
        const lastActYear = birthYear + lastActAge
        const currentYear = new Date().getFullYear()

        // Compound from current year to target year
        for (let yr = Math.max(lastActYear + 1, currentYear); yr <= targetYear; yr++) {
          // Age in this year
          const ageThisYear = yr - birthYear
          const contrib = acct.contributions?.[ageThisYear] ?? 0
          value = value * (1 + rate) + contrib
        }

        return sum + value
      }, 0)
    })
  }, [accounts, settings.includedIds, settings.retireYear, livePersonal])

  const totalAt8 = combinedTotal[2]  // index 2 = 8%

  const allIds     = Object.keys(accounts)
  const activeSections = [
    ...allIds.map(id => ({ id, label: accounts[id].label })),
    { id:"summary", label:"Scenarios" },
  ]
  const activeAcct = accounts[activeSection]

  return (
    <div className="space-y-4">

      {/* Header cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Retirement Goal — dollar amount only */}
        <Card className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-4">
          <div className="flex items-center gap-2 mb-1"><Target className="h-4 w-4" /><span className="text-[11px] opacity-80">Retirement Goal</span></div>
          <div className="text-2xl font-bold">
            <InlineNumber value={settings.retireGoal} onSave={v => updateSetting("retireGoal", v)} prefix="$" dark={true} />
          </div>
          <div className="text-[11px] opacity-60 mt-1">Click amount to edit</div>
        </Card>

        {/* Combined total — with per-account breakdown */}
        <Card className="bg-white p-4">
          <div className="text-[11px] text-gray-400 mb-1">Combined at Retirement ({settings.retireYear}) @ 8%</div>
          <div className={cn("text-xl font-bold", totalAt8 >= settings.retireGoal ? "text-green-600" : "text-amber-600")}>
            {fmtM(totalAt8)}
          </div>
          <div className={cn("text-[11px] mt-0.5 font-medium", totalAt8 >= settings.retireGoal ? "text-green-500" : "text-amber-500")}>
            {totalAt8 >= settings.retireGoal ? "✓ Goal reached!" : `${fmtM(settings.retireGoal - totalAt8)} short`}
          </div>
          {/* Per-account breakdown */}
          <div className="mt-2 space-y-0.5 border-t border-gray-100 pt-1.5">
            {settings.includedIds.map(id => {
              const acct = accounts[id]
              if (!acct) return null
              const BIRTH_YEARS = { roch: 1973, rrrsp: 1973, drrsp: 1971, dcorpo: 1971 }
              const byr = BIRTH_YEARS[id] || 1973
              const lastActAge = Math.max(...Object.keys(acct.actuals).map(Number))
              const lastActVal = (id === "roch" && livePersonal > 0) ? livePersonal : acct.actuals[lastActAge]
              const lastActYear = byr + lastActAge
              const acctRetireYear = byr + (acct.retireAge || 60)
              const targetYear = Math.min(acctRetireYear, settings.retireYear + 2)
              const rate = 0.08
              let val = lastActVal
              for (let yr = Math.max(lastActYear + 1, new Date().getFullYear()); yr <= targetYear; yr++) {
                val = val * (1 + rate) + (acct.contributions?.[yr - byr] ?? 0)
              }
              return (
                <div key={id} className="flex justify-between text-[10px]">
                  <span className="text-gray-400 truncate max-w-[60%]">{acct.label.split(" ").slice(0,2).join(" ")}</span>
                  <span className="font-medium text-gray-700">{fmtM(val)}</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Roch live value */}
        <Card className="bg-white p-4">
          <div className="text-[11px] text-gray-400 mb-1">Roch Personal (Live)</div>
          <div className="text-xl font-bold text-blue-700">{fmtM(livePersonal || accounts.roch?.actuals?.[53])}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">From live portfolio prices</div>
        </Card>

        {/* Years to retirement — retire year editable */}
        <Card className="bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Years to Retirement</div>
              <div className="text-xl font-bold text-gray-900">{settings.retireYear - new Date().getFullYear()}</div>
              <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                Retire year:
                <InlineNumber value={settings.retireYear} onSave={v => updateSetting("retireYear", Math.round(v))} prefix="" suffix="" />
              </div>
            </div>
            <button onClick={() => { if(confirm("Reset ALL accounts to spreadsheet defaults?")) { const f = structuredClone(DEFAULTS); setAccounts(f); saveAccounts(f); const allIds = Object.keys(f); updateSetting("includedIds", allIds) }}}
              title="Reset all" className="text-gray-300 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </Card>
      </div>

      {/* Include/exclude accounts in combined total */}
      <Card className="bg-white">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-xs font-semibold text-gray-600">Include in Combined Total:</span>
            {allIds.map(id => {
              const included = settings.includedIds.includes(id)
              return (
                <button key={id} onClick={() => {
                  const next = included ? settings.includedIds.filter(i => i !== id) : [...settings.includedIds, id]
                  updateSetting("includedIds", next)
                }} className={cn("text-xs px-2.5 py-1 rounded-full border font-medium transition-all",
                  included ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-400 border-gray-300 hover:border-blue-400")}>
                  {included ? "✓ " : ""}{accounts[id]?.label}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Rate totals at retirement */}
      <Card className="bg-white">
        <CardContent className="pt-3 pb-3">
          <div className="text-xs font-semibold text-gray-600 mb-2">Combined Total at Retirement by Rate (included accounts only)</div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {RATES.map((_,i) => (
              <div key={i} className="text-center p-2 rounded border border-gray-100 bg-gray-50">
                <div className="text-[10px] text-gray-400">{RATE_LABELS[i]}/yr</div>
                <div className="font-bold text-sm mt-0.5" style={{color: combinedTotal[i] >= settings.retireGoal ? "#16a34a" : RATE_COLORS[i]}}>
                  {fmtM(combinedTotal[i])}
                </div>
                {combinedTotal[i] >= settings.retireGoal && <div className="text-[9px] text-green-500">✓ goal</div>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Retirement spending plan */}
      <Card className="bg-white">
        <CardContent className="pt-3 pb-3">
          <span className="text-xs font-semibold text-gray-600 block mb-2">Retirement Spending Plan</span>
          <div className="grid grid-cols-3 gap-3">
            {[
              {phase:"Go-Go",  range:"60→70", amount:140000, color:"text-green-700",  bg:"bg-green-50",  border:"border-green-200"},
              {phase:"Slow-Go",range:"70→80", amount:110000, color:"text-blue-700",   bg:"bg-blue-50",   border:"border-blue-200"},
              {phase:"No-Go",  range:"80→90", amount:90000,  color:"text-purple-700", bg:"bg-purple-50", border:"border-purple-200"},
            ].map(s => (
              <div key={s.phase} className={cn("rounded-lg p-3 border", s.bg, s.border)}>
                <div className={cn("font-bold text-sm", s.color)}>{s.phase}</div>
                <div className="text-[11px] text-gray-500">{s.range}</div>
                <div className="font-semibold text-gray-800 mt-1">{fmtFull(s.amount)}/yr</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section tabs + add account */}
      <div className="flex gap-1 flex-wrap items-center">
        {activeSections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={cn("px-3 py-1.5 text-xs font-medium rounded border transition-colors",
              activeSection === s.id ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300 hover:border-gray-500")}>
            {s.label}
          </button>
        ))}
        {!showAddAcct ? (
          <button onClick={() => setShowAddAcct(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors">
            <Plus className="h-3 w-3" /> Add Account
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <input autoFocus value={newAcctName} onChange={e => setNewAcctName(e.target.value)}
              onKeyDown={e => { if(e.key==="Enter") addAccount(); if(e.key==="Escape") setShowAddAcct(false) }}
              placeholder="Account name..." className="text-xs border border-blue-300 rounded px-2 py-1.5 w-40 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            <button onClick={addAccount} className="text-green-600 p-1"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => setShowAddAcct(false)} className="text-gray-400 p-1"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>

      {/* Account section */}
      {activeSection !== "summary" && activeAcct && (
        <Card className="bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="space-y-1">
                <CardTitle className="text-sm text-gray-700">{activeAcct.label}</CardTitle>
                <div className="flex flex-wrap gap-3 text-[11px]">
                  <InlineNumber value={activeAcct.goal} onSave={v => updateAcctField(activeSection,{goal:v})} prefix="Goal $" label="" />
                  <span className="text-gray-300">|</span>
                  <InlineNumber value={activeAcct.goalAge} onSave={v => updateAcctField(activeSection,{goalAge:v})} prefix="" suffix="" label="Goal age " />
                  <span className="text-gray-300">|</span>
                  <InlineNumber value={activeAcct.retireAge} onSave={v => updateAcctField(activeSection,{retireAge:v})} prefix="" suffix="" label="Retire age " />
                  <span className="text-gray-300">|</span>
                  <InlineNumber value={activeAcct.endAge} onSave={v => updateAcctField(activeSection,{endAge:v})} prefix="" suffix="" label="End age " />
                </div>
              </div>
              <div className="flex gap-2">
                {DEFAULTS[activeSection] && (
                  <button onClick={() => resetAccount(activeSection)}
                    className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-orange-600 border border-gray-200 hover:border-orange-300 rounded px-2.5 py-1.5 transition-colors">
                    <RotateCcw className="h-3 w-3" /> Reset
                  </button>
                )}
                {!DEFAULTS[activeSection] && (
                  <button onClick={() => deleteAccount(activeSection)}
                    className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded px-2.5 py-1.5 transition-colors">
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ProjectionTable
              acctId={activeSection}
              acct={activeAcct}
              onUpdateActual={(age, val) => updateActual(activeSection, age, val)}
              onUpdateContrib={(age, val) => updateContrib(activeSection, age, val)}
              liveVal={activeSection === "roch" && livePersonal ? livePersonal : null}
            />
          </CardContent>
        </Card>
      )}

      {/* Scenarios */}
      {activeSection === "summary" && (
        <Card className="bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-700">
              Scenarios — live from your edited values
              <span className="ml-2 text-[11px] font-normal text-gray-400">Green = meets goal of {fmtM(settings.retireGoal)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left text-gray-600 font-medium">Account / Scenario</th>
                    {RATE_LABELS.map((r,i) => (
                      <th key={r} className="px-2 py-2 text-right font-semibold" style={{color:RATE_COLORS[i]}}>{r}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Per-account rows — last actual + contributions compounded to retire year */}
                  {settings.includedIds.map(id => {
                    const acct = accounts[id]
                    if (!acct) return null
                    const BIRTH_YEARS = { roch: 1973, rrrsp: 1973, drrsp: 1971, dcorpo: 1971 }
                    const birthYear = BIRTH_YEARS[id] || 1973
                    const acctRetireYear = birthYear + (acct.retireAge || 60)

                    // Last actual value
                    const actualAges = Object.keys(acct.actuals).map(Number).sort((a,b) => a-b)
                    const lastActAge  = actualAges[actualAges.length - 1]
                    const lastActYear = birthYear + lastActAge
                    const lastActVal  = (id === "roch" && livePersonal > 0) ? livePersonal : (acct.actuals[lastActAge] || 0)
                    const targetYear  = Math.min(acctRetireYear, settings.retireYear + 2)

                    const projAtRetire = RATES.map(rate => {
                      let v = lastActVal
                      const curYear = new Date().getFullYear()
                      for (let yr = Math.max(lastActYear + 1, curYear); yr <= targetYear; yr++) {
                        const ageYr = yr - birthYear
                        const contrib = acct.contributions?.[ageYr] ?? 0
                        v = v * (1 + rate) + contrib
                      }
                      return v
                    })

                    return (
                      <tr key={id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-gray-700">
                          {acct.label}
                          <span className="text-gray-400 ml-1 text-[10px]">
                            age {acct.retireAge} · starts {fmtFull(lastActVal)} ({lastActYear})
                          </span>
                        </td>
                        {projAtRetire.map((v,i) => (
                          <td key={i} className="px-2 py-1.5 text-right font-medium" style={{color:RATE_COLORS[i]}}>{fmtM(v)}</td>
                        ))}
                      </tr>
                    )
                  })}
                  {/* Combined row */}
                  <tr className="bg-blue-50 font-bold border-t-2 border-blue-200">
                    <td className="px-3 py-2 text-blue-800">Combined Total ({settings.includedIds.length} accounts)</td>
                    {combinedTotal.map((v,i) => (
                      <td key={i} className="px-2 py-2 text-right" style={{color: v >= settings.retireGoal ? "#16a34a" : RATE_COLORS[i]}}>
                        {fmtM(v)}{v >= settings.retireGoal && " ✓"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded text-[11px] text-blue-800">
              Formula: <code className="bg-blue-100 px-1 rounded">value = previous × (1 + rate) + contribution</code> — same as spreadsheet.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
