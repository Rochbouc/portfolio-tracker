import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Loader2, RefreshCw } from "lucide-react"
import { Stock } from "@/api/localData"
import { getDividendDataBatch, getPaySchedule } from "@/api/dividendData"

export default function DividendCalendar({ stocks = [], dividends = [], globalCurrency = "CAD" }) {
  const USD_CAD = 1.37
  const convertAmt = (amount, currency) => {
    if (globalCurrency === "CAD" && currency === "USD") return amount * USD_CAD
    if (globalCurrency === "USD" && currency === "CAD") return amount / USD_CAD
    return amount
  }
  const [enriched, setEnriched] = useState([])
  const [loading,  setLoading]  = useState(false)
  const [status,   setStatus]   = useState("")
  const now = new Date()

  const enrich = async () => {
    if (stocks.length === 0) { setEnriched([]); return }
    setLoading(true)
    setStatus("Looking up dividend data...")
    try {
      const needFetch = stocks.filter(s =>
        !(parseFloat(s.annual_dividend) > 0) && !(parseFloat(s.dividend_yield) > 0)
      )
      setStatus(`Fetching data for ${needFetch.length} stock${needFetch.length !== 1 ? "s" : ""}...`)
      const fetched = needFetch.length > 0 ? await getDividendDataBatch(needFetch) : {}

      for (const [stockId, data] of Object.entries(fetched)) {
        if (data.annualTotal > 0 || data.yieldPct > 0) {
          await Stock.update(stockId, {
            annual_dividend: parseFloat(data.annualTotal.toFixed(4)),
            dividend_yield:  parseFloat(data.yieldPct.toFixed(4)),
          }).catch(() => {})
        }
      }

      const result = stocks.map(stock => {
        let annualTotal = parseFloat(stock.annual_dividend) || 0
        let yieldPct    = parseFloat(stock.dividend_yield)  || 0
        let frequency   = 4

        const fd = fetched[stock.id]
        if (fd) {
          annualTotal = fd.annualTotal || annualTotal
          yieldPct    = fd.yieldPct    || yieldPct
          frequency   = fd.frequency   || 4
        }

        // ALWAYS get payMonths/payDay from hardcoded table — never null because of cache
        const sched = getPaySchedule(stock.symbol)
        const payDay    = sched.payDay    || null
        const payMonths = sched.payMonths || null
        if (sched.frequency && frequency === 4) frequency = sched.frequency

        if (!annualTotal && yieldPct && stock.avg_cost > 0)
          annualTotal = (yieldPct / 100) * stock.avg_cost * stock.shares
        if (!yieldPct && annualTotal && stock.avg_cost > 0 && stock.shares > 0)
          yieldPct = (annualTotal / (stock.avg_cost * stock.shares)) * 100

        return { ...stock, _annualTotal: annualTotal, _yieldPct: yieldPct, _frequency: frequency, _payDay: payDay, _payMonths: payMonths }
      })

      setEnriched(result)
      const found = result.filter(s => s._annualTotal > 0).length
      setStatus(found > 0 ? `${found} dividend stocks found` : "")
    } catch (e) {
      setStatus("Error: " + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { enrich() }, [stocks.map(s => s.id).sort().join(",")])

  // Build projected payments using payMonths for correct month placement
  const projected = {}

  enriched.forEach(stock => {
    const annualTotal = stock._annualTotal
    if (!annualTotal || annualTotal <= 0) return

    const hist = dividends
      .filter(d => d.stock_id === stock.id && d.date)
      .map(d => new Date(d.date))
      .sort((a, b) => a - b)

    let freq = stock._frequency || 4
    // Detect frequency from actual history
    if (hist.length >= 2) {
      const diffs = []
      for (let i = 1; i < hist.length; i++)
        diffs.push((hist[i] - hist[i-1]) / 86400000)
      const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length
      if      (avg <= 10)  freq = 52
      else if (avg <= 20)  freq = 26
      else if (avg <= 35)  freq = 12
      else if (avg <= 95)  freq = 4
      else if (avg <= 200) freq = 2
      else                 freq = 1
    }

    const amtPer     = annualTotal / freq
    const isWeekly   = freq >= 50
    const isMonthly  = freq >= 11
    const moStep     = isMonthly ? 1 : freq >= 3 ? 3 : freq >= 1.5 ? 6 : 12
    const payDay     = stock._payDay    || (hist.length > 0 ? hist[hist.length-1].getDate() : 15)
    const payMonths  = stock._payMonths || null  // e.g. [1,4,7,10] for Jan/Apr/Jul/Oct
    const cutoff     = new Date(now.getFullYear(), now.getMonth() + 13, 1)

    const addToProjected = (date, amount) => {
      const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`
      if (!projected[key]) projected[key] = []
      projected[key].push({ symbol: stock.symbol, amount, currency: stock.currency || "USD" })
    }

    if (isWeekly) {
      // Weekly: advance 7 days at a time
      let next
      if (hist.length > 0) {
        next = new Date(hist[hist.length-1].getTime() + 7*86400000)
        while (next <= now) next = new Date(next.getTime() + 7*86400000)
      } else {
        next = new Date(now)
        next.setDate(next.getDate() + ((5 - next.getDay() + 7) % 7 || 7))
      }
      let cur = new Date(next), safety = 0
      while (cur < cutoff && safety < 600) {
        safety++
        addToProjected(cur, amtPer)
        cur = new Date(cur.getTime() + 7*86400000)
      }

    } else if (payMonths && hist.length === 0) {
      // Use known payment months — no history yet, place in correct months
      for (let offset = 0; offset <= 13; offset++) {
        const checkDate = new Date(now.getFullYear(), now.getMonth() + offset, payDay)
        if (checkDate < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3)) continue  // allow recent past payments
        if (checkDate >= cutoff) break
        const mo = checkDate.getMonth() + 1  // 1-12
        if (payMonths.includes(mo)) {
          addToProjected(checkDate, amtPer)
        }
      }

    } else {
      // Month-step: advance by moStep months
      let next
      if (hist.length > 0) {
        const last = hist[hist.length-1]
        next = new Date(last.getFullYear(), last.getMonth() + moStep, payDay)
        while (next <= now) next = new Date(next.getFullYear(), next.getMonth() + moStep, payDay)
      } else if (isMonthly) {
        // Start from THIS month if pay day hasn't passed yet, else next month
        const thisMonthPay = new Date(now.getFullYear(), now.getMonth(), payDay)
        next = thisMonthPay > now ? thisMonthPay : new Date(now.getFullYear(), now.getMonth() + 1, payDay)
      } else {
        // Fallback quarterly — but use payDay on the right quarter months
        const qm = [0, 3, 6, 9]
        const nm = qm.find(m => m > now.getMonth())
        next = nm != null
          ? new Date(now.getFullYear(), nm, payDay)
          : new Date(now.getFullYear() + 1, 0, payDay)
      }
      let cur = new Date(next), safety = 0
      while (cur < cutoff && safety < 200) {
        safety++
        addToProjected(cur, amtPer)
        cur = new Date(cur.getFullYear(), cur.getMonth() + moStep, payDay)
      }
    }
  })

  const sortedKeys = Object.keys(projected).sort()
  const total12m   = Object.values(projected).flat().reduce((s, p) => s + convertAmt(p.amount, p.currency||"USD"), 0)
  const divStocks  = enriched.filter(s => s._annualTotal > 0)

  const fmtAmt = n => (globalCurrency==="CAD"?"C$":"US$") + (n || 0).toFixed(2)
  const monthLabel = key => {
    const [y, m] = key.split("-")
    return new Date(parseInt(y), parseInt(m)-1, 1)
      .toLocaleString("default", { month: "long", year: "numeric" })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-green-600" />
            Dividend Calendar
          </CardTitle>
          <button onClick={enrich} disabled={loading}
            className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors" title="Refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        {status && (
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
            {loading && <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />}
            {status}
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {stocks.length === 0 ? (
          <div className="text-center py-5 text-gray-400 text-xs px-4">Add stocks to see projected dividend payments.</div>
        ) : loading && enriched.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-xs">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />Fetching dividend data...
          </div>
        ) : divStocks.length === 0 ? (
          <div className="text-center py-4 text-gray-400 text-xs px-4 space-y-1">
            <p>No dividend data found.</p>
            <button onClick={enrich} className="text-blue-500 hover:underline text-xs mt-1">Retry fetch</button>
          </div>
        ) : sortedKeys.length === 0 ? (
          <div className="text-center py-4 text-gray-400 text-xs px-4">No upcoming payments projected.</div>
        ) : (
          <>
            <div className="divide-y">
              {sortedKeys.map(key => {
                const payments   = projected[key]
                const monthTotal = payments.reduce((s, p) => s + convertAmt(p.amount, p.currency||"USD"), 0)
                const symbols    = [...new Set(payments.map(p => p.symbol))].join(", ")
                return (
                  <div key={key} className="px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-sm text-gray-800">{monthLabel(key)}</div>
                        <div className="text-xs text-gray-400 leading-relaxed">
                          {symbols} · {payments.length} payment{payments.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                      <div className="font-bold text-green-600 text-sm flex-shrink-0 ml-2">{fmtAmt(monthTotal)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="border-t px-4 py-3 bg-gray-50">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-700">Next 12 months</span>
                <span className="font-bold text-green-600 text-sm">{fmtAmt(total12m)}</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {divStocks.slice(0,8).map(s => `${s.symbol} ${(s._yieldPct||0).toFixed(2)}%`).join(" · ")}
                {divStocks.length > 8 ? ` · +${divStocks.length - 8} more` : ""}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
