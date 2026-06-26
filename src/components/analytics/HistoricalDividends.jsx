import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import { Pencil, Check, X, PiggyBank, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "historical_dividends_per_stock_v1"
const YEARS = [2018,2019,2020,2021,2022,2023,2024,2025]

// Pre-filled from your spreadsheet data
const DEFAULT_DATA = {
  // symbol: { 2018: amount, 2019: amount, ... }
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {} }
  catch { return {} }
}
function save(d) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) }

function fmt(n) {
  if (!n && n !== 0) return ""
  return new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD",minimumFractionDigits:2,maximumFractionDigits:2}).format(n)
}

function EditableCell({ value, onSave }) {
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
        {value ? fmt(value) : "click"}
      </span>
      <Pencil className="h-2.5 w-2.5 text-gray-300 opacity-0 group-hover:opacity-100"/>
    </div>
  )
}

export default function HistoricalDividends({ dividends = [], stocks = [] }) {
  const [data,       setData]       = useState(load)
  const [newSymbol,  setNewSymbol]  = useState("")
  const [showAdd,    setShowAdd]    = useState(false)
  const currentYear = new Date().getFullYear()

  function update(symbol, year, amount) {
    const next = { ...data, [symbol]: { ...(data[symbol]||{}), [year]: amount } }
    save(next); setData(next)
  }

  function addStock(sym) {
    const s = sym.trim().toUpperCase()
    if (!s) return
    if (!data[s]) {
      const next = { ...data, [s]: {} }
      save(next); setData(next)
    }
    setNewSymbol(""); setShowAdd(false)
  }

  function removeStock(sym) {
    if (!confirm(`Remove ${sym} from dividend history?`)) return
    const next = { ...data }
    delete next[sym]
    save(next); setData(next)
  }

  // All symbols: from historical data + from live stocks (that have dividends)
  const allSymbols = useMemo(() => {
    const fromData  = Object.keys(data)
    const fromStocks = stocks.filter(s => s.shares > 0).map(s => s.symbol)
    return [...new Set([...fromData, ...fromStocks])].sort()
  }, [data, stocks])

  // Current year live dividends per stock
  const liveBySymbol = useMemo(() => {
    const map = {}
    dividends
      .filter(d => new Date(d.date).getFullYear() === currentYear)
      .forEach(d => {
        const stock = stocks.find(s => s.id === d.stock_id)
        const sym   = stock?.symbol || d.stock_id
        map[sym] = (map[sym] || 0) + (d.amount || 0)
      })
    return map
  }, [dividends, stocks, currentYear])

  // Yearly totals
  const yearTotals = useMemo(() => {
    const totals = {}
    YEARS.forEach(y => {
      totals[y] = allSymbols.reduce((s, sym) => s + (data[sym]?.[y] || 0), 0)
    })
    totals[currentYear] = Object.values(liveBySymbol).reduce((s,v)=>s+v, 0)
    return totals
  }, [data, allSymbols, liveBySymbol, currentYear])

  const chartData = [
    ...YEARS.map(y => ({ year: String(y), amount: yearTotals[y] || 0 })),
    { year: String(currentYear)+" (live)", amount: yearTotals[currentYear] || 0 },
  ]

  const grandTotal = Object.values(yearTotals).reduce((s,v)=>s+v,0)

  return (
    <div className="space-y-4">

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="bg-white p-4">
          <div className="text-xs text-gray-400 mb-1 flex items-center gap-1"><PiggyBank className="h-3.5 w-3.5 text-green-500"/>All-time Dividends</div>
          <div className="text-xl font-bold text-green-600">{fmt(grandTotal)}</div>
        </Card>
        <Card className="bg-white p-4">
          <div className="text-xs text-gray-400 mb-1">{currentYear} (live from transactions)</div>
          <div className="text-xl font-bold text-blue-600">{fmt(yearTotals[currentYear]||0)}</div>
        </Card>
        <Card className="bg-white p-4">
          <div className="text-xs text-gray-400 mb-1">Stocks tracked</div>
          <div className="text-xl font-bold text-gray-900">{allSymbols.length}</div>
        </Card>
      </div>

      {/* Bar chart */}
      <Card className="bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Total Dividends by Year</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false}/>
              <XAxis dataKey="year" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} width={60}
                tickFormatter={v=>v>=1000?`$${(v/1000).toFixed(0)}K`:`$${v}`}/>
              <Tooltip formatter={v=>[fmt(v),"Total"]}/>
              <Bar dataKey="amount" fill="#10b981" radius={[3,3,0,0]} maxBarSize={50}
                label={{position:"top",formatter:v=>v>0?`$${(v/1000).toFixed(1)}K`:"",fontSize:9,fill:"#6b7280"}}/>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Per-stock per-year table */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm">Dividends by Stock by Year</CardTitle>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Click any cell to enter the dividend amount for that stock/year.
                {currentYear} column is auto-filled from your recorded transactions.
              </p>
            </div>
            <button onClick={()=>setShowAdd(v=>!v)}
              className="flex items-center gap-1 text-xs text-blue-600 border border-blue-200 rounded px-2.5 py-1.5 hover:bg-blue-50">
              <Plus className="h-3.5 w-3.5"/> Add Stock
            </button>
          </div>
          {showAdd && (
            <div className="flex items-center gap-2 mt-2">
              <input autoFocus value={newSymbol} onChange={e=>setNewSymbol(e.target.value.toUpperCase())}
                onKeyDown={e=>{ if(e.key==="Enter") addStock(newSymbol); if(e.key==="Escape") setShowAdd(false) }}
                placeholder="Stock symbol e.g. TD, NVDA..."
                className="text-sm border border-blue-300 rounded px-2 py-1.5 w-48 focus:outline-none focus:ring-1 focus:ring-blue-400"/>
              <button onClick={()=>addStock(newSymbol)} className="text-green-600 p-1"><Check className="h-4 w-4"/></button>
              <button onClick={()=>setShowAdd(false)} className="text-gray-400 p-1"><X className="h-4 w-4"/></button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50 border-b sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium sticky left-0 bg-gray-50">Stock</th>
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
              <tbody className="divide-y divide-gray-100">
                {allSymbols.map(sym => {
                  const rowTotal = YEARS.reduce((s,y) => s+(data[sym]?.[y]||0), 0) + (liveBySymbol[sym]||0)
                  return (
                    <tr key={sym} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-semibold text-gray-900 sticky left-0 bg-white">{sym}</td>
                      {YEARS.map(y => (
                        <td key={y} className="px-1 py-0.5">
                          <EditableCell
                            value={data[sym]?.[y] || 0}
                            onSave={v => update(sym, y, v)}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right text-blue-600 font-medium">
                        {liveBySymbol[sym] ? fmt(liveBySymbol[sym]) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold text-gray-800">
                        {rowTotal > 0 ? fmt(rowTotal) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={()=>removeStock(sym)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 className="h-3.5 w-3.5"/>
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {/* Totals row */}
                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                  <td className="px-3 py-2 text-gray-700 sticky left-0 bg-gray-50">Total</td>
                  {YEARS.map(y => (
                    <td key={y} className="px-2 py-2 text-right text-gray-800">
                      {yearTotals[y] > 0 ? fmt(yearTotals[y]) : "—"}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right text-blue-700">{yearTotals[currentYear] > 0 ? fmt(yearTotals[currentYear]) : "—"}</td>
                  <td className="px-2 py-2 text-right text-green-700">{fmt(grandTotal)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[10px] text-gray-400 border-t">
            Enter historical yearly dividend totals per stock. The {currentYear} column is automatically populated from your dividend transaction records.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
