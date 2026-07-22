import { useState, useMemo } from "react"
import { getRate } from "@/api/rateContext"
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

export default function AccountSummary({ stocks=[], transactions=[], dividends=[], prices={} }) {
  const USD_CAD = getRate()

  const [activeLines, setActiveLines] = useState(new Set(["Portfolio","Portfolio+Div","SP500","TSX"]))
  const currentYear = new Date().getFullYear()

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
  const histWithChange = PORTFOLIO_HISTORY.map((row, i, arr) => {
    const prev = arr[i-1]
    const changePct = prev && prev.marketValue > 0
      ? ((row.marketValue - row.cashDep - prev.marketValue) / prev.marketValue) * 100
      : null
    return { ...row, changePct }
  })

  // Prev year for live % calc
  const prevHistRow = PORTFOLIO_HISTORY[PORTFOLIO_HISTORY.length - 1]
  const livePct = prevHistRow && prevHistRow.marketValue > 0
    ? ((liveMarketCAD - currentYearContrib - prevHistRow.marketValue) / prevHistRow.marketValue) * 100
    : null

  // ── Performance chart data (all normalised to 100 at start) ──────
  const allYears = [...PORTFOLIO_HISTORY.map(r=>r.year), String(currentYear)]
  const base2018_SP500   = INDEX_HISTORY.find(r=>r.year==="2018")?.SP500  || 1
  const base2018_Dow     = INDEX_HISTORY.find(r=>r.year==="2018")?.Dow    || 1
  const base2018_NASDAQ  = INDEX_HISTORY.find(r=>r.year==="2018")?.NASDAQ || 1
  const base2018_TSX     = INDEX_HISTORY.find(r=>r.year==="2018")?.TSX    || 1
  const basePortfolio    = PORTFOLIO_HISTORY[0]?.marketValue || 1

  const chartData = useMemo(() => {
    const rows = [...PORTFOLIO_HISTORY, {
      year: String(currentYear),
      marketValue: liveMarketCAD,
      cashDep: currentYearContrib,
      actDiv: currentYearDivs,
      isLive: true,
    }]
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
  }, [liveMarketCAD, currentYearContrib, currentYearDivs])

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
          { label:"Market Value (CAD)",     value:fmt(liveMarketCAD),     icon:<TrendingUp  className="h-4 w-4 text-green-500"/>,  color:"text-green-700" },
          { label:"Total Gain/Loss",        value:`${liveGainCAD>=0?"+":""}${fmt(liveGainCAD)} (${pct(liveGainPct)})`,
            icon:liveGainCAD>=0?<TrendingUp className="h-4 w-4 text-green-500"/>:<TrendingDown className="h-4 w-4 text-red-500"/>,
            color:liveGainCAD>=0?"text-green-700":"text-red-600" },
          { label:"Total with Dividends",   value:`${liveGainWithDiv>=0?"+":""}${fmt(liveGainWithDiv)} (${pct(liveGainWithDivPct)})`,
            icon:<PiggyBank className="h-4 w-4 text-purple-500"/>, color:liveGainWithDiv>=0?"text-green-700":"text-red-600" },
        ].map(c=>(
          <Card key={c.label} className="bg-white p-4">
            <div className="flex items-center gap-2 mb-1">{c.icon}<span className="text-xs text-gray-500">{c.label}</span></div>
            <div className={cn("text-base font-bold", c.color)}>{c.value}</div>
          </Card>
        ))}
      </div>

      {/* Portfolio vs Market Index % Return */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm">Annual % Return — Portfolio vs Market Indices (excl. contributions)</CardTitle>
            <div className="flex flex-wrap gap-1.5">
              {INDICES.map(k=>(
                <button key={k} onClick={()=>toggleLine(k)}
                  className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium transition-all",
                    activeLines.has(k)?"text-white border-transparent":"text-gray-400 border-gray-200 bg-white")}
                  style={activeLines.has(k)?{background:COLORS[k]}:{}}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{top:4,right:8,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false}/>
              <XAxis dataKey="year" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} width={42}
                tickFormatter={v=>v+"%"}/>
              <Tooltip formatter={(v,name)=>[v!=null?v.toFixed(2)+"%":"—",name]}/>
              {[...activeLines].map(k=>(
                <Line key={k} type="monotone" dataKey={k}
                  stroke={COLORS[k]} strokeWidth={k.startsWith("Portfolio")?2.5:1.5}
                  strokeDasharray={k.startsWith("Portfolio")?"none":"4 2"}
                  dot={k.startsWith("Portfolio")?{r:3}:false} connectNulls/>
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="text-[10px] text-gray-400 mt-1 text-center">
            Portfolio % return = (Market Value − Cash Deposited − Prior Year Value) ÷ Prior Year Value · All values in CAD
          </div>
        </CardContent>
      </Card>

      {/* Portfolio History Table */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500"/> Portfolio History (CAD)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {["Year","Market Value","Cash Dep.","% Change*","Dividends","vs SP500","vs TSX"].map(h=>(
                    <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {histWithChange.map(row=>{
                  const idxRow = INDEX_HISTORY.find(r=>r.year===row.year)
                  const prevIdx = INDEX_HISTORY.find(r=>r.year===String(parseInt(row.year)-1))
                  const sp500Pct = idxRow&&prevIdx ? ((idxRow.SP500-prevIdx.SP500)/prevIdx.SP500*100) : null
                  const tsxPct  = idxRow&&prevIdx ? ((idxRow.TSX-prevIdx.TSX)/prevIdx.TSX*100)   : null
                  return (
                    <tr key={row.year} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-800">{row.year}</td>
                      <td className="px-3 py-2">{row.marketValue>0 ? fmt(row.marketValue) : "—"}</td>
                      <td className="px-3 py-2 text-gray-500">{row.cashDep>0 ? fmt(row.cashDep) : "—"}</td>
                      <td className={cn("px-3 py-2 font-medium",row.changePct==null?"":row.changePct>=0?"text-green-600":"text-red-500")}>
                        {row.changePct!=null ? pct(row.changePct) : "—"}
                      </td>
                      <td className="px-3 py-2 text-green-600">{row.actDiv>0 ? fmt(row.actDiv) : "—"}</td>
                      <td className={cn("px-3 py-2 text-xs",sp500Pct==null?"text-gray-300":sp500Pct>=0?"text-blue-600":"text-red-400")}>
                        {sp500Pct!=null ? pct(sp500Pct) : "—"}
                      </td>
                      <td className={cn("px-3 py-2 text-xs",tsxPct==null?"text-gray-300":tsxPct>=0?"text-red-600":"text-red-400")}>
                        {tsxPct!=null ? pct(tsxPct) : "—"}
                      </td>
                    </tr>
                  )
                })}
                {/* Live current year */}
                <tr className="bg-blue-50 font-semibold border-t-2 border-blue-200">
                  <td className="px-3 py-2 text-blue-700">
                    {currentYear}
                    <span className="ml-1.5 text-[10px] font-normal text-blue-400 bg-blue-100 px-1 py-0.5 rounded">live</span>
                  </td>
                  <td className="px-3 py-2 text-blue-700">{fmt(liveMarketCAD)}</td>
                  <td className="px-3 py-2 text-gray-500">{currentYearContrib>0 ? fmt(currentYearContrib) : "—"}</td>
                  <td className={cn("px-3 py-2",livePct==null?"":livePct>=0?"text-green-600":"text-red-500")}>
                    {livePct!=null ? pct(livePct) : "—"}
                  </td>
                  <td className="px-3 py-2 text-green-600">{currentYearDivs>0 ? fmt(currentYearDivs) : "—"}</td>
                  <td className="px-3 py-2 text-gray-400">—</td>
                  <td className="px-3 py-2 text-gray-400">—</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[10px] text-gray-400 border-t">
            * % Change excludes cash deposited that year · All values in CAD (USD converted at {USD_CAD})
          </div>
        </CardContent>
      </Card>

      {/* Dividend bar chart */}
      <Card className="bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Actual Dividends by Year (CAD)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={[
              ...PORTFOLIO_HISTORY.filter(r=>r.actDiv>0).map(r=>({year:r.year, amount:r.actDiv})),
              ...(currentYearDivs>0 ? [{year:String(currentYear)+" (live)", amount:currentYearDivs}] : [])
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
