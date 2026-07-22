import { useState, useMemo } from "react"
import { getRate } from "@/api/rateContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown } from "lucide-react"

const CAD_USD = 0.73
const THIS_YEAR = new Date().getFullYear()

function fmt(n, cur="CAD", decimals=0) {
  return new Intl.NumberFormat("en-CA", { style:"currency", currency:cur, maximumFractionDigits:decimals }).format(n||0)
}
function fmtPct(n) {
  const s = (n>=0?"+":"")+n.toFixed(2)+"%"
  return s
}
function toCAD(amt, cur) { return cur==="USD" ? amt * getRate() : amt }

export default function PositionSummary({ stocks=[], prices={}, dividends=[], globalCurrency="CAD", totalDividendsReceived=null }) {
  const USD_CAD = getRate()

  const [collapsed, setCollapsed] = useState({})
  const toggle = (acct) => setCollapsed(p=>({...p,[acct]:!p[acct]}))
  const displayCur = globalCurrency

  // Build dividend totals per stock per year (live + historical)
  const divByStockYear = useMemo(() => {
    const map = {}
    // Live dividends from localStorage
    dividends.forEach(d => {
      if (!d.date) return
      const yr  = d.date.slice(0,4)
      const sid = d.stock_id || "cash"
      const key = `${sid}|${yr}`
      const amt = toCAD(parseFloat(d.amount)||0, d.currency||"CAD")
      map[key]  = (map[key]||0) + amt
    })
    // Historical dividends from Dividend History tab
    // key format: "SYMBOL|ACCOUNT" -> {year: amount}
    try {
      const hist = JSON.parse(localStorage.getItem("historical_dividends_per_stock_v2") || "{}")
      Object.entries(hist).forEach(([symAcct, yearMap]) => {
        const [sym, acct] = symAcct.split("|")
        const stock = stocks.find(s => s.symbol === sym && s.account_type === acct)
        const cur = stock?.currency || "CAD"
        Object.entries(yearMap).forEach(([yr, amt]) => {
          const amtCAD = toCAD(parseFloat(amt)||0, cur)
          // Store by stock.id (for getStockData lookup)
          if (stock?.id) {
            const key = `${stock.id}|${yr}`
            map[key] = (map[key]||0) + amtCAD
          }
          // Also store by symAcct as fallback
          const key2 = `${symAcct}|${yr}`
          map[key2] = (map[key2]||0) + amtCAD
        })
      })
    } catch {}
    return map
  }, [dividends, stocks])

  // Get all years with dividend data (live + historical)
  const allYears = useMemo(() => {
    const yrs = new Set()
    dividends.forEach(d => { if (d.date) yrs.add(d.date.slice(0,4)) })
    yrs.add(String(THIS_YEAR))
    // Also include years from Dividend History tab
    try {
      const hist = JSON.parse(localStorage.getItem("historical_dividends_per_stock_v2") || "{}")
      Object.values(hist).forEach(yearMap => {
        Object.keys(yearMap).forEach(yr => yrs.add(String(yr)))
      })
    } catch {}
    return [...yrs].sort()
  }, [dividends])

  // Group stocks by account
  const byAcct = useMemo(() => {
    const map = {}
    stocks.forEach(s => {
      const acct = s.account_type || "Other"
      if (!map[acct]) map[acct] = []
      map[acct].push(s)
    })
    return map
  }, [stocks])

  function getStockData(s) {
    const cur        = s.currency || "USD"
    const livePrice  = prices[s.symbol]?.price ?? s.current_price ?? s.avg_cost ?? 0
    const shares     = s.shares || 0
    const avgCost    = s.avg_cost || 0
    const costBasis  = avgCost * shares
    const mktValue   = livePrice * shares
    const gainNative = mktValue - costBasis
    const gainPct    = costBasis>0 ? (gainNative/costBasis)*100 : 0

    // Convert to display currency
    const conv = (amt) => displayCur==="CAD" ? toCAD(amt,cur) : (cur==="CAD" ? amt*CAD_USD : amt)

    const costCAD    = conv(costBasis)
    const mktCAD     = conv(mktValue)
    const gainCAD    = conv(gainNative)

    // YTD price gain (Jan 1 to now)
    // We estimate YTD using dividend-adjusted: mkt - cost for current year
    // Best estimate: gain since Jan 1 of this year
    // (We don't have Jan 1 price stored, so show full gain for now, broken out by year via dividends)

    // Dividends per year
    const divPerYear = {}
    allYears.forEach(yr => {
      divPerYear[yr] = divByStockYear[`${s.id}|${yr}`] || 0
    })
    const totalDivCAD = Object.values(divPerYear).reduce((a,b)=>a+b,0)
    const ytdDivCAD   = divPerYear[String(THIS_YEAR)] || 0

    return { cur, shares, avgCost, livePrice, costBasis, mktValue, gainNative, gainPct,
             costCAD, mktCAD, gainCAD, divPerYear, totalDivCAD, ytdDivCAD, gainWithDiv: gainCAD+totalDivCAD, ytdGainWithDiv: gainCAD+ytdDivCAD }
  }

  const ACCT_COLORS = {
    RRSP:   { bg:"bg-blue-50",   header:"bg-blue-100",   text:"text-blue-800",   border:"border-blue-200" },
    TFSA:   { bg:"bg-green-50",  header:"bg-green-100",  text:"text-green-800",  border:"border-green-200" },
    Margin: { bg:"bg-amber-50",  header:"bg-amber-100",  text:"text-amber-800",  border:"border-amber-200" },
  }

  // Summary totals
  const grandTotals = useMemo(() => {
    let cost=0, mkt=0, gain=0, gainWDiv=0, ytdGain=0, ytdGainWDiv=0
    stocks.forEach(s => {
      const d = getStockData(s)
      cost     += d.costCAD
      mkt      += d.mktCAD
      gain     += d.gainCAD
      gainWDiv += d.gainWithDiv
      ytdGain  += d.gainCAD    // simplified — full gain shown
      ytdGainWDiv += d.ytdGainWithDiv
    })
    return { cost, mkt, gain, gainWDiv, ytdGain, ytdGainWDiv, gainPct:cost>0?(gain/cost)*100:0, gainWDivPct:cost>0?(gainWDiv/cost)*100:0 }
  }, [stocks, prices, dividends, displayCur])

  return (
    <div className="space-y-4">

      {/* Grand Summary Card */}
      <Card className="bg-gradient-to-r from-slate-800 to-slate-700 text-white border-0">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-6 items-center">
            <div>
              <div className="text-slate-400 text-xs">Total Invested</div>
              <div className="text-xl font-bold">{fmt(grandTotals.cost, displayCur)}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">Market Value</div>
              <div className="text-xl font-bold">{fmt(grandTotals.mkt, displayCur)}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">Total Return</div>
              <div className={cn("text-xl font-bold", grandTotals.gain>=0?"text-green-400":"text-red-400")}>
                {fmt(grandTotals.gain,displayCur)} ({fmtPct(grandTotals.gainPct)})
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">Total Return + Dividends</div>
              <div className={cn("text-xl font-bold", grandTotals.gainWDiv>=0?"text-green-300":"text-red-400")}>
                {fmt(grandTotals.gainWDiv,displayCur)} ({fmtPct(grandTotals.cost>0?grandTotals.gainWDiv/grandTotals.cost*100:0)})
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">{THIS_YEAR} Dividends Received</div>
              <div className="text-xl font-bold text-blue-300">
                {fmt(totalDividendsReceived ?? (grandTotals.ytdGainWDiv - grandTotals.ytdGain), displayCur)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-account tables */}
      {Object.keys(byAcct).sort().map(acct => {
        const cl   = ACCT_COLORS[acct] || ACCT_COLORS.Margin
        const acctStocks = byAcct[acct].filter(s=>s.shares>0)
        const isOpen = !collapsed[acct]

        // Account totals
        let acctCost=0, acctMkt=0, acctGain=0, acctGainWDiv=0
        acctStocks.forEach(s => {
          const d = getStockData(s)
          acctCost+=d.costCAD; acctMkt+=d.mktCAD; acctGain+=d.gainCAD; acctGainWDiv+=d.gainWithDiv
        })
        const acctGainPct     = acctCost>0?(acctGain/acctCost)*100:0
        const acctGainWDivPct = acctCost>0?(acctGainWDiv/acctCost)*100:0

        return (
          <Card key={acct} className={cn("border", cl.border)}>
            {/* Account Header */}
            <div className={cn("flex items-center justify-between px-4 py-3 cursor-pointer rounded-t-lg", cl.header)}
              onClick={() => toggle(acct)}>
              <div className="flex items-center gap-3">
                <span className={cn("font-bold text-sm", cl.text)}>{acct}</span>
                <span className="text-xs text-gray-500">{acctStocks.length} positions</span>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <div className="text-xs text-gray-500">Invested</div>
                  <div className="font-semibold text-gray-800">{fmt(acctCost,displayCur)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Market Value</div>
                  <div className="font-semibold text-gray-800">{fmt(acctMkt,displayCur)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Return</div>
                  <div className={cn("font-bold", acctGain>=0?"text-green-700":"text-red-600")}>
                    {fmt(acctGain,displayCur)} ({fmtPct(acctGainPct)})
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Return + Div</div>
                  <div className={cn("font-bold", acctGainWDiv>=0?"text-green-700":"text-red-600")}>
                    {fmt(acctGainWDiv,displayCur)} ({fmtPct(acctGainWDivPct)})
                  </div>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400"/> : <ChevronDown className="h-4 w-4 text-gray-400"/>}
              </div>
            </div>

            {/* Stock Table */}
            {isOpen && (
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs min-w-[900px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium sticky left-0 bg-gray-50">Symbol</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Name</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Shares</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Buy Price</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Live Price</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Cost Basis</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Mkt Value</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Return $</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Return %</th>
                      {allYears.map(yr => (
                        <th key={yr} className={cn("px-3 py-2 text-right font-medium", yr===String(THIS_YEAR)?"text-blue-600":"text-gray-500")}>
                          {yr} Div
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Total Div</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Ret+Div</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Ret+Div %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acctStocks
                      .sort((a,b)=>(b.shares*(prices[b.symbol]?.price??b.avg_cost))-(a.shares*(prices[a.symbol]?.price??a.avg_cost)))
                      .map(s => {
                        const d = getStockData(s)
                        const retWDivPct = d.costCAD>0?d.gainWithDiv/d.costCAD*100:0
                        return (
                          <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2 font-bold text-gray-900 sticky left-0 bg-white">
                              <div>{s.symbol}</div>
                              <div className="text-[10px] font-normal text-gray-400">{s.currency}</div>
                            </td>
                            <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate">{s.name}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{d.shares.toLocaleString("en-CA",{maximumFractionDigits:4})}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{fmt(d.avgCost,s.currency,2)}</td>
                            <td className="px-3 py-2 text-right text-gray-700 font-medium">{fmt(d.livePrice,s.currency,2)}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{fmt(d.costCAD,displayCur)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(d.mktCAD,displayCur)}</td>
                            <td className={cn("px-3 py-2 text-right font-semibold", d.gainCAD>=0?"text-green-600":"text-red-500")}>
                              {d.gainCAD>=0?"+":""}{fmt(d.gainCAD,displayCur)}
                            </td>
                            <td className={cn("px-3 py-2 text-right font-bold", d.gainPct>=0?"text-green-600":"text-red-500")}>
                              {fmtPct(d.gainPct)}
                            </td>
                            {allYears.map(yr => (
                              <td key={yr} className={cn("px-3 py-2 text-right", yr===String(THIS_YEAR)?"text-blue-600 font-medium":"text-gray-500")}>
                                {d.divPerYear[yr]>0 ? fmt(d.divPerYear[yr],displayCur) : "—"}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right text-blue-700 font-semibold">
                              {d.totalDivCAD>0?fmt(d.totalDivCAD,displayCur):"—"}
                            </td>
                            <td className={cn("px-3 py-2 text-right font-bold", d.gainWithDiv>=0?"text-green-700":"text-red-500")}>
                              {d.gainWithDiv>=0?"+":""}{fmt(d.gainWithDiv,displayCur)}
                            </td>
                            <td className={cn("px-3 py-2 text-right font-bold", retWDivPct>=0?"text-green-700":"text-red-500")}>
                              {fmtPct(retWDivPct)}
                            </td>
                          </tr>
                        )
                      })}
                    {/* Account subtotal row */}
                    <tr className={cn("font-bold border-t-2", cl.border, cl.bg)}>
                      <td className={cn("px-3 py-2 sticky left-0 font-bold", cl.text, cl.bg)} colSpan={5}>{acct} Total</td>
                      <td className="px-3 py-2 text-right">{fmt(acctCost,displayCur)}</td>
                      <td className="px-3 py-2 text-right">{fmt(acctMkt,displayCur)}</td>
                      <td className={cn("px-3 py-2 text-right", acctGain>=0?"text-green-700":"text-red-600")}>
                        {acctGain>=0?"+":""}{fmt(acctGain,displayCur)}
                      </td>
                      <td className={cn("px-3 py-2 text-right", acctGainPct>=0?"text-green-700":"text-red-600")}>
                        {fmtPct(acctGainPct)}
                      </td>
                      {allYears.map(yr => {
                        const yrTotal = acctStocks.reduce((sum,s)=>sum+(divByStockYear[`${s.id}|${yr}`]||0),0)
                        return <td key={yr} className="px-3 py-2 text-right text-blue-700">{yrTotal>0?fmt(yrTotal,displayCur):"—"}</td>
                      })}
                      <td className="px-3 py-2 text-right text-blue-700">
                        {fmt(acctStocks.reduce((s,st)=>s+getStockData(st).totalDivCAD,0),displayCur)}
                      </td>
                      <td className={cn("px-3 py-2 text-right", acctGainWDiv>=0?"text-green-700":"text-red-600")}>
                        {acctGainWDiv>=0?"+":""}{fmt(acctGainWDiv,displayCur)}
                      </td>
                      <td className={cn("px-3 py-2 text-right", acctGainWDivPct>=0?"text-green-700":"text-red-600")}>
                        {fmtPct(acctGainWDivPct)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}
