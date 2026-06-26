import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from "recharts"
import { TrendingUp, RefreshCw, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const PROXIES = ["https://corsproxy.io/?", "https://api.allorigins.win/raw?url="]

async function fetchHistory(symbol, range = "1y") {
  const intMap  = { "1m":"1d","3m":"1d","6m":"1d","1y":"1wk","2y":"1wk","5y":"1mo" }
  const rangeMap = { "1m":"1mo","3m":"3mo","6m":"6mo","1y":"1y","2y":"2y","5y":"5y" }
  const interval = intMap[range] || "1wk"
  const r        = rangeMap[range] || "1y"
  for (const proxy of PROXIES) {
    try {
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${r}`
      const res = await fetch(`${proxy}${encodeURIComponent(url)}`, { headers: { Accept:"application/json" } })
      if (!res.ok) continue
      const data = await res.json()
      const result = data?.chart?.result?.[0]
      if (!result) continue
      const timestamps = result.timestamp || []
      const closes     = result.indicators?.quote?.[0]?.close || []
      return timestamps.map((t, i) => ({
        ts:    t,
        date:  new Date(t * 1000).toLocaleDateString("en-CA", { month:"short", day:"numeric", year:"2-digit" }),
        close: closes[i] != null ? parseFloat(closes[i].toFixed(2)) : null,
      })).filter(d => d.close !== null)
    } catch { /* try next */ }
  }
  return []
}

const COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316","#84cc16"]

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const items = payload.filter(p => p.value != null)
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[140px]">
      <div className="font-semibold text-gray-600 mb-1.5">{label}</div>
      {items.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
            <span className="text-gray-500 truncate max-w-[80px]">{p.name}</span>
          </div>
          <span className="font-semibold text-gray-900">${p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

export default function PortfolioPerformanceChart({ stocks = [], prices = {}, globalCurrency = "CAD", totalGain: passedGain, totalValue: passedValue, totalCost: passedCost }) {
  const [range, setRange]         = useState("1y")
  const [loading, setLoading]     = useState(false)
  const [histData, setHistData]   = useState({})
  const [error, setError]         = useState("")
  const [hiddenLines, setHiddenLines] = useState(new Set())
  const CAD_USD = 0.73
  const USD_CAD = 1.37

  function toDisplay(amount, stockCur) {
    if (!amount) return 0
    if (stockCur === globalCurrency) return amount
    if (globalCurrency === "USD" && stockCur === "CAD") return amount * CAD_USD
    if (globalCurrency === "CAD" && stockCur === "USD") return amount * USD_CAD
    return amount
  }

  const loadHistory = async () => {
    if (stocks.length === 0) return
    setLoading(true)
    setError("")
    try {
      const results = await Promise.all(
        stocks.map(async s => {
          const data = await fetchHistory(s.symbol, range)
          return [s.symbol, data]
        })
      )
      setHistData(Object.fromEntries(results))
    } catch (e) {
      setError("Could not load historical data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadHistory() }, [range, stocks.map(s => s.id).join(",")])

  const accountGroups = useMemo(() => {
    const groups = {}
    stocks.forEach(s => {
      const acct = s.account_type || "Unassigned"
      if (!groups[acct]) groups[acct] = []
      groups[acct].push(s)
    })
    return groups
  }, [stocks])

  const accountNames = Object.keys(accountGroups)
  const showAccounts = accountNames.length > 1

  // All line keys: Total + per-account
  const allLineKeys = useMemo(() => {
    const keys = ["Total Portfolio"]
    if (showAccounts) accountNames.forEach(a => keys.push(a))
    return keys
  }, [accountNames, showAccounts])

  const chartData = useMemo(() => {
    if (Object.keys(histData).length === 0) return []
    const allTimestamps = new Set()
    Object.values(histData).forEach(history => history.forEach(d => allTimestamps.add(d.ts)))
    const sortedTs = [...allTimestamps].sort((a, b) => a - b)
    return sortedTs.map(ts => {
      const dateLabel = new Date(ts * 1000).toLocaleDateString("en-CA", {
        month:"short", day:"numeric", year:"2-digit"
      })
      let total = 0
      const accountValues = {}
      stocks.forEach(stock => {
        const history = histData[stock.symbol] || []
        const entry   = history.filter(h => h.ts <= ts).slice(-1)[0]
        const price   = entry?.close ?? null
        if (price == null) return
        const value = toDisplay(price * stock.shares, stock.currency || "USD")
        total += value
        const acct = stock.account_type || "Unassigned"
        accountValues[acct] = (accountValues[acct] || 0) + value
      })
      return {
        date: dateLabel,
        "Total Portfolio": parseFloat(total.toFixed(0)),
        ...Object.fromEntries(Object.entries(accountValues).map(([k, v]) => [k, parseFloat(v.toFixed(0))])),
      }
    })
  }, [histData, globalCurrency, stocks])

  const currentTotal = passedValue ?? stocks.reduce((s, st) => {
    const p = prices[st.symbol]?.price ?? st.avg_cost
    return s + toDisplay(p * st.shares, st.currency || "USD")
  }, 0)
  const costBasis = passedCost ?? stocks.reduce((s, st) => s + toDisplay(st.avg_cost * st.shares, st.currency || "USD"), 0)
  // Use passed-in gain so it matches the Holdings header exactly
  const totalGain    = passedGain ?? (currentTotal - costBasis)
  const totalGainPct = costBasis > 0 ? (totalGain / costBasis) * 100 : 0

  const fmtLarge = n => {
    if (n == null) return "-"
    if (Math.abs(n) >= 1e6) return "$" + (n/1e6).toFixed(2) + "M"
    if (Math.abs(n) >= 1e3) return "$" + (n/1e3).toFixed(1) + "K"
    return "$" + n.toFixed(0)
  }

  const RANGES = [["1m","1M"],["3m","3M"],["6m","6M"],["1y","1Y"],["2y","2Y"],["5y","5Y"]]

  function toggleLine(key) {
    setHiddenLines(prev => {
      const next = new Set(prev)
      // Don't allow hiding all lines — keep at least one visible
      const wouldAllBeHidden = allLineKeys.every(k => k === key ? true : next.has(k))
      if (wouldAllBeHidden) return prev
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const lineColor = (key) => {
    if (key === "Total Portfolio") return COLORS[0]
    const idx = accountNames.indexOf(key)
    return COLORS[(idx + 1) % COLORS.length]
  }

  return (
    <Card className="bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            Portfolio Performance
            <span className="text-xs font-normal text-gray-400">({globalCurrency})</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex rounded border overflow-hidden text-xs">
              {RANGES.map(([v, label]) => (
                <button key={v} onClick={() => setRange(v)}
                  className={cn("px-2 py-1 font-medium transition-colors",
                    range===v ? "bg-gray-900 text-white" : "bg-white text-gray-400 hover:bg-gray-100")}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={loadHistory} disabled={loading}
              className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="flex gap-4 mt-1.5 flex-wrap items-end">
          <div>
            <div className="text-xs text-gray-400">Current Value</div>
            <div className="text-sm font-bold text-gray-900">
              {new Intl.NumberFormat("en-CA",{style:"currency",currency:globalCurrency,maximumFractionDigits:0}).format(currentTotal)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Total Return</div>
            <div className={cn("text-sm font-bold", totalGain >= 0 ? "text-green-600" : "text-red-500")}>
              {totalGain >= 0 ? "+" : ""}
              {new Intl.NumberFormat("en-CA",{style:"currency",currency:globalCurrency,maximumFractionDigits:0}).format(totalGain)}
              {" "}({totalGainPct >= 0 ? "+" : ""}{totalGainPct.toFixed(2)}%)
            </div>
          </div>
          {loading && (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading...
            </div>
          )}
        </div>

        {/* Clickable legend */}
        {allLineKeys.length > 1 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {allLineKeys.map(key => {
              const hidden = hiddenLines.has(key)
              return (
                <button
                  key={key}
                  onClick={() => toggleLine(key)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium transition-all",
                    hidden
                      ? "border-gray-200 text-gray-300 bg-white"
                      : "border-transparent text-gray-700 bg-gray-100 hover:bg-gray-200"
                  )}
                >
                  <span
                    className="inline-block w-3 h-1.5 rounded-sm flex-shrink-0"
                    style={{ background: hidden ? "#d1d5db" : lineColor(key) }}
                  />
                  {key}
                </button>
              )
            })}
            {hiddenLines.size > 0 && (
              <button
                onClick={() => setHiddenLines(new Set())}
                className="text-xs text-blue-500 hover:text-blue-700 px-1"
              >
                Show all
              </button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-1">
        {stocks.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            Add stocks to see portfolio performance.
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-400 text-sm">{error}</div>
        ) : chartData.length === 0 && loading ? (
          <div className="h-52 flex items-center justify-center text-gray-300 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top:4, right:4, left:0, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize:10, fill:"#9ca3af" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize:10, fill:"#9ca3af" }}
                axisLine={false}
                tickLine={false}
                width={52}
                tickFormatter={fmtLarge}
              />
              <Tooltip content={<CustomTooltip />} />
              {/* Total line */}
              {!hiddenLines.has("Total Portfolio") && (
                <Line
                  type="monotone"
                  dataKey="Total Portfolio"
                  stroke={COLORS[0]}
                  strokeWidth={2.5}
                  dot={false}
                  name="Total Portfolio"
                />
              )}
              {/* Per-account lines */}
              {showAccounts && accountNames.map((acct, i) =>
                hiddenLines.has(acct) ? null : (
                  <Line
                    key={acct}
                    type="monotone"
                    dataKey={acct}
                    stroke={COLORS[(i+1) % COLORS.length]}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    dot={false}
                    name={acct}
                  />
                )
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
