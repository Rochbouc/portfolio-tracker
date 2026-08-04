import { useState, useMemo } from "react"
import { getRate } from "@/api/rateContext"
import { cloudSetValue } from "@/api/localData"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts"
import { TrendingUp, TrendingDown, DollarSign, PiggyBank } from "lucide-react"
import { cn } from "@/lib/utils"

// Exchange rate (approximate)

// Historical index data
const INDEX_HISTORY = [
  { year:"2017", SP500:2274.64, Dow:25100, NASDAQ:7077,   TSX:16347 },
  { year:"2018", SP500:2500,    Dow:22700, NASDAQ:6463,   TSX:14426 },
  { year:"2019", SP500:3200,    Dow:28950, NASDAQ:9100,   TSX:17066 },
  { year:"2020", SP500:3756,    Dow:30606, NASDAQ:12888,  TSX:17433 },
  { year:"2021", SP500:4766.18, Dow:36338, NASDAQ:15645,  TSX:21223 },
  { year:"2022", SP500:3839.50, Dow:33147, NASDAQ:10466,  TSX:19385 },
  { year:"2023", SP500:4743,    Dow:37743, NASDAQ:14782,  TSX:20906 },
  { year:"2024", SP500:5881.63, Dow:42544, NASDAQ:19311,  TSX:24728 },
  { year:"2025", SP500:6858.47, Dow:48382, NASDAQ:23236,  TSX:31883 },
]

// Historical portfolio data — market values in CAD
const PORTFOLIO_HISTORY = [
  { year:"2018", marketValue:0,          cashDep:0,        actDiv:2386.53 },
  { year:"2019", marketValue:0,          cashDep:0,        actDiv:170.27  },
  { year:"2020", marketValue:45651.78,   cashDep:11318.18, actDiv:553.80  },
  { year:"2021", marketValue:89033.34,   cashDep:3434.75,  actDiv:1463    },
  { year:"2022", marketValue:96778.07,   cashDep:3533.75,  actDiv:2956    },
  { year:"2023", marketValue:111304,     cashDep:3000,     actDiv:3325    },
  { year:"2024", marketValue:146150.65,  cashDep:8192,     actDiv:4712.83 },
  { year:"2025", marketValue:193424.97,  cashDep:8235,     actDiv:4677.58 },
]

function fmt(n, dec=0) {
  if (n == null || isNaN(n)) return "—"
  return new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:dec,minimumFractionDigits:dec}).format(n)
}
function pct(n) { return n==null ? "—" : (n>=0?"+":"")+Number(n).toFixed(2)+"%" }

const INDICES = ["Portfolio","Portfolio+Div","SP500","Dow","NASDAQ","TSX"]
const COLORS  = { Portfolio:"#1d4ed8", "Portfolio+Div":"#16a34a", SP500:"#3b82f6", Dow:"#f59e0b", NASDAQ:"#8b5cf6", TSX:"#ef4444" }

