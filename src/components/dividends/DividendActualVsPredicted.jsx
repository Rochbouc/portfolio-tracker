import { useState, useEffect, useMemo, useRef } from "react"
import { getRate } from "@/api/rateContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, RefreshCw, TrendingUp } from "lucide-react"
import { Stock } from "@/api/localData"
import { getDividendDataBatch, getPaySchedule } from "@/api/dividendData"
import { cn } from "@/lib/utils"

function isCoveredCallOrMonthly(symbol, name) {
  const sym = (symbol || "").toUpperCase()
  const n   = (name   || "").toLowerCase()
  return (
    n.includes("covered") || n.includes("call") ||
    n.includes("yield")   || n.includes("income") || n.includes("distribution") ||
    ["JEPI","JEPQ","XYLD","QYLD","RYLD","DIVO","HDIV","HYLD","ZPAY",
     "XDIV","ZWC","ZWB","ZWA","ZWH","ZWU"].some(t => sym.includes(t))
  )
}

function buildProjected(enrichedStocks, dividends, globalCurrency = "CAD") {
  const now = new Date()
  const projected = {}
  const USD_CAD = getRate()
  const currentYear = now.getFullYear()

  enrichedStocks.forEach(stock => {
    let annualTotal = stock._annualTotal
    if (!annualTotal || annualTotal <= 0) return

    // Convert to display currency
    const cur = stock.currency || "CAD"
    if (globalCurrency === "CAD" && cur === "USD") annualTotal = annualTotal * USD_CAD
    if (globalCurrency === "USD" && cur === "CAD") annualTotal = annualTotal / USD_CAD

    const hist = dividends
      .filter(d => d.stock_id === stock.id && d.date)
      .map(d => new Date(d.date + "T12:00:00"))
      .sort((a, b) => a - b)

    let freq = stock._frequency || 4
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

    const amtPer    = annualTotal / freq
    const payMonths = stock._payMonths || null
    const payDay    = stock._payDay    || 15
    const isWeekly  = freq >= 50
    const isMonthly = freq >= 11
    const moStep    = isMonthly ? 1 : freq >= 3 ? 3 : freq >= 1.5 ? 6 : 12

    // Generate for full current year (Jan-Dec) plus a few months ahead
    const yearStart = new Date(currentYear, 0, 1)
    const cutoff    = new Date(currentYear, 12, 1)  // end of current year

    const addKey = (date) => {
      if (date.getFullYear() !== currentYear) return
      const key = `${currentYear}-${String(date.getMonth()+1).padStart(2,"0")}`
      projected[key] = (projected[key] || 0) + amtPer
    }

    if (payMonths) {
      // Known pay months — add all occurrences in current year
      payMonths.forEach(mo => {
        addKey(new Date(currentYear, mo - 1, payDay))
      })
    } else if (isWeekly) {
      // Weekly — every 7 days through the year
      let cur = new Date(currentYear, 0, 7), safety = 0
      while (cur < cutoff && safety < 600) {
        addKey(cur)
        cur = new Date(cur.getTime() + 7 * 86400000)
        safety++
      }
    } else {
      // Month-step: spread evenly through the year based on freq
      // Start from Jan and add every moStep months
      for (let mo = moStep - 1; mo < 12; mo += moStep) {
        addKey(new Date(currentYear, mo, payDay))
      }
    }
  })
  return projected
}


// Load Chart.js once, return promise
let chartJsPromise = null
function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart)
  if (chartJsPromise) return chartJsPromise
  chartJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"
    script.onload  = () => resolve(window.Chart)
    script.onerror = reject
    document.head.appendChild(script)
  })
  return chartJsPromise
}

