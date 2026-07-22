import { useState, useMemo } from "react"
import { getRate } from "@/api/rateContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts"
import { TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

const COLORS = { "Total Portfolio":"#3b82f6", RRSP:"#10b981", TFSA:"#f59e0b", Margin:"#8b5cf6" }

function fmtLarge(n) {
  if (n == null) return "-"
  if (Math.abs(n) >= 1e6) return "$" + (n/1e6).toFixed(2) + "M"
  if (Math.abs(n) >= 1e3) return "$" + (n/1e3).toFixed(0) + "K"
  return "$" + n.toFixed(0)
}

function fmtCur(n, cur) {
  return new Intl.NumberFormat("en-CA",{style:"currency",currency:cur||"CAD",maximumFractionDigits:0}).format(n||0)
}

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[160px]">
      <div className="font-semibold text-gray-600 mb-1.5">{label}</div>
      {payload.filter(p=>p.value!=null).map((p,i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{background:p.color}}/>
            <span className="text-gray-500">{p.name}</span>
          </div>
          <span className="font-semibold text-gray-900">{fmtLarge(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function PortfolioPerformanceChart({
  stocks = [], prices = {}, transactions = [], globalCurrency = "CAD",
  totalGain: passedGain, totalValue: passedValue, totalCost: passedCost
}) {
  const [range, setRange] = useState("ytd")
  const USD_CAD = getRate()
  const CAD_USD = 0.73

  function toDisplay(amount, cur) {
    if (!amount) return 0
    if (cur === globalCurrency) return amount
    if (globalCurrency === "CAD" && cur === "USD") return amount * USD_CAD
    if (globalCurrency === "USD" && cur === "CAD") return amount * CAD_USD
    return amount
  }

  const currentTotal = passedValue ?? 0
  const costBasis    = passedCost  ?? 0
  const totalGain    = passedGain  ?? (currentTotal - costBasis)
  const totalGainPct = costBasis > 0 ? (totalGain / costBasis) * 100 : 0

  // Get start-of-year value and contributions from transactions
  const { startValue, ytdContributions, chartData, accountNames } = useMemo(() => {
    const today = new Date()
    const yr    = today.getFullYear()

    // Determine date range
    let startDate
    if (range === "ytd")      { startDate = new Date(yr, 0, 1) }
    else if (range === "1y")  { startDate = new Date(today); startDate.setFullYear(today.getFullYear()-1) }
    else if (range === "2y")  { startDate = new Date(today); startDate.setFullYear(today.getFullYear()-2) }
    else if (range === "3y")  { startDate = new Date(today); startDate.setFullYear(today.getFullYear()-3) }
    else if (range === "5y")  { startDate = new Date(today); startDate.setFullYear(today.getFullYear()-5) }
    else                      { startDate = new Date("2018-01-01") }

    // Get unique accounts
    const accts = [...new Set(stocks.map(s => s.account_type).filter(Boolean))].sort()

    // Calculate current value per stock
    const stockValues = {}
    const stockAcct   = {}
    const stockCur    = {}
    stocks.forEach(s => {
      const p     = prices[s.symbol]?.price ?? s.current_price ?? s.avg_cost ?? 0
      const val   = toDisplay(p * (s.shares || 0), s.currency || "USD")
      stockValues[s.id] = val
      stockAcct[s.id]   = s.account_type || "Other"
      stockCur[s.id]    = s.currency || "USD"
    })

    // Build daily data points from transactions
    // We'll build monthly snapshots between startDate and today
    const months = []
    const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    while (cur <= today) {
      months.push(new Date(cur))
      cur.setMonth(cur.getMonth() + 1)
    }
    months.push(new Date(today))

    // For each month: compute portfolio value by tracking which shares were held
    // Simple approach: use current prices but adjust share counts based on transactions
    const txByStock = {}
    transactions.forEach(tx => {
      const sid = tx.stock_id
      if (!txByStock[sid]) txByStock[sid] = []
      txByStock[sid].push(tx)
    })

    // Compute shares held at each date
    function sharesAtDate(stockId, date) {
      const txs = txByStock[stockId] || []
      let shares = 0
      txs.forEach(tx => {
        if (new Date(tx.date) <= date) {
          if (tx.type === "buy")  shares += tx.shares || 0
          if (tx.type === "sell") shares -= tx.shares || 0
        }
      })
      return Math.max(0, shares)
    }

    // Contributions in range (buy transactions)
    let ytdContribs = 0
    transactions.forEach(tx => {
      const txDate = new Date(tx.date)
      if (txDate >= startDate && txDate <= today && tx.type === "buy") {
        const stock = stocks.find(s => s.id === tx.stock_id)
        ytdContribs += toDisplay(tx.price * tx.shares, stock?.currency || "USD")
      }
    })

    // Build chart points
    const points = []
    const interval = range === "ytd" || range === "1y" ? "week" : range === "2y" || range === "3y" ? "month" : "quarter"

    // Generate date points
    const datePts = []
    const d = new Date(startDate)
    while (d <= today) {
      datePts.push(new Date(d))
      if (interval === "week")    d.setDate(d.getDate() + 7)
      else if (interval === "month") d.setMonth(d.getMonth() + 1)
      else                        d.setMonth(d.getMonth() + 3)
    }
    datePts.push(new Date(today))

    datePts.forEach(dt => {
      let total = 0
      const acctVals = {}
      const isToday = dt >= today
      stocks.forEach(s => {
        const sh = sharesAtDate(s.id, dt)
        if (sh <= 0) return
        // Use live price only for today's point, avg_cost for historical
        // This shows actual invested cost over time, with today's market value at the end
        const p = isToday
          ? (prices[s.symbol]?.price ?? s.current_price ?? s.avg_cost ?? 0)
          : (s.avg_cost ?? 0)
        const val = toDisplay(p * sh, s.currency || "USD")
        total += val
        const acct = s.account_type || "Other"
        acctVals[acct] = (acctVals[acct] || 0) + val
      })

      const label = dt.toLocaleDateString("en-CA", {month:"short", day:"numeric", year: range==="all"||range==="5y"?"2-digit":undefined})
      const pt = { date: label, "Total Portfolio": Math.round(total) }
      accts.forEach(a => { pt[a] = Math.round(acctVals[a] || 0) })
      points.push(pt)
    })

    // Start value = first point
    const startVal = points[0]?.["Total Portfolio"] || 0

    return { startValue: startVal, ytdContributions: ytdContribs, chartData: points, accountNames: accts }
  }, [stocks, prices, transactions, range, globalCurrency])

  // YTD gain excluding contributions
  const gainExContrib = currentTotal - startValue - ytdContributions
  const gainExContribPct = startValue > 0 ? (gainExContrib / startValue) * 100 : 0

  const RANGES = [
    ["ytd","YTD"],["1y","1Y"],["2y","2Y"],["3y","3Y"],["5y","5Y"],["all","All"]
  ]

  return (
    <Card className="bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            Portfolio Performance
            <span className="text-xs font-normal text-gray-400">({globalCurrency})</span>
          </CardTitle>
          <div className="flex rounded border overflow-hidden text-xs">
            {RANGES.map(([v,label]) => (
              <button key={v} onClick={() => setRange(v)}
                className={cn("px-2 py-1 font-medium transition-colors",
                  range===v ? "bg-gray-900 text-white" : "bg-white text-gray-400 hover:bg-gray-100")}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-5 mt-1.5 flex-wrap">
          <div>
            <div className="text-xs text-gray-400">Current Value</div>
            <div className="text-sm font-bold text-gray-900">{fmtCur(currentTotal, globalCurrency)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Total Return (incl. contributions)</div>
            <div className={cn("text-sm font-bold", totalGain>=0?"text-green-600":"text-red-500")}>
              {totalGain>=0?"+":""}{fmtCur(totalGain, globalCurrency)} ({totalGainPct>=0?"+":""}{totalGainPct.toFixed(2)}%)
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400">
              {range==="ytd"?"YTD":"Period"} gain excl. contributions {ytdContributions > 0 ? `(−${fmtLarge(ytdContributions)} contrib)` : ""}
            </div>
            <div className={cn("text-sm font-bold", gainExContrib>=0?"text-green-600":"text-red-500")}>
              {gainExContrib>=0?"+":""}{fmtCur(gainExContrib, globalCurrency)} ({gainExContribPct>=0?"+":""}{gainExContribPct.toFixed(2)}%)
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 mt-2">
          {["Total Portfolio", ...accountNames].map((key,i) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-gray-600">
              <div className="w-3 h-1.5 rounded-sm" style={{background: COLORS[key] || "#6b7280"}}/>
              {key}
            </div>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pt-1">
        {chartData.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">Add transactions to see portfolio performance.</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{top:4,right:4,left:0,bottom:0}}>
              <defs>
                {["Total Portfolio",...accountNames].map((key,i) => (
                  <linearGradient key={key} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={COLORS[key]||"#6b7280"} stopOpacity={0.15}/>
                    <stop offset="95%" stopColor={COLORS[key]||"#6b7280"} stopOpacity={0.02}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false}/>
              <XAxis dataKey="date" tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
              <YAxis tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false} width={58} tickFormatter={fmtLarge}/>
              <Tooltip content={<CustomTooltip currency={globalCurrency}/>}/>
              <Area type="monotone" dataKey="Total Portfolio" stroke={COLORS["Total Portfolio"]} strokeWidth={2.5}
                fill="url(#grad-0)" dot={false}/>
              {accountNames.map((acct,i) => (
                <Area key={acct} type="monotone" dataKey={acct} stroke={COLORS[acct]||"#6b7280"}
                  strokeWidth={1.5} strokeDasharray="4 2" fill={`url(#grad-${i+1})`}
                  dot={false}/>
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