export default function AccountSummary({ stocks=[], transactions=[], dividends=[], prices={}, totalValue=null, totalDividendsReceived=null, estAnnualDividends=null }) {
  const USD_CAD = getRate()
  const currentYear = new Date().getFullYear()
  const YOY_STORAGE = "yoy_portfolio_history_v1"

  // Read history from shared YearOverYear localStorage — edits in YoY show here too
  const [historyRaw, setHistoryRaw] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(YOY_STORAGE) || "null")
      if (saved?.length) return saved
    } catch {}
    return PORTFOLIO_HISTORY.map(r => ({ ...r, year: parseInt(r.year) }))
  })

  // Editing state for inline edits
  const [editingRow, setEditingRow] = useState(null)
  const [editDraft,  setEditDraft]  = useState({})

  function startEdit(row) {
    setEditingRow(row.year)
    setEditDraft({ marketValue: row.marketValue, cashDep: row.cashDep, actDiv: row.actDiv })
  }
  function saveEdit(year) {
    const next = historyRaw.map(r => r.year === year
      ? { ...r, marketValue: parseFloat(editDraft.marketValue)||0, cashDep: parseFloat(editDraft.cashDep)||0, actDiv: parseFloat(editDraft.actDiv)||0 }
      : r
    )
    setHistoryRaw(next)
    localStorage.setItem(YOY_STORAGE, JSON.stringify(next))
    cloudSetValue(YOY_STORAGE, next)
    setEditingRow(null)
  }

  const [activeLines, setActiveLines] = useState(new Set(["Portfolio","Portfolio+Div","SP500","TSX"]))

  // ── Live portfolio value in CAD ──────────────────────────────────
  const liveMarketCAD = useMemo(() => stocks.reduce((s, st) => {
    const p   = prices[st.symbol]?.price ?? st.avg_cost
    const val = p * (st.shares || 0)
    return s + (st.currency === "USD" ? val * USD_CAD : val)
  }, 0), [stocks, prices])

  const liveInvestedCAD = useMemo(() => stocks.reduce((s, st) => {
    const val = (st.avg_cost || 0) * (st.shares || 0)
    return s + (st.currency === "USD" ? val * USD_CAD : val)
  }, 0), [stocks])

  const liveGainCAD    = liveMarketCAD - liveInvestedCAD
  const liveGainPct    = liveInvestedCAD > 0 ? (liveGainCAD / liveInvestedCAD) * 100 : 0
  const liveDivTotal   = dividends.reduce((s, d) => s + (d.amount || 0), 0)
  const liveGainWithDiv = liveGainCAD + liveDivTotal
  const liveGainWithDivPct = liveInvestedCAD > 0 ? (liveGainWithDiv / liveInvestedCAD) * 100 : 0

  // Current year contributions
  const currentYearContrib = transactions
    .filter(t => t.type==="buy" && new Date(t.date).getFullYear()===currentYear)
    .reduce((s, t) => {
      const stock = stocks.find(st => st.id === t.stock_id)
      const val = t.shares * t.price
      return s + (stock?.currency==="USD" ? val*USD_CAD : val)
    }, 0)

  // Current year dividends
  const currentYearDivs = dividends
    .filter(d => d.date?.slice(0,4) === String(currentYear))
    .reduce((s,d) => s+(d.amount||0), 0)

  // ── Historical % change (excl contributions) ─────────────────────
  // Always replace current year with live data
  const histBase = historyRaw.filter(r => String(r.year) !== String(currentYear))
  const prevHistRow = histBase[histBase.length - 1]

  const liveMV   = totalValue || liveMarketCAD
  const liveActD = totalDividendsReceived || dividends
    .filter(d => d.date?.slice(0,4) === String(currentYear))
    .reduce((s,d) => {
      const stock = stocks.find(st => st.id === d.stock_id)
      const cur = d.currency || stock?.currency || "CAD"
      return s + (cur==="USD" ? (d.amount||0)*USD_CAD : (d.amount||0))
    }, 0)

  const liveRow = liveMV > 0 ? {
    year: String(currentYear),
    marketValue: liveMV,
    cashDep: currentYearContrib,
    actDiv: liveActD,
    isLive: true,
  } : null

  const allHistory = [...histBase.map(r => ({...r, year: String(r.year)})), ...(liveRow ? [liveRow] : [])]

  const histWithChange = allHistory.map((row, i) => {
    const prev = allHistory[i-1]
    const changePct = prev && prev.marketValue > 0
      ? ((row.marketValue - (row.cashDep||0) - prev.marketValue) / prev.marketValue) * 100
      : null
    return { ...row, changePct }
  })

  // ── Performance chart data (all normalised to 100 at start) ──────
  const allYears = allHistory.map(r => String(r.year))
  const base2018_SP500   = INDEX_HISTORY.find(r=>r.year==="2018")?.SP500  || 1
  const base2018_Dow     = INDEX_HISTORY.find(r=>r.year==="2018")?.Dow    || 1
  const base2018_NASDAQ  = INDEX_HISTORY.find(r=>r.year==="2018")?.NASDAQ || 1
  const base2018_TSX     = INDEX_HISTORY.find(r=>r.year==="2018")?.TSX    || 1
  const basePortfolio    = allHistory[0]?.marketValue || 1

  const chartData = useMemo(() => {
    const rows = allHistory.filter(r => String(r.year) !== String(currentYear)).concat([{
      year: String(currentYear),
      marketValue: liveMV,
      cashDep: currentYearContrib,
      actDiv: liveActD,
      isLive: true,
    }])
    return rows.map((row, i, arr) => {
      const idxRow = INDEX_HISTORY.find(r=>r.year===row.year)
      const pt = { year: row.year + (row.isLive?" (live)":"") }
      if (row.marketValue > 0) {
        // Portfolio % return year over year excluding contributions
        const prev = arr[i-1]
        if (prev && prev.marketValue > 0) {
          pt["Portfolio"] = parseFloat((((row.marketValue - row.cashDep - prev.marketValue) / prev.marketValue)*100).toFixed(2))
          const prevWithDiv = prev.marketValue
          const curWithDiv  = row.marketValue + (row.actDiv||0)
          pt["Portfolio+Div"] = parseFloat((((curWithDiv - row.cashDep - prevWithDiv) / prevWithDiv)*100).toFixed(2))
        }
      }
      if (idxRow) {
        const prevIdx = INDEX_HISTORY.find(r=>r.year===String(parseInt(row.year)-1))
        if (prevIdx) {
          pt["SP500"]  = parseFloat(((idxRow.SP500  - prevIdx.SP500)  / prevIdx.SP500  * 100).toFixed(2))
          pt["Dow"]    = parseFloat(((idxRow.Dow    - prevIdx.Dow)    / prevIdx.Dow    * 100).toFixed(2))
          pt["NASDAQ"] = parseFloat(((idxRow.NASDAQ - prevIdx.NASDAQ) / prevIdx.NASDAQ * 100).toFixed(2))
          pt["TSX"]    = parseFloat(((idxRow.TSX    - prevIdx.TSX)    / prevIdx.TSX    * 100).toFixed(2))
        }
      }
      return pt
    })
  }, [historyRaw, liveMarketCAD, currentYearContrib, liveMV, liveActD])

  function toggleLine(k) {
    setActiveLines(prev => {
      const next = new Set(prev)
      if (next.has(k) && next.size > 1) next.delete(k)
      else next.add(k)
      return next
    })
  }

  return (
    <div className="space-y-5">

      {/* Summary cards — all in CAD */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:"Total Invested (CAD)",   value:fmt(liveInvestedCAD),   icon:<DollarSign className="h-4 w-4 text-blue-500"/>,   color:"text-blue-700" },
          { label:"Market Value (CAD)",     value:fmt(liveMV),     icon:<TrendingUp  className="h-4 w-4 text-green-500"/>,  color:"text-green-700" },
          { label:"Total Gain/Loss",        value:`${liveGainCAD>=0?"+":""}${fmt(liveGainCAD)} (${pct(liveGainPct)})`,
            icon:liveGainCAD>=0?<TrendingUp className="h-4 w-4 text-green-500"/>:<TrendingDown className="h-4 w-4 text-red-500"/>,
            color:liveGainCAD>=0?"text-green-700":"text-red-600" },
        ].map(c=>(
          <Card key={c.label} className="bg-white p-4">
            <div className="flex items-center gap-2 mb-1">{c.icon}<span className="text-xs text-gray-500">{c.label}</span></div>
            <div className={cn("text-base font-bold", c.color)}>{c.value}</div>
          </Card>
        ))}
      </div>

      {/* Dividend bar chart */}
      <Card className="bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Actual Dividends by Year (CAD)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={[
              ...allHistory.filter(r=>r.actDiv>0).map(r=>({year:String(r.year)+(r.isLive?' (live)':''), amount:r.actDiv}))
            ]} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false}/>
              <XAxis dataKey="year" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} width={50}
                tickFormatter={v=>v>=1000?`$${(v/1000).toFixed(0)}K`:`$${v}`}/>
              <Tooltip formatter={v=>[fmt(v),"Dividends"]}/>
              <Bar dataKey="amount" name="Dividends" fill="#10b981" radius={[3,3,0,0]} maxBarSize={40}/>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
