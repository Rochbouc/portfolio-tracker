import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, Archive } from "lucide-react"
import { cn } from "@/lib/utils"

function fmt(n, currency = "USD") {
  if (n == null || isNaN(n)) return "—"
  return new Intl.NumberFormat("en-CA", {
    style: "currency", currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(n)
}

function pct(n) {
  if (n == null || isNaN(n)) return "—"
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%"
}

function PnLBadge({ value }) {
  const pos = value >= 0
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded",
      pos ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
    )}>
      {pos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {pos ? "+" : ""}{fmt(value)}
    </span>
  )
}

export default function ClosedPositions({ transactions = [], dividends = [], stocks = [] }) {
  const [expanded, setExpanded] = useState({})
  const [sortBy, setSortBy] = useState("closeDate") // closeDate | pnl | pnlWithDiv

  // ── Build closed positions ──────────────────────────────────────
  const closedPositions = useMemo(() => {
    // Group transactions by stock_id
    const byStock = {}
    transactions.forEach(t => {
      if (!byStock[t.stock_id]) byStock[t.stock_id] = []
      byStock[t.stock_id].push(t)
    })

    const positions = []

    Object.entries(byStock).forEach(([stockId, txns]) => {
      const stock = stocks.find(s => s.id === stockId)
      const symbol = txns[0]?.symbol || stock?.symbol || stockId
      const name = stock?.name || ""
      const currency = stock?.currency || txns[0]?.currency || "USD"
      const account = txns[0]?.account_type || stock?.account_type || ""

      // Sort by date ascending
      const sorted = [...txns].sort((a, b) => new Date(a.date) - new Date(b.date))

      // Walk through buys/sells to find fully-closed lots
      // We use FIFO: each sell depletes the oldest buy lots first
      const buyQueue = [] // { shares, price, date }
      const closedLots = []
      let lastSellDate = null

      sorted.forEach(t => {
        if (t.type === "buy") {
          buyQueue.push({ shares: t.shares, price: t.price, date: t.date })
        } else if (t.type === "sell") {
          let remainingToSell = t.shares
          lastSellDate = t.date

          while (remainingToSell > 0.00001 && buyQueue.length > 0) {
            const lot = buyQueue[0]
            const matched = Math.min(lot.shares, remainingToSell)

            closedLots.push({
              buyPrice:  lot.price,
              sellPrice: t.price,
              shares:    matched,
              buyDate:   lot.date,
              sellDate:  t.date,
              gainPerShare: t.price - lot.price,
            })

            lot.shares -= matched
            remainingToSell -= matched
            if (lot.shares < 0.00001) buyQueue.shift()
          }
        }
      })

      // Only include if we have closed lots (at least one full sell)
      if (closedLots.length === 0) return

      // Check if fully closed (no remaining buy shares)
      const remainingShares = buyQueue.reduce((s, l) => s + l.shares, 0)
      const isFullyClosed = remainingShares < 0.00001

      // Total cost basis and proceeds for closed lots
      const totalCost     = closedLots.reduce((s, l) => s + l.buyPrice  * l.shares, 0)
      const totalProceeds = closedLots.reduce((s, l) => s + l.sellPrice * l.shares, 0)
      const totalShares   = closedLots.reduce((s, l) => s + l.shares, 0)
      const pnl           = totalProceeds - totalCost
      const pnlPct        = totalCost > 0 ? (pnl / totalCost) * 100 : 0

      // Dividends for this stock (all time, since position is closed)
      const divTotal = dividends
        .filter(d => d.stock_id === stockId)
        .reduce((s, d) => s + (d.amount || 0), 0)

      const pnlWithDiv    = pnl + divTotal
      const pnlWithDivPct = totalCost > 0 ? (pnlWithDiv / totalCost) * 100 : 0

      const openDate  = closedLots[0]?.buyDate  || sorted[0]?.date
      const closeDate = lastSellDate || sorted[sorted.length - 1]?.date

      // Hold duration in days
      const holdDays = openDate && closeDate
        ? Math.round((new Date(closeDate) - new Date(openDate)) / 86400000)
        : null

      positions.push({
        stockId, symbol, name, currency, account,
        isFullyClosed,
        totalShares, totalCost, totalProceeds,
        pnl, pnlPct,
        divTotal, pnlWithDiv, pnlWithDivPct,
        openDate, closeDate, holdDays,
        closedLots,
        txns: sorted,
      })
    })

    // Sort
    return positions.sort((a, b) => {
      if (sortBy === "pnl")         return b.pnl - a.pnl
      if (sortBy === "pnlWithDiv")  return b.pnlWithDiv - a.pnlWithDiv
      // Default: most recent close first
      return new Date(b.closeDate) - new Date(a.closeDate)
    })
  }, [transactions, dividends, stocks, sortBy])

  // ── Summary stats ───────────────────────────────────────────────
  const summary = useMemo(() => {
    const full = closedPositions.filter(p => p.isFullyClosed)
    return {
      count:          full.length,
      totalPnl:       full.reduce((s, p) => s + p.pnl, 0),
      totalDivs:      full.reduce((s, p) => s + p.divTotal, 0),
      totalPnlWithDiv:full.reduce((s, p) => s + p.pnlWithDiv, 0),
      winners:        full.filter(p => p.pnl >= 0).length,
      losers:         full.filter(p => p.pnl < 0).length,
    }
  }, [closedPositions])

  if (closedPositions.length === 0) {
    return (
      <Card className="bg-white">
        <CardContent className="flex flex-col items-center justify-center py-14 text-center">
          <Archive className="h-10 w-10 text-gray-200 mb-3" />
          <p className="text-sm font-medium text-gray-500">No closed positions yet</p>
          <p className="text-xs text-gray-400 mt-1">Positions will appear here after you record a sell transaction.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Closed Positions", value: summary.count, sub: `${summary.winners}W / ${summary.losers}L`, numeric: false },
          { label: "Total P&L", value: fmt(summary.totalPnl), sub: summary.totalPnl >= 0 ? "profit" : "loss", pos: summary.totalPnl >= 0 },
          { label: "Dividends Received", value: fmt(summary.totalDivs), sub: "on closed stocks", pos: true },
          { label: "Total Return (with div)", value: fmt(summary.totalPnlWithDiv), sub: summary.totalPnlWithDiv >= 0 ? "total gain" : "total loss", pos: summary.totalPnlWithDiv >= 0 },
        ].map(c => (
          <Card key={c.label} className="bg-white p-3">
            <div className="text-xs text-gray-400">{c.label}</div>
            <div className={cn("text-lg font-bold mt-0.5",
              c.pos === undefined ? "text-gray-900" : c.pos ? "text-green-600" : "text-red-500")}>
              {c.value}
            </div>
            <div className="text-xs text-gray-400">{c.sub}</div>
          </Card>
        ))}
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>Sort by:</span>
        {[["closeDate","Close Date"],["pnl","P&L"],["pnlWithDiv","P&L + Dividends"]].map(([v, lbl]) => (
          <button key={v} onClick={() => setSortBy(v)}
            className={cn("px-2 py-0.5 rounded border transition-colors",
              sortBy === v ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-500 hover:border-gray-500")}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Position rows */}
      <Card className="bg-white overflow-hidden">
        <div className="divide-y">
          {closedPositions.map(pos => {
            const isExp = !!expanded[pos.stockId]
            return (
              <div key={pos.stockId}>
                {/* Main row */}
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left transition-colors"
                  onClick={() => setExpanded(p => ({ ...p, [pos.stockId]: !p[pos.stockId] }))}
                >
                  {/* Left: symbol + badges */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">{pos.symbol}</span>
                        {!pos.isFullyClosed && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300">
                            Partial
                          </Badge>
                        )}
                        {pos.account && (
                          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{pos.account}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {pos.openDate} → {pos.closeDate}
                        {pos.holdDays != null && <span className="ml-1">({pos.holdDays} days)</span>}
                      </div>
                    </div>
                  </div>

                  {/* Right: P&L columns */}
                  <div className="flex items-center gap-6 flex-shrink-0 ml-2">
                    {/* Without dividends */}
                    <div className="text-right hidden sm:block">
                      <div className="text-xs text-gray-400">P&L</div>
                      <div className={cn("text-sm font-semibold", pos.pnl >= 0 ? "text-green-600" : "text-red-500")}>
                        {pos.pnl >= 0 ? "+" : ""}{fmt(pos.pnl, pos.currency)}
                      </div>
                      <div className={cn("text-xs", pos.pnl >= 0 ? "text-green-500" : "text-red-400")}>
                        {pct(pos.pnlPct)}
                      </div>
                    </div>

                    {/* Dividends */}
                    <div className="text-right hidden sm:block">
                      <div className="text-xs text-gray-400">Dividends</div>
                      <div className="text-sm font-semibold text-blue-600">
                        {pos.divTotal > 0 ? "+" + fmt(pos.divTotal, pos.currency) : "—"}
                      </div>
                    </div>

                    {/* With dividends */}
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Total Return</div>
                      <div className={cn("text-sm font-bold", pos.pnlWithDiv >= 0 ? "text-green-600" : "text-red-500")}>
                        {pos.pnlWithDiv >= 0 ? "+" : ""}{fmt(pos.pnlWithDiv, pos.currency)}
                      </div>
                      <div className={cn("text-xs", pos.pnlWithDiv >= 0 ? "text-green-500" : "text-red-400")}>
                        {pct(pos.pnlWithDivPct)}
                      </div>
                    </div>

                    {isExp ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExp && (
                  <div className="bg-gray-50 border-t px-4 py-3 space-y-3">

                    {/* Mobile P&L summary */}
                    <div className="flex gap-4 sm:hidden text-sm">
                      <div>
                        <div className="text-xs text-gray-400">P&L</div>
                        <div className={cn("font-semibold", pos.pnl >= 0 ? "text-green-600" : "text-red-500")}>
                          {pos.pnl >= 0 ? "+" : ""}{fmt(pos.pnl, pos.currency)} ({pct(pos.pnlPct)})
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Dividends</div>
                        <div className="font-semibold text-blue-600">
                          {pos.divTotal > 0 ? "+" + fmt(pos.divTotal, pos.currency) : "—"}
                        </div>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 text-xs">
                      {[
                        { label: "Shares Sold",   value: pos.totalShares.toFixed(4).replace(/\.?0+$/, "") },
                        { label: "Cost Basis",     value: fmt(pos.totalCost, pos.currency) },
                        { label: "Proceeds",       value: fmt(pos.totalProceeds, pos.currency) },
                        { label: "Avg Buy Price",  value: fmt(pos.totalCost / pos.totalShares, pos.currency) },
                        { label: "Avg Sell Price", value: fmt(pos.totalProceeds / pos.totalShares, pos.currency) },
                      ].map(s => (
                        <div key={s.label} className="bg-white rounded px-2 py-1.5 border border-gray-100">
                          <div className="text-gray-400 text-[10px]">{s.label}</div>
                          <div className="font-semibold text-gray-800 mt-0.5">{s.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Closed lots table */}
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1.5">Trade History (FIFO)</div>
                      <div className="rounded border border-gray-200 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="text-left px-3 py-1.5 text-gray-500 font-medium">Bought</th>
                              <th className="text-left px-3 py-1.5 text-gray-500 font-medium">Sold</th>
                              <th className="text-right px-3 py-1.5 text-gray-500 font-medium">Shares</th>
                              <th className="text-right px-3 py-1.5 text-gray-500 font-medium">Buy $</th>
                              <th className="text-right px-3 py-1.5 text-gray-500 font-medium">Sell $</th>
                              <th className="text-right px-3 py-1.5 text-gray-500 font-medium">P&L</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-100">
                            {pos.closedLots.map((lot, i) => {
                              const lotPnl = lot.gainPerShare * lot.shares
                              return (
                                <tr key={i} className="hover:bg-gray-50">
                                  <td className="px-3 py-1.5 text-gray-500">{lot.buyDate}</td>
                                  <td className="px-3 py-1.5 text-gray-500">{lot.sellDate}</td>
                                  <td className="px-3 py-1.5 text-right">{lot.shares.toFixed(4).replace(/\.?0+$/, "")}</td>
                                  <td className="px-3 py-1.5 text-right">{fmt(lot.buyPrice, pos.currency)}</td>
                                  <td className="px-3 py-1.5 text-right">{fmt(lot.sellPrice, pos.currency)}</td>
                                  <td className={cn("px-3 py-1.5 text-right font-semibold", lotPnl >= 0 ? "text-green-600" : "text-red-500")}>
                                    {lotPnl >= 0 ? "+" : ""}{fmt(lotPnl, pos.currency)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Dividends detail */}
                    {pos.divTotal > 0 && (
                      <div className="text-xs bg-blue-50 border border-blue-100 rounded px-3 py-2">
                        <span className="font-medium text-blue-700">Dividends received: </span>
                        <span className="text-blue-600">{fmt(pos.divTotal, pos.currency)}</span>
                        <span className="text-blue-400 ml-1">
                          → Total return with dividends: {" "}
                          <span className={cn("font-bold", pos.pnlWithDiv >= 0 ? "text-green-600" : "text-red-500")}>
                            {pct(pos.pnlWithDivPct)}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
