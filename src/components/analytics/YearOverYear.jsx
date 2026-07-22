import { useState, useMemo } from "react"
import { getRate } from "@/api/rateContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts"
import { TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"

// Index data from spreadsheet
const INDEX_DATA = {
  SP500:     {2017:2274.64,2018:2500,2019:3200,2020:3756,2021:4766.18,2022:3839.50,2023:4743,2024:5881.63,2025:6858.47,2026:7372.06},
  NASDAQ:    {2017:7077,2018:6463,2019:9100,2020:12888,2021:15644.97,2022:10466.48,2023:14782,2024:19310.79,2025:23235.63,2026:25379.81},
  TSX:       {2017:16347,2018:14426,2019:17066,2020:17433,2021:21222.84,2022:19384.92,2023:20906,2024:24727.94,2025:31883.37,2026:34971.80},
  DowJones:  {2017:25100,2018:22700,2019:28950,2020:30606,2021:36338.30,2022:33147.25,2023:37743,2024:42544.22,2025:48382.39,2026:52208.88},
}

// Portfolio history from spreadsheet (account summary tab)
const PORTFOLIO_HISTORY_DEFAULTS = [
  {year:2018, invested:0,       marketValue:0,       cashDep:0,        projDiv:3.74,    actDiv:2386.53},
  {year:2019, invested:0,       marketValue:0,       cashDep:0,        projDiv:175.64,  actDiv:170.27},
  {year:2020, invested:35627.76,marketValue:45651.78,cashDep:11318.18, projDiv:800,     actDiv:553.80},
  {year:2021, invested:66147.86,marketValue:89033.34,cashDep:3434.75,  projDiv:1132.50, actDiv:1463},
  {year:2022, invested:72809.95,marketValue:96778.07,cashDep:3533.75,  projDiv:2141.75, actDiv:2956},
  {year:2023, invested:83398,   marketValue:111304,  cashDep:3000,     projDiv:2982.19, actDiv:3325},
  {year:2024, invested:100700.17,marketValue:146150.65,cashDep:8192,   projDiv:4220.99, actDiv:4712.83},
  {year:2025, invested:146150.65,marketValue:193424.97,cashDep:8235,   projDiv:3958.38, actDiv:4677.58},
  {year:2026, invested:193424.97,marketValue:242662.32,cashDep:13520,  projDiv:8142.43, actDiv:3027.14},
]

const STORAGE_KEY = "yoy_portfolio_history_v1"
function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) } catch { return null } }
function save(d) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) }

function fmt(n, dec=0) {
  if (n == null || isNaN(n)) return "—"
  return new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:dec,minimumFractionDigits:dec}).format(n)
}
function fmtPct(n) { if (n == null) return "—"; return (n>=0?"+":"")+n.toFixed(2)+"%" }

const COLORS = {SP500:"#3b82f6",NASDAQ:"#8b5cf6",TSX:"#10b981",DowJones:"#f59e0b",portfolio:"#1d4ed8",withDiv:"#16a34a"}