export default function DividendActualVsPredicted({ stocks = [], dividends = [], globalCurrency = "CAD" }) {
  const [enrichedStocks, setEnrichedStocks] = useState([])
  const [loading, setLoading]               = useState(false)
  const [viewMode, setViewMode]             = useState("12mo")
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)
  const now             = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`

  const enrich = async () => {
    if (stocks.length === 0) { setEnrichedStocks([]); return }
    setLoading(true)
    try {
      const needFetch = stocks.filter(s =>
        !(parseFloat(s.annual_dividend) > 0) && !(parseFloat(s.dividend_yield) > 0)
      )
      const fetched = needFetch.length > 0 ? await getDividendDataBatch(needFetch) : {}
      for (const [id, data] of Object.entries(fetched)) {
        if (data.annualTotal > 0 || data.yieldPct > 0) {
          await Stock.update(id, {
            annual_dividend: parseFloat((data.annualRatePerShare || 0).toFixed(6)),
            dividend_yield:  parseFloat((data.yieldPct   || 0).toFixed(4)),
          }).catch(() => {})
        }
      }
      const result = stocks.map(stock => {
        let annualTotal = (parseFloat(stock.annual_dividend) || 0) * (stock.shares || 0)
        let yieldPct    = parseFloat(stock.dividend_yield)  || 0
        let frequency   = 4
        const fd = fetched[stock.id]
        if (fd) {
          if (fd.annualTotal > 0) annualTotal = fd.annualTotal
          if (fd.yieldPct    > 0) yieldPct    = fd.yieldPct
          if (fd.frequency      ) frequency   = fd.frequency
        }
        if (!annualTotal && yieldPct && stock.avg_cost > 0 && stock.shares > 0)
          annualTotal = (yieldPct / 100) * stock.avg_cost * stock.shares
        if (!yieldPct && annualTotal && stock.avg_cost > 0 && stock.shares > 0)
          yieldPct = (annualTotal / (stock.avg_cost * stock.shares)) * 100
        return { ...stock, _annualTotal: annualTotal, _yieldPct: yieldPct, _frequency: frequency,
          _payDay:    fd?.payDay    ?? getPaySchedule(stock.symbol).payDay,
          _payMonths: fd?.payMonths ?? getPaySchedule(stock.symbol).payMonths,
        }
      })
      setEnrichedStocks(result)
    } catch (e) {
      console.error("enrich error:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { enrich() }, [stocks.map(s => s.id).sort().join(",")])

  const projectedByMonth = useMemo(
    () => buildProjected(enrichedStocks, dividends, globalCurrency),
    [enrichedStocks, dividends, globalCurrency]
  )

  const actualByMonth = useMemo(() => {
    const map = {}
    const USD_CAD = getRate()
    dividends.forEach(d => {
      if (!d.date) return
      const key = d.date.slice(0,7)  // "2026-01"
      const stock = stocks.find(s => s.id === d.stock_id)
      const cur = d.currency || stock?.currency || "CAD"
      const converted = (globalCurrency === "CAD" && cur === "USD") ? (d.amount||0) * USD_CAD
        : (globalCurrency === "USD" && cur === "CAD") ? (d.amount||0) / USD_CAD
        : (d.amount||0)
      if (key) map[key] = (map[key] || 0) + converted
    })
    return map
  }, [dividends, globalCurrency, stocks])

  // Build one entry per month, no duplicates
  const { labels, actualData, predictedData, todayIdx } = useMemo(() => {
    const keys = []
    if (viewMode === "all") {
      const allKeys = new Set([...Object.keys(actualByMonth), ...Object.keys(projectedByMonth)])
      if (allKeys.size === 0) return { labels: [], actualData: [], predictedData: [], todayIdx: -1 }
      const sorted = [...allKeys].sort()
      const [sy, sm] = sorted[0].split("-").map(Number)
      const end = new Date(now.getFullYear(), now.getMonth() + 13, 1)
      let cur = new Date(sy, sm - 1, 1)
      while (cur <= end) {
        keys.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}`)
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      }
    } else {
      // Show only current year Jan-Dec (12 months)
      const yr = now.getFullYear()
      for (let i = 0; i < 12; i++) {
        keys.push(`${yr}-${String(i+1).padStart(2,"0")}`)
      }
    }

    const lbls = keys.map(key => {
      const [y, m] = key.split("-").map(Number)
      // Format as "Jan 25" using a fixed locale-independent approach
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
      return `${monthNames[m-1]} ${String(y).slice(-2)}`
    })

    return {
      labels:        lbls,
      actualData:    keys.map(k => actualByMonth[k]    ? parseFloat(actualByMonth[k].toFixed(2))    : 0),
      predictedData: keys.map(k => projectedByMonth[k] ? parseFloat(projectedByMonth[k].toFixed(2)) : 0),
      todayIdx:      keys.indexOf(currentMonthKey),
    }
  }, [viewMode, actualByMonth, projectedByMonth, currentMonthKey])

  // Draw / redraw chart whenever data changes
  useEffect(() => {
    if (!canvasRef.current) return
    if (labels.length === 0) return

    loadChartJs().then(Chart => {
      // Always destroy previous instance before creating new one
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }

      const annotations = {}
      if (todayIdx >= 0) {
        annotations.todayLine = {
          type: "line",
          xMin: todayIdx - 0.5,
          xMax: todayIdx - 0.5,
          borderColor: "#d1d5db",
          borderWidth: 1,
          borderDash: [4, 3],
        }
      }

      chartRef.current = new Chart(canvasRef.current, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Actual Received",
              data: actualData,
              backgroundColor: "#1d6fa4",
              borderRadius: { topLeft: 3, topRight: 0, bottomLeft: 0, bottomRight: 0 },
              borderSkipped: false,
              categoryPercentage: 1.0,
              barPercentage: 1.0,
            },
            {
              label: "Predicted",
              data: predictedData,
              backgroundColor: "#f97316",
              borderRadius: { topLeft: 0, topRight: 3, bottomLeft: 0, bottomRight: 0 },
              borderSkipped: false,
              categoryPercentage: 1.0,
              barPercentage: 1.0,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: "bottom",
              labels: { font: { size: 11 }, boxWidth: 12, padding: 12 }
            },
            tooltip: {
              callbacks: {
                label: ctx => `${ctx.dataset.label}: $${(ctx.parsed.y || 0).toFixed(2)}`
              }
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                font: { size: 10 },
                color: "#9ca3af",
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 12,
              }
            },
            y: {
              grid: { color: "#f3f4f6" },
              border: { display: false },
              ticks: {
                font: { size: 10 },
                color: "#9ca3af",
                callback: v => v === 0 ? "$0" : v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v}`
              }
            }
          }
        }
      })
    })

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [labels, actualData, predictedData, todayIdx])

  const totalActualYTD = Object.entries(actualByMonth)
    .filter(([k]) => k.startsWith(String(now.getFullYear())) && k <= currentMonthKey)
    .reduce((s, [, v]) => s + v, 0)
  const totalPredicted12m = Object.values(projectedByMonth).reduce((s, v) => s + v, 0)
  const hasDivData = enrichedStocks.some(s => (s._annualTotal || 0) > 0)
  const isEmpty    = labels.length === 0 || (actualData.every(v => v === 0) && predictedData.every(v => v === 0))

  return (
    <Card className="bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Actual vs Predicted Dividends
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex rounded border overflow-hidden text-xs">
              {[["12mo","12 Months (This Year)"],["all","All Time"]].map(([v, lbl]) => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={cn("px-2.5 py-1 font-medium transition-colors",
                    viewMode===v ? "bg-gray-900 text-white" : "bg-white text-gray-400 hover:bg-gray-100")}>
                  {lbl}
                </button>
              ))}
            </div>
            <button onClick={enrich} disabled={loading}
              className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors" title="Refresh">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        <div className="flex gap-4 mt-1.5 flex-wrap items-center">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{background:"#1d6fa4"}} />
            <span className="text-xs text-gray-500">Actual</span>
            <span className="text-xs font-semibold text-gray-800">${totalActualYTD.toFixed(2)} YTD</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{background:"#f97316"}} />
            <span className="text-xs text-gray-500">Projected</span>
            <span className="text-xs font-semibold text-gray-800">${totalPredicted12m.toFixed(2)} next 12mo</span>
          </div>
          {loading && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading...
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        {isEmpty ? (
          <div className="text-center py-10 text-gray-400 text-sm space-y-2">
            {loading
              ? <><Loader2 className="h-5 w-5 animate-spin mx-auto" /><p>Loading...</p></>
              : !hasDivData
              ? <p>No dividend-paying stocks found.<br/>Add stocks with dividend yield to see projections.</p>
              : <p>No dividend data in this date range.</p>
            }
          </div>
        ) : (
          <div style={{ position: "relative", width: "100%", height: "240px" }}>
            <canvas ref={canvasRef} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
