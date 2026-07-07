import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts"
import { Pencil, Check, X, PiggyBank, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "historical_dividends_per_stock_v2"
const YEARS = [2018,2019,2020,2021,2022,2023,2024,2025]

// Account display config
const ACCOUNT_CONFIG = {
  TFSA:   { label: "TFSA",         color: "#10b981", bg: "bg-emerald-50",  badge: "bg-emerald-100 text-emerald-800" },
  RRSP:   { label: "RRSP",         color: "#3b82f6", bg: "bg-blue-50",     badge: "bg-blue-100 text-blue-800" },
  FHSA:   { label: "FHSA",         color: "#8b5cf6", bg: "bg-purple-50",   badge: "bg-purple-100 text-purple-800" },
  Cash:   { label: "Cash",         color: "#f59e0b", bg: "bg-amber-50",    badge: "bg-amber-100 text-amber-800" },
  Margin: { label: "Margin",       color: "#ef4444", bg: "bg-red-50",      badge: "bg-red-100 text-red-800" },
  Other:  { label: "Other",        color: "#6b7280", bg: "bg-gray-50",     badge: "bg-gray-100 text-gray-700" },
}

function getAccountConfig(acct) {
  return ACCOUNT_CONFIG[acct] || ACCOUNT_CONFIG.Other
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {} }
  catch { return {} }
}
function save(d) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) }

const USD_CAD_RATE = 1.37

function fmt(n, cur="CAD", displayCur="CAD") {
  if (!n && n !== 0) return ""
  // Convert if needed
  let val = n
  if (cur === "USD" && displayCur === "CAD") val = n * USD_CAD_RATE
  if (cur === "CAD" && displayCur === "USD") val = n / USD_CAD_RATE
  const currency = displayCur || "CAD"
  return new Intl.NumberFormat("en-CA",{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(val)
}

// fmtD: format a value already in displayCur (no conversion)
function fmtD(n, cur="CAD") {
  if (!n && n !== 0) return "—"
  return new Intl.NumberFormat("en-CA",{style:"currency",currency:cur,minimumFractionDigits:2,maximumFractionDigits:2}).format(n)
}

function EditableCell({ value, onSave, currency="CAD", displayCur="CAD" }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState("")
  if (editing) return (
    <div className="flex items-center gap-0.5">
      <input autoFocus type="number" step="0.01" value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter")  { onSave(parseFloat(draft)||0); setEditing(false) }
          if (e.key === "Escape") { setEditing(false) }
        }}
        className="w-20 text-[11px] border border-blue-400 rounded px-1 py-0.5 focus:outline-none text-right" />
      <button onClick={()=>{onSave(parseFloat(draft)||0);setEditing(false)}} className="text-green-500 p-0.5"><Check className="h-3 w-3"/></button>
      <button onClick={()=>setEditing(false)} className="text-gray-400 p-0.5"><X className="h-3 w-3"/></button>
    </div>
  )
  return (
    <div onClick={()=>{setDraft(String(value||""));setEditing(true)}}
      className="cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 text-right group min-w-[64px] min-h-[22px] flex items-center justify-end gap-0.5">
      <span className={value ? "text-green-700 font-medium" : "text-gray-300 text-[10px]"}>
        {value ? fmt(value, currency, displayCur) : "click"}
      </span>
      <Pencil className="h-2.5 w-2.5 text-gray-300 opacity-0 group-hover:opacity-100"/>
    </div>
  )
}