export default function YearOverYearPerformance({ stocks=[], transactions=[], dividends=[], prices={}, totalValue=null, totalDividendsReceived=null, estAnnualDividends=null }) {
  const [history, setHistory] = useState(() => load() || PORTFOLIO_HISTORY_DEFAULTS.map(r => ({...r})))
  const [editingRow, setEditingRow] = useState(null)
  const [editDraft,  setEditDraft]  = useState({})
  const [activeIndices, setActiveIndices] = useState(new Set(["SP500","TSX","portfolio","withDiv"]))

  // Compute live current year
  const currentYear = new Date().getFullYear()
  const USD_CAD = getRate()
  // Live market value in CAD (convert USD stocks)
  const liveMarketValue = stocks.reduce((s,st) => {
    const p   = prices[st.symbol]?.price ?? st.avg_cost
    const val = p * (st.shares||0)
    return s + (st.currency==="USD" ? val * USD_CAD : val)
  }, 0)
  const liveInvested = stocks.reduce((s,st) => {
    const val = st.avg_cost * (st.shares||0)
    return s + (st.currency==="USD" ? val * USD_CAD : val)
  }, 0)

  // Current year contributions from transactions (CAD)
  const currentYearContrib = transactions
    .filter(t => t.type==="buy" && t.date?.slice(0,4) === String(currentYear))
    .reduce((s,t) => {
      const stock = stocks.find(st=>st.id===t.stock_id)
      const val   = (t.shares||0) * (t.price||0)
      return s + (stock?.currency==="USD" ? val * USD_CAD : val)
    }, 0)

  // Current year dividends in CAD (same as main page)
  const currentYearDivs = dividends
    .filter(d => d.date?.slice(0,4) === String(currentYear))
    .reduce((s,d) => {
      const cur = d.currency || "CAD"
      return s + (cur==="USD" ? (d.amount||0) * USD_CAD : (d.amount||0))
    }, 0)

  // Build full data: historical + live current year
  // Always replace current year with live data — never use stale stored values
  const fullData = useMemo(() => {
    const rows = history.filter(r => r.year !== currentYear)
    const prevYear = rows.find(r => r.year === currentYear - 1)
    const liveMV    = totalValue || liveMarketValue
    const liveActD  = totalDividendsReceived || currentYearDivs
    const USD_CAD_R = getRate()
    const projDivEst = estAnnualDividends || stocks.reduce((s,st) => {
      const rate = parseFloat(st.annual_dividend)||0
      const val  = rate * (st.shares||0)
      return s + (st.currency==="USD" ? val * USD_CAD_R : val)
    }, 0)
    if (liveMV > 0) {
      rows.push({
        year: currentYear,
        invested: prevYear?.marketValue || liveInvested,
        marketValue: liveMV,
        cashDep: currentYearContrib,
        projDiv: Math.round(projDivEst),
        actDiv: liveActD,
        isLive: true,
      })
    }
    rows.sort((a,b) => a.year - b.year)
    return rows.map((row, i) => {
      const prev = rows[i-1]
      let pctChange = null
      if (prev && prev.marketValue > 0) {
        const gain = row.marketValue - row.cashDep - prev.marketValue
        pctChange = (gain / prev.marketValue) * 100
      }
      let pctWithDiv = null
      if (prev && prev.marketValue > 0) {
        const gainWithDiv = (row.marketValue + row.actDiv) - row.cashDep - prev.marketValue
        pctWithDiv = (gainWithDiv / prev.marketValue) * 100
      }
      const idxChanges = {}
      Object.entries(INDEX_DATA).forEach(([idx, vals]) => {
        const cur  = vals[row.year]
        const prevV = vals[row.year-1]
        if (cur && prevV) idxChanges[idx] = ((cur - prevV) / prevV) * 100
      })
      return { ...row, pctChange, pctWithDiv, idxChanges }
    })
  }, [history, liveMarketValue, currentYearContrib, currentYearDivs, totalValue, totalDividendsReceived, estAnnualDividends, stocks])
  // Chart data
  const chartData = fullData.map(r => ({
    year: String(r.year),
    portfolio: r.pctChange != null ? parseFloat(r.pctChange.toFixed(2)) : null,
    withDiv:   r.pctWithDiv != null ? parseFloat(r.pctWithDiv.toFixed(2)) : null,
    ...Object.fromEntries(Object.entries(r.idxChanges||{}).map(([k,v]) => [k, parseFloat(v.toFixed(2))]))
  }))

  const marketValueChart = fullData.map(r => ({
    year: String(r.year),
    marketValue: Math.round(r.marketValue),
    invested:    Math.round(r.invested),
  }))

  function toggleIndex(idx) {
    setActiveIndices(prev => {
      const next = new Set(prev)
      if (next.has(idx) && next.size > 1) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function startEdit(row) {
    setEditingRow(row.year)
    setEditDraft({...row})
  }
  function saveEdit() {
    const updated = history.map(r => r.year === editingRow ? {...r,...editDraft} : r)
    save(updated); setHistory(updated); setEditingRow(null)
  }
  function cancelEdit() { setEditingRow(null) }

  function addYear() {
    const lastYear = Math.max(...history.map(r => r.year))
    const newRow = {year:lastYear+1,invested:0,marketValue:0,cashDep:0,projDiv:0,actDiv:0}
    const updated = [...history, newRow]
    save(updated); setHistory(updated); setEditingRow(newRow.year); setEditDraft(newRow)
  }

  const allIndices = ["SP500","NASDAQ","TSX","DowJones","portfolio","withDiv"]
  const indexLabels = {SP500:"S&P 500",NASDAQ:"NASDAQ",TSX:"TSX",DowJones:"Dow Jones",portfolio:"Portfolio",withDiv:"Portfolio+Div"}

  // Average performance excluding contributions
  const validPcts = fullData.filter(r => r.pctChange != null && !r.isLive).map(r => r.pctChange)
  const avgPct = validPcts.length > 0 ? validPcts.reduce((s,v)=>s+v,0)/validPcts.length : null

  return (
    <div className="space-y-4">

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-white p-4">
          <div className="text-xs text-gray-400 mb-1">Avg Annual Return</div>
          <div className={cn("text-xl font-bold", (avgPct||0)>=0?"text-green-600":"text-red-500")}>{fmtPct(avgPct)}</div>
          <div className="text-xs text-gray-400">excl. contributions</div>
        </Card>
        <Card className="bg-white p-4">
          <div className="text-xs text-gray-400 mb-1">Live Market Value</div>
          <div className="text-xl font-bold text-blue-700">{fmt(totalValue || liveMarketValue)}</div>
          <div className="text-xs text-gray-400">{currentYear}</div>
        </Card>
        <Card className="bg-white p-4">
          <div className="text-xs text-gray-400 mb-1">YTD Dividends</div>
          <div className="text-xl font-bold text-green-600">{fmt(currentYearDivs)}</div>
          <div className="text-xs text-gray-400">{currentYear}</div>
        </Card>
        <Card className="bg-white p-4">
          <div className="text-xs text-gray-400 mb-1">YTD Contributions</div>
          <div className="text-xl font-bold text-purple-600">{fmt(currentYearContrib)}</div>
          <div className="text-xs text-gray-400">New money added</div>
        </Card>
      </div>

      {/* Performance comparison chart */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm">Year-over-Year % Return (excl. contributions)</CardTitle>
            <div className="flex flex-wrap gap-1.5">
              {allIndices.map(idx => (
                <button key={idx} onClick={() => toggleIndex(idx)}
                  className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium transition-all",
                    activeIndices.has(idx) ? "text-white border-transparent" : "text-gray-400 border-gray-200 bg-white")}
                  style={activeIndices.has(idx)?{background:COLORS[idx]}:{}}>
                  {indexLabels[idx]}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={2} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="year" tick={{fontSize:10}} axisLine={false} tickLine={false} />
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} width={40}
                tickFormatter={v => v+"%"} />
              <Tooltip formatter={(v,name) => [v!=null?v.toFixed(2)+"%":"—", indexLabels[name]||name]} />
              <Legend formatter={name => indexLabels[name]||name} wrapperStyle={{fontSize:"10px"}} />
              {[...activeIndices].map(idx => (
                <Bar key={idx} dataKey={idx} fill={COLORS[idx]} radius={[2,2,0,0]} maxBarSize={20} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Market value growth chart */}
      <Card className="bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Portfolio Market Value vs Cost Basis</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={marketValueChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="year" tick={{fontSize:10}} axisLine={false} tickLine={false} />
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} width={60}
                tickFormatter={v => v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1000?`$${(v/1000).toFixed(0)}K`:`$${v}`} />
              <Tooltip formatter={v=>[`$${Number(v).toLocaleString()}`]} />
              <Legend wrapperStyle={{fontSize:"10px"}} />
              <Line type="monotone" dataKey="marketValue" name="Market Value" stroke="#1d4ed8" strokeWidth={2.5} dot={{r:3}} />
              <Line type="monotone" dataKey="invested"    name="Cost Basis"   stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Historical table */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Year-by-Year History</CardTitle>
            <button onClick={addYear}
              className="text-xs text-blue-600 border border-blue-200 rounded px-2.5 py-1 hover:bg-blue-50 transition-colors">
              + Add Year
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">% Change excludes contributions deposited that year. Click any row to edit.</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {["Year","Market Value","Invested","Cash Dep","% Change*","With Divs","Proj Div","Act Div","SP500","TSX"].map(h => (
                    <th key={h} className="px-2 py-2 text-left text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fullData.map(row => {
                  const isEditing = editingRow === row.year
                  if (isEditing) return (
                    <tr key={row.year} className="bg-blue-50">
                      <td className="px-2 py-1 font-semibold text-blue-700">{row.year}</td>
                      {["marketValue","invested","cashDep","projDiv","actDiv"].map(field => (
                        <td key={field} className="px-1 py-1">
                          <input type="number" value={editDraft[field]||""} onChange={e => setEditDraft(d=>({...d,[field]:parseFloat(e.target.value)||0}))}
                            className="w-20 text-[11px] border border-blue-300 rounded px-1 py-0.5 focus:outline-none" />
                        </td>
                      ))}
                      <td colSpan={4} />
                      <td className="px-2 py-1">
                        <div className="flex gap-1">
                          <button onClick={saveEdit} className="text-green-600 text-xs px-1.5 py-0.5 bg-green-100 rounded hover:bg-green-200">Save</button>
                          <button onClick={cancelEdit} className="text-gray-500 text-xs px-1.5 py-0.5 bg-gray-100 rounded hover:bg-gray-200">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )
                  return (
                    <tr key={row.year} onClick={() => startEdit(row)}
                      className={cn("hover:bg-blue-50/30 cursor-pointer transition-colors",
                        row.isLive ? "bg-blue-50 font-medium" : "")}>
                      <td className="px-2 py-1.5 font-semibold text-gray-800">
                        {row.year}{row.isLive && <span className="ml-1 text-[9px] text-blue-500">live</span>}
                      </td>
                      <td className="px-2 py-1.5">{row.marketValue > 0 ? fmt(row.marketValue) : "—"}</td>
                      <td className="px-2 py-1.5 text-gray-500">{row.invested > 0 ? fmt(row.invested) : "—"}</td>
                      <td className="px-2 py-1.5 text-gray-500">{row.cashDep > 0 ? fmt(row.cashDep) : "—"}</td>
                      <td className={cn("px-2 py-1.5 font-semibold",
                        row.pctChange==null?"text-gray-300":row.pctChange>=0?"text-green-600":"text-red-500")}>
                        {fmtPct(row.pctChange)}
                      </td>
                      <td className={cn("px-2 py-1.5 font-semibold",
                        row.pctWithDiv==null?"text-gray-300":row.pctWithDiv>=0?"text-green-600":"text-red-500")}>
                        {fmtPct(row.pctWithDiv)}
                      </td>
                      <td className="px-2 py-1.5 text-blue-600">{row.projDiv > 0 ? fmt(row.projDiv) : "—"}</td>
                      <td className="px-2 py-1.5 text-green-600">{row.actDiv > 0 ? fmt(row.actDiv) : "—"}</td>
                      <td className={cn("px-2 py-1.5 text-[10px]",
                        row.idxChanges?.SP500==null?"text-gray-300":row.idxChanges.SP500>=0?"text-blue-600":"text-red-400")}>
                        {row.idxChanges?.SP500 != null ? fmtPct(row.idxChanges.SP500) : "—"}
                      </td>
                      <td className={cn("px-2 py-1.5 text-[10px]",
                        row.idxChanges?.TSX==null?"text-gray-300":row.idxChanges.TSX>=0?"text-green-600":"text-red-400")}>
                        {row.idxChanges?.TSX != null ? fmtPct(row.idxChanges.TSX) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 text-[10px]">✎</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[10px] text-gray-400 border-t">
            * % Change formula: (Market Value − Cash Deposited this year − Prior Year Market Value) ÷ Prior Year Market Value
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
