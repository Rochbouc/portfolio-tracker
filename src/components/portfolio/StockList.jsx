import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Pencil, Trash2, RefreshCw, TrendingUp, TrendingDown, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useMemo, useEffect } from "react"
import { fetchQuoteYTD } from "@/api/stockSearch"
import { ensureAnalystEstimate } from "@/api/analystEstimate"
import RangeBar from "./RangeBar"

// Same cache the watchlist uses for sector + analyst forecast — a stock
// looked up from either place only gets fetched once.
const EXT_INFO_CACHE_KEY = "watchlist_ext_info_cache_v3"
function loadExtInfoCache() { try { return JSON.parse(localStorage.getItem(EXT_INFO_CACHE_KEY) || "{}") } catch { return {} } }
function saveExtInfoCache(c) { localStorage.setItem(EXT_INFO_CACHE_KEY, JSON.stringify(c)) }

const YTD_CACHE_KEY = "holdings_ytd_cache_v1"
function loadYtdCache() { try { return JSON.parse(localStorage.getItem(YTD_CACHE_KEY) || "{}") } catch { return {} } }
function saveYtdCache(c) { localStorage.setItem(YTD_CACHE_KEY, JSON.stringify(c)) }

export default function StockList({ stocks = [], prices = {}, onEdit, onDelete, onRefreshPrices, refreshing }) {
  const [search, setSearch] = useState("")
  const [extInfo, setExtInfo] = useState(() => loadExtInfoCache())
  const [ytdMap, setYtdMap]   = useState(() => loadYtdCache())

  // Fetch sector/analyst-forecast + YTD for any held stock not already
  // cached, in small staggered batches (keeps proxy/Groq request volume
  // reasonable — most of this comes back cached after the first load).
  useEffect(() => {
    const symbols = [...new Set(stocks.map(s => s.symbol).filter(Boolean))]
    if (symbols.length === 0) return

    const needExt = symbols.filter(sym => extInfo[sym] === undefined)
    if (needExt.length > 0) {
      (async () => {
        const cache = loadExtInfoCache()
        for (let i = 0; i < needExt.length; i += 3) {
          const batch = needExt.slice(i, i + 3)
          const results = await Promise.allSettled(batch.map(async sym => {
            const stock = stocks.find(s => s.symbol === sym) || {}
            const q = prices[sym] || {}
            const est = await ensureAnalystEstimate(sym, stock.name || q.shortName || sym, q.price, q.fiftyTwoWeekLow, q.fiftyTwoWeekHigh, null, q.currency || stock.currency)
            if (!est) return [sym, null]
            return [sym, {
              sector: stock.sector || est.sector || null,
              targetLow: est.targetLow ?? null,
              targetHigh: est.targetHigh ?? null,
              numAnalysts: est.analysts ?? null,
            }]
          }))
          results.forEach(r => { if (r.status === "fulfilled") cache[r.value[0]] = r.value[1] || null })
          if (i + 3 < needExt.length) await new Promise(res => setTimeout(res, 400))
        }
        saveExtInfoCache(cache)
        setExtInfo(prev => ({ ...prev, ...cache }))
      })()
    }

    const needYtd = symbols.filter(sym => ytdMap[sym] === undefined)
    if (needYtd.length > 0) {
      (async () => {
        const cache = loadYtdCache()
        for (let i = 0; i < needYtd.length; i += 3) {
          const batch = needYtd.slice(i, i + 3)
          const results = await Promise.allSettled(batch.map(async sym => [sym, await fetchQuoteYTD(sym, stocks.find(s => s.symbol === sym) || {})]))
          results.forEach(r => { if (r.status === "fulfilled") cache[r.value[0]] = r.value[1] ?? null })
          if (i + 3 < needYtd.length) await new Promise(res => setTimeout(res, 400))
        }
        saveYtdCache(cache)
        setYtdMap(prev => ({ ...prev, ...cache }))
      })()
    }
  }, [stocks.map(s => s.symbol).sort().join(",")])

  const fmt = (n, currency = "USD") =>
    n == null ? "-" : new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(n)

  const filtered = useMemo(() => {
    if (!search.trim()) return stocks
    const q = search.toLowerCase()
    return stocks.filter(s =>
      s.symbol?.toLowerCase().includes(q) ||
      s.name?.toLowerCase().includes(q) ||
      s.account_type?.toLowerCase().includes(q) ||
      s.sector?.toLowerCase().includes(q)
    )
  }, [stocks, search])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Holdings</CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search holdings..."
              className="pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 w-44"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onRefreshPrices} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing..." : "Refresh Prices"}
          </Button>
        </div>
      </CardHeader>
      {search && (
        <div className="px-6 pb-2 text-xs text-gray-400">
          {filtered.length} of {stocks.length} holdings
        </div>
      )}
      <CardContent className="p-0">
        {filtered.length === 0 && stocks.length > 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No holdings match "{search}"</div>
        ) : stocks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No stocks yet. Click Add Stock to get started.</div>
        ) : (
          <div className="divide-y">
            {filtered.map(stock => {
              const q = prices[stock.symbol]
              const marketValue = q?.price ? q.price * stock.shares : stock.avg_cost * stock.shares
              const costBasis = stock.avg_cost * stock.shares
              const gain = marketValue - costBasis
              const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0
              const ext = extInfo[stock.symbol]
              const ytdPct = ytdMap[stock.symbol] ?? null
              const yieldPct = q?.trailingAnnualDividendYield != null ? q.trailingAnnualDividendYield * 100
                             : q?.divYield != null ? q.divYield * 100
                             : null
              return (
                <div key={stock.id} className="px-6 py-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
                      {stock.symbol.replace(".TO","").replace(".V","").slice(0,3)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm flex items-center gap-1.5 flex-wrap">
                        {stock.symbol}
                        {stock.currency === "CAD" && <Badge variant="outline" className="text-xs py-0 px-1">CAD</Badge>}
                        {yieldPct != null && yieldPct > 0 && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                            {yieldPct.toFixed(2)}% yield
                          </span>
                        )}
                        {ext?.sector && (
                          <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{ext.sector}</span>
                        )}
                        {ytdPct != null && (
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium border",
                            ytdPct >= 0 ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200")}>
                            {ytdPct >= 0 ? "+" : ""}{ytdPct.toFixed(1)}% YTD
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate max-w-40">{stock.name}</div>
                      <div className="text-xs text-muted-foreground">{stock.shares} sh @ {fmt(stock.avg_cost, stock.currency)}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <div className="font-semibold text-sm">{fmt(marketValue, stock.currency)}</div>
                    {q?.price ? (
                      <div className={cn("text-xs font-medium flex items-center justify-end gap-0.5", gain >= 0 ? "text-green-600" : "text-red-600")}>
                        {gain >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {fmt(gain, stock.currency)} ({gainPct.toFixed(1)}%)
                      </div>
                    ) : <div className="text-xs text-muted-foreground">No price</div>}
                    {q?.price && <div className="text-xs text-muted-foreground">{fmt(q.price, stock.currency)}/sh</div>}
                  </div>
                  <div className="flex gap-1 ml-3">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(stock)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(stock.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <RangeBar low={q?.fiftyTwoWeekLow ?? q?.week52Low} high={q?.fiftyTwoWeekHigh ?? q?.week52High} current={q?.price}
                  label="52-week range"
                  gradientClass="bg-gradient-to-r from-red-300 via-yellow-200 to-green-400"
                  markerClass="bg-blue-500" />
                <RangeBar low={ext?.targetLow} high={ext?.targetHigh} current={q?.price}
                  label={`12-month forecast${ext?.numAnalysts ? ` (${ext.numAnalysts} analysts)` : ""}`}
                  gradientClass="bg-gradient-to-r from-orange-200 via-blue-200 to-purple-300"
                  markerClass="bg-indigo-600" />
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}