export default function HistoricalDividends({ dividends = [], stocks = [], globalCurrency = "CAD" }) {
  // Map symbol|account -> currency from live stocks
  const stockCurrencyMap = useMemo(() => {
    const m = {}
    stocks.forEach(s => { m[`${s.symbol}|${s.account_type}`] = s.currency || "CAD" })
    return m
  }, [stocks])
  const [data,          setData]         = useState(load)
  const [newSymbol,     setNewSymbol]    = useState("")
  const [newAccount,    setNewAccount]   = useState("RRSP")
  const [showAdd,       setShowAdd]      = useState(false)
  const [collapsed,     setCollapsed]    = useState({})
  const displayCur = globalCurrency  // use master switch
  const USD_CAD = 1.37
  const currentYear = new Date().getFullYear()

  // Get currency for a symbol from live stocks
  function getStockCurrency(sym, acct) {
    // Try to find from stocks prop
    return "USD" // default, overridden by stock data in parent
  }

  function update(key, year, amount) {
    // key = "SYMBOL|ACCOUNT"
    const next = { ...data, [key]: { ...(data[key]||{}), [year]: amount } }
    save(next); setData(next)
  }

  function addStock(sym, acct) {
    const s = sym.trim().toUpperCase()
    if (!s) return
    const key = `${s}|${acct}`
    if (!data[key]) {
      const next = { ...data, [key]: {} }
      save(next); setData(next)
    }
    setNewSymbol(""); setShowAdd(false)
  }

  function removeStock(key) {
    const [sym, acct] = key.split("|")
    if (!confirm(`Remove ${sym} (${acct}) from dividend history?`)) return
    const next = { ...data }
    delete next[key]
    save(next); setData(next)
  }

  function toggleCollapse(acct) {
    setCollapsed(prev => ({ ...prev, [acct]: !prev[acct] }))
  }

  // Build stock list: from saved data + from live stocks
  // Key format: "SYMBOL|ACCOUNT"
  const stockKeys = useMemo(() => {
    const fromData  = Object.keys(data)
    const fromStocks = stocks
      .filter(s => s.shares > 0)
      .map(s => `${s.symbol}|${s.account_type || "RRSP"}`)
    return [...new Set([...fromData, ...fromStocks])].sort()
  }, [data, stocks])

  // Group by account
  const byAccount = useMemo(() => {
    const groups = {}
    stockKeys.forEach(key => {
      const [sym, acct] = key.split("|")
      const a = acct || "RRSP"
      if (!groups[a]) groups[a] = []
      groups[a].push({ key, sym, acct: a })
    })
    return groups
  }, [stockKeys])

  const accountOrder = Object.keys(byAccount).sort()

  // Current year live dividends per stock key
  const liveByKey = useMemo(() => {
    const map = {}
    dividends
      .filter(d => new Date(d.date).getFullYear() === currentYear)
      .forEach(d => {
        const stock = stocks.find(s => s.id === d.stock_id)
        if (!stock) return
        const key = `${stock.symbol}|${stock.account_type || "RRSP"}`
        map[key] = (map[key] || 0) + (d.amount || 0)
      })
    return map
  }, [dividends, stocks, currentYear])

  // Inline conversion helpers (stable, used inside useMemo)
  const yearTotals = useMemo(() => {
    const convert = (amount, key) => {
      const cur = stockCurrencyMap[key] || "USD"
      if (cur === "USD" && displayCur === "CAD") return amount * USD_CAD_RATE
      if (cur === "CAD" && displayCur === "USD") return amount / USD_CAD_RATE
      return amount
    }
    const convertLive = (amount, key) => {
      const [sym, acct] = key.split("|")
      const stock = stocks.find(s => s.symbol === sym && s.account_type === acct)
      const cur = stock?.currency || "USD"
      if (cur === "USD" && displayCur === "CAD") return amount * USD_CAD_RATE
      if (cur === "CAD" && displayCur === "USD") return amount / USD_CAD_RATE
      return amount
    }
    const totals = {}
    YEARS.forEach(y => {
      totals[y] = stockKeys.reduce((s, key) => s + convert(data[key]?.[y] || 0, key), 0)
    })
    totals[currentYear] = Object.entries(liveByKey).reduce((s, [key, v]) => s + convertLive(v, key), 0)
    return totals
  }, [data, stockKeys, liveByKey, currentYear, displayCur, stockCurrencyMap, stocks])

  // Per-account yearly totals — currency-aware
  const acctYearTotals = useMemo(() => {
    const convert = (amount, key) => {
      const cur = stockCurrencyMap[key] || "USD"
      if (cur === "USD" && displayCur === "CAD") return amount * USD_CAD_RATE
      if (cur === "CAD" && displayCur === "USD") return amount / USD_CAD_RATE
      return amount
    }
    const convertLive = (amount, key) => {
      const [sym, acct] = key.split("|")
      const stock = stocks.find(s => s.symbol === sym && s.account_type === acct)
      const cur = stock?.currency || "USD"
      if (cur === "USD" && displayCur === "CAD") return amount * USD_CAD_RATE
      if (cur === "CAD" && displayCur === "USD") return amount / USD_CAD_RATE
      return amount
    }
    const totals = {}
    accountOrder.forEach(acct => {
      totals[acct] = {}
      YEARS.forEach(y => {
        totals[acct][y] = (byAccount[acct]||[]).reduce((s,{key}) => s + convert(data[key]?.[y]||0, key), 0)
      })
      totals[acct][currentYear] = (byAccount[acct]||[]).reduce((s,{key}) => s + convertLive(liveByKey[key]||0, key), 0)
    })
    return totals
  }, [data, byAccount, liveByKey, currentYear, accountOrder, displayCur, stockCurrencyMap, stocks])

  // Expose convertLive for use in JSX
  const toLiveDisplay = (amount, key) => {
    const [sym, acct] = key.split("|")
    const stock = stocks.find(s => s.symbol === sym && s.account_type === acct)
    const cur = stock?.currency || "USD"
    if (cur === "USD" && displayCur === "CAD") return amount * USD_CAD_RATE
    if (cur === "CAD" && displayCur === "USD") return amount / USD_CAD_RATE
    return amount
  }

  const grandTotal = Object.values(yearTotals).reduce((s,v)=>s+v,0)

  // Chart data — already in display currency via acctYearTotals
  const chartData = YEARS.map(y => {
    const pt = { year: String(y) }
    accountOrder.forEach(acct => { pt[acct] = parseFloat((acctYearTotals[acct]?.[y] || 0).toFixed(2)) })
    return pt
  })
  const livePoint = { year: `${currentYear} (live)` }
  accountOrder.forEach(acct => { livePoint[acct] = parseFloat((acctYearTotals[acct]?.[currentYear] || 0).toFixed(2)) })
  chartData.push(livePoint)

  return (
    <div className="space-y-4">

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-white p-4">
          <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><PiggyBank className="h-3.5 w-3.5 text-green-500"/>All-time Total</div>
          <div className="text-xl font-bold text-green-600">{fmtD(grandTotal)}</div>
        </Card>
        <Card className="bg-white p-4">
          <div className="text-xs text-gray-400 mb-1">{currentYear} (live)</div>
          <div className="text-xl font-bold text-blue-600">{fmtD(yearTotals[currentYear]||0)}</div>
        </Card>
        {accountOrder.map(acct => {
          const cfg = getAccountConfig(acct)
          const acctTotal = YEARS.reduce((s,y)=>s+(acctYearTotals[acct]?.[y]||0),0) + (acctYearTotals[acct]?.[currentYear]||0)
          return (
            <Card key={acct} className="bg-white p-4">
              <div className="text-xs text-gray-400 mb-1 flex items-center gap-1.5">
                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", cfg.badge)}>{acct}</span>
                all-time {displayCur}
              </div>
              <div className="text-lg font-bold" style={{color: cfg.color}}>{fmtD(acctTotal)}</div>
            </Card>
          )
        })}
      </div>

      {/* Stacked bar chart by account */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Dividends by Year — broken down by account</CardTitle>

          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false}/>
              <XAxis dataKey="year" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} width={60}
                tickFormatter={v=>v>=1000?`$${(v/1000).toFixed(0)}K`:`$${v}`}/>
              <Tooltip formatter={(v,name)=>[fmtD(v, displayCur), name]}/>
              <Legend wrapperStyle={{fontSize:11}}/>
              {accountOrder.map(acct => (
                <Bar key={acct} dataKey={acct} stackId="a"
                  fill={getAccountConfig(acct).color} radius={acct===accountOrder[accountOrder.length-1]?[3,3,0,0]:[0,0,0,0]}
                  maxBarSize={50}/>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Per-account grouped table */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm">Dividends by Stock by Year — grouped by account</CardTitle>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Enter amounts in native currency: CAD for Canadian stocks, USD for US stocks.
                {currentYear} column auto-filled from transactions.
              </p>
            </div>
            <div className="flex items-center gap-2">

              <button onClick={()=>setShowAdd(v=>!v)}
                className="flex items-center gap-1 text-xs text-blue-600 border border-blue-200 rounded px-2.5 py-1.5 hover:bg-blue-50">
                <Plus className="h-3.5 w-3.5"/> Add Stock
              </button>
            </div>
          </div>
          {showAdd && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <input autoFocus value={newSymbol} onChange={e=>setNewSymbol(e.target.value.toUpperCase())}
                onKeyDown={e=>{ if(e.key==="Enter") addStock(newSymbol, newAccount); if(e.key==="Escape") setShowAdd(false) }}
                placeholder="Symbol e.g. TD, NVDA"
                className="text-sm border border-blue-300 rounded px-2 py-1.5 w-36 focus:outline-none focus:ring-1 focus:ring-blue-400"/>
              <select value={newAccount} onChange={e=>setNewAccount(e.target.value)}
                className="text-sm border border-blue-300 rounded px-2 py-1.5 focus:outline-none">
                {Object.keys(ACCOUNT_CONFIG).filter(a=>a!=="Other").map(a=>(
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <button onClick={()=>addStock(newSymbol, newAccount)} className="text-green-600 p-1"><Check className="h-4 w-4"/></button>
              <button onClick={()=>setShowAdd(false)} className="text-gray-400 p-1"><X className="h-4 w-4"/></button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50 border-b sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium sticky left-0 bg-gray-50 min-w-[110px]">Stock</th>
                  {YEARS.map(y => (
                    <th key={y} className="px-2 py-2 text-right text-gray-500 font-medium whitespace-nowrap">{y}</th>
                  ))}
                  <th className="px-2 py-2 text-right text-blue-600 font-semibold whitespace-nowrap">
                    {currentYear} <span className="text-[9px] font-normal text-blue-400">live</span>
                  </th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium">Total</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {accountOrder.map(acct => {
                  const cfg = getAccountConfig(acct)
                  const rows = byAccount[acct] || []
                  const isCollapsed = collapsed[acct]
                  const acctTotal = YEARS.reduce((s,y)=>s+(acctYearTotals[acct]?.[y]||0),0)
                    + (acctYearTotals[acct]?.[currentYear]||0)

                  return [
                    // Account header row
                    <tr key={`hdr-${acct}`}
                      className="cursor-pointer select-none border-t-2 border-gray-200"
                      style={{background: cfg.color + "18"}}
                      onClick={()=>toggleCollapse(acct)}>
                      <td className="px-3 py-2 sticky left-0 font-semibold" style={{background: cfg.color + "18"}}>
                        <div className="flex items-center gap-1.5">
                          {isCollapsed
                            ? <ChevronRight className="h-3.5 w-3.5" style={{color:cfg.color}}/>
                            : <ChevronDown  className="h-3.5 w-3.5" style={{color:cfg.color}}/>}
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold", cfg.badge)}>{acct}</span>
                          <span className="text-gray-500 font-normal">({rows.length} stocks)</span>
                        </div>
                      </td>
                      {YEARS.map(y => (
                        <td key={y} className="px-2 py-2 text-right font-semibold text-gray-700">
                          {acctYearTotals[acct]?.[y] > 0 ? fmtD(acctYearTotals[acct][y], displayCur) : "—"}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right font-semibold text-blue-700">
                        {acctYearTotals[acct]?.[currentYear] > 0 ? fmtD(acctYearTotals[acct][currentYear], displayCur) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold" style={{color:cfg.color}}>
                        {acctTotal > 0 ? fmtD(acctTotal, displayCur) : "—"}
                      </td>
                      <td></td>
                    </tr>,

                    // Stock rows (collapsible)
                    ...(!isCollapsed ? rows.map(({key, sym}) => {
                      const rowTotal = YEARS.reduce((s,y)=>s+(data[key]?.[y]||0),0) + (liveByKey[key]||0)
                      return (
                        <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-1.5 sticky left-0 bg-white">
                            <div className="flex items-center gap-1.5 pl-4">
                              <span className="font-semibold text-gray-900">{sym}</span>
                            </div>
                          </td>
                          {YEARS.map(y => (
                            <td key={y} className="px-1 py-0.5">
                              <EditableCell
                                value={data[key]?.[y]||0}
                                onSave={v=>update(key,y,v)}
                                currency={stockCurrencyMap[key] || "CAD"}
                                displayCur={displayCur}
                              />
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-right text-blue-600 font-medium">
                            {liveByKey[key] ? fmtD(toLiveDisplay(liveByKey[key], key), displayCur) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold text-gray-800">
                            {rowTotal > 0 ? fmt(rowTotal, stockCurrencyMap[key]||"CAD", displayCur) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            <button onClick={()=>removeStock(key)} className="text-gray-300 hover:text-red-500 transition-colors">
                              <Trash2 className="h-3.5 w-3.5"/>
                            </button>
                          </td>
                        </tr>
                      )
                    }) : [])
                  ]
                })}

                {/* Grand total row */}
                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                  <td className="px-3 py-2 text-gray-700 sticky left-0 bg-gray-50">Grand Total</td>
                  {YEARS.map(y => (
                    <td key={y} className="px-2 py-2 text-right text-gray-800">
                      {yearTotals[y] > 0 ? fmtD(yearTotals[y], displayCur) : "—"}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right text-blue-700">{yearTotals[currentYear]>0 ? fmtD(yearTotals[currentYear], displayCur) : "—"}</td>
                  <td className="px-2 py-2 text-right text-green-700">{fmtD(grandTotal, displayCur)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[10px] text-gray-400 border-t">
            Stocks are grouped by account (TFSA, RRSP, etc). Click an account header to collapse/expand it. {currentYear} column is auto-filled from transactions.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
