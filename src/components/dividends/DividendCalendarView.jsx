import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Loader2, X } from "lucide-react"
import { getDividendDataBatch } from "@/api/dividendData"
import { StockLogoButton } from "@/components/ui/StockPopup"
import { cn } from "@/lib/utils"

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const DAY_NAMES   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

function toDateStr(d) { return d.toISOString().slice(0,10) }
function fmtAmt(n)    { return n > 0 ? "$"+Number(n).toFixed(2) : "" }

function getMonthGrid(year, month) {
  const grid = []
  const first = new Date(year, month, 1)
  const last  = new Date(year, month+1, 0)
  let cur = new Date(first)
  cur.setDate(cur.getDate() - cur.getDay())
  while (cur <= last || grid.length % 7 !== 0) {
    grid.push(new Date(cur))
    cur.setDate(cur.getDate()+1)
    if (grid.length > 42) break
  }
  return grid
}

function getWeekDays(baseDate) {
  const sun = new Date(baseDate)
  sun.setDate(sun.getDate() - sun.getDay())
  return Array.from({length:7},(_,i)=>{ const d=new Date(sun); d.setDate(d.getDate()+i); return d })
}

// Convert frequency to interval in days
function freqToDays(freq) {
  if (freq >= 50)  return 7          // weekly  (52/yr)
  if (freq >= 24)  return 14         // bi-weekly (26/yr)
  if (freq >= 11)  return 30         // monthly (12/yr)
  if (freq >= 5)   return 61         // bi-monthly (6/yr)
  if (freq >= 3)   return 91         // quarterly (4/yr)
  if (freq >= 1.5) return 182        // semi-annual (2/yr)
  return 365                         // annual
}

// Advance a date by N days
function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// For monthly/quarterly: advance by whole months to keep same day-of-month
function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate())
}

// Build events from actuals + projected
function buildSchedule(dividends, stocks, divDataBySymbol) {
  const events = []
  const now    = new Date()
  const cutoff = new Date(now.getFullYear(), now.getMonth() + 13, 1)

  // Actual recorded dividends
  dividends.forEach(d => {
    const stock = stocks.find(s => s.id === d.stock_id)
    if (!stock || !d.date) return
    events.push({ id:`a_${d.id}`, date:d.date, symbol:stock.symbol, name:stock.name||stock.symbol, amount:d.amount||0, type:"actual", stock })
  })

  // Projected future dividends
  Object.entries(divDataBySymbol).forEach(([symbol, data]) => {
    const stock = stocks.find(s => s.symbol === symbol)
    if (!stock || !data.annualTotal || data.annualTotal <= 0) return

    const freq      = data.frequency || 4
    const amtPer    = data.annualTotal / freq
    const isWeekly  = freq >= 50
    const dayStep   = freqToDays(freq)
    const moStep    = freq >= 11 ? 1 : freq >= 3 ? 3 : freq >= 1.5 ? 6 : 12

    // Use known payment day of month if available, otherwise derive from last actual
    const knownPayDay = data.payDay || null   // e.g. 8 = 8th of month
    const knownPayDow = data.payDow || null   // e.g. 5 = Friday

    // Find last actual payment date for this stock
    const lastDates  = dividends
      .filter(d => d.stock_id === stock.id && d.date)
      .map(d => new Date(d.date))
      .sort((a,b) => b - a)
    const lastActual = lastDates[0]

    // Determine the payment day to use
    const payDay = knownPayDay || (lastActual ? lastActual.getDate() : 15)

    let next
    if (lastActual) {
      if (isWeekly) {
        next = addDays(lastActual, dayStep)
        while (next <= now) next = addDays(next, dayStep)
      } else {
        // Advance month-by-month but use the known payDay
        next = new Date(lastActual.getFullYear(), lastActual.getMonth() + moStep, payDay)
        while (next <= now) next = new Date(next.getFullYear(), next.getMonth() + moStep, payDay)
      }
    } else if (isWeekly) {
      // Next Friday (or payDow day)
      const targetDow = knownPayDow || 5
      next = new Date(now)
      next.setDate(next.getDate() + ((targetDow - next.getDay() + 7) % 7 || 7))
    } else if (freq >= 11) {
      // Monthly: use known pay day
      next = new Date(now.getFullYear(), now.getMonth() + 1, payDay)
    } else {
      // Quarterly: use known pay day in correct quarter month
      const qm = [0,3,6,9]
      const nm = qm.find(m => m > now.getMonth())
      next = nm != null
        ? new Date(now.getFullYear(), nm, payDay)
        : new Date(now.getFullYear() + 1, 0, payDay)
    }

    let cur = new Date(next)
    let safety = 0
    while (cur < cutoff && safety < 500) {
      safety++
      const dateStr = toDateStr(cur)

      // For weekly: don't skip if there's an actual in the same week (just same month for others)
      const alreadyRecorded = events.some(e => {
        if (e.symbol !== symbol || e.type !== "actual") return false
        if (isWeekly) {
          // Same week (within 6 days)
          return Math.abs(new Date(e.date) - cur) < 7 * 86400000
        }
        return e.date.slice(0,7) === dateStr.slice(0,7)
      })

      if (!alreadyRecorded) {
        events.push({
          id:     `p_${symbol}_${dateStr}`,
          date:   dateStr,
          symbol,
          name:   stock.name || symbol,
          amount: amtPer,
          type:   "projected",
          stock,
        })
      }

      // Advance to next payment date
      if (isWeekly) {
        cur = addDays(cur, dayStep)
      } else {
        cur = new Date(cur.getFullYear(), cur.getMonth() + moStep, payDay)
      }
    }
  })

  return events.sort((a,b) => a.date.localeCompare(b.date))
}

// ── Day popup for overflow ────────────────────────────────────────
function DayPopup({ dateStr, events, onClose }) {
  const [,mo,dy] = dateStr.split("-")
  const label = new Date(dateStr).toLocaleDateString("en-CA",{weekday:"long",month:"long",day:"numeric"})
  const total  = events.reduce((s,e)=>s+e.amount,0)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <div>
            <div className="font-semibold text-gray-900">{label}</div>
            <div className="text-sm text-green-600 font-medium">{events.length} payments · ${total.toFixed(2)} total</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="divide-y">
          {events.map(e=>(
            <div key={e.id} className={cn("flex items-center justify-between px-4 py-3", e.type==="actual"?"bg-green-50/50":"")}>
              <div className="flex items-center gap-3">
                <StockLogoButton symbol={e.symbol} name={e.name} size={28} stock={e.stock} />
                <div>
                  <div className="font-semibold text-sm text-gray-900">{e.symbol}</div>
                  <div className="text-[11px] text-gray-400">{e.type === "actual" ? "✓ received" : "projected"}</div>
                </div>
              </div>
              <div className={cn("font-bold text-sm", e.type==="actual"?"text-green-700":"text-blue-600")}>
                {fmtAmt(e.amount)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Event chip (compact) ──────────────────────────────────────────
function EventChip({ e }) {
  return (
    <div className={cn("flex items-center gap-0.5 rounded px-0.5 py-0.5 overflow-hidden min-w-0",
      e.type==="actual" ? "bg-green-100" : "bg-blue-50")}>
      <StockLogoButton symbol={e.symbol} name={e.name} size={13} stock={e.stock} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="font-bold truncate text-gray-800 leading-tight" style={{fontSize:"8px"}}>{e.symbol}</div>
        {e.amount > 0 && (
          <div className={cn("font-semibold leading-tight truncate", e.type==="actual"?"text-green-700":"text-blue-600")} style={{fontSize:"8px"}}>
            {fmtAmt(e.amount)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function DividendCalendarView({ dividends=[], stocks=[] }) {
  const [viewMode,     setViewMode]    = useState("month")
  const [currentDate,  setCurrentDate] = useState(new Date())
  const [divData,      setDivData]     = useState({})
  const [loading,      setLoading]     = useState(false)
  const [popupDay,     setPopupDay]    = useState(null) // dateStr for popup

  async function loadDivData() {
    if (stocks.length === 0) return
    setLoading(true)
    try {
      const active = stocks.filter(s=>(s.shares||0)>0)
      const batch  = await getDividendDataBatch(active)
      const result = {}
      active.forEach(s => {
        const d = batch[s.id]
        if (d && d.annualTotal > 0) result[s.symbol] = d
      })
      setDivData(result)
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadDivData() }, [stocks.map(s=>s.id).sort().join(",")])

  const allEvents = useMemo(()=>buildSchedule(dividends,stocks,divData),[dividends,stocks,divData])

  const eventsByDate = useMemo(()=>{
    const map={}
    allEvents.forEach(e=>{ if(!map[e.date])map[e.date]=[]; map[e.date].push(e) })
    return map
  },[allEvents])

  function prev() {
    const d=new Date(currentDate)
    viewMode==="month" ? d.setMonth(d.getMonth()-1) : d.setDate(d.getDate()-7)
    setCurrentDate(d)
  }
  function next() {
    const d=new Date(currentDate)
    viewMode==="month" ? d.setMonth(d.getMonth()+1) : d.setDate(d.getDate()+7)
    setCurrentDate(d)
  }

  const today    = new Date()
  const todayStr = toDateStr(today)
  const year     = currentDate.getFullYear()
  const month    = currentDate.getMonth()
  const monthDays = getMonthGrid(year, month)
  const weekDays  = getWeekDays(currentDate)
  const viewDates = (viewMode==="month"?monthDays:weekDays).map(toDateStr)

  const viewTotal = viewDates.reduce((s,d)=>s+(eventsByDate[d]||[]).reduce((ss,e)=>ss+e.amount,0),0)

  const next12Total = allEvents
    .filter(e=>{ const d=new Date(e.date); return d>=today && d<=new Date(today.getFullYear(),today.getMonth()+12,1) })
    .reduce((s,e)=>s+e.amount,0)

  const headerLabel = viewMode==="month"
    ? `${MONTH_NAMES[month]} ${year}`
    : `${weekDays[0].toLocaleDateString("en-CA",{month:"short",day:"numeric"})} – ${weekDays[6].toLocaleDateString("en-CA",{month:"short",day:"numeric",year:"numeric"})}`

  const divCount = Object.keys(divData).length

  return (
    <>
    <Card className="bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-500" />
            Dividend Calendar
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
          </CardTitle>
          <div className="flex items-center gap-2">
            {next12Total > 0 && (
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1 font-medium">
                Next 12mo: ${next12Total.toFixed(2)}
              </span>
            )}
            <button onClick={loadDivData} disabled={loading} title="Refresh" className="text-gray-400 hover:text-gray-600 p-1 rounded">
              <RefreshCw className={cn("h-3.5 w-3.5", loading&&"animate-spin")} />
            </button>
            <div className="flex rounded border overflow-hidden text-xs">
              {["month","week"].map(m=>(
                <button key={m} onClick={()=>setViewMode(m)}
                  className={cn("px-2.5 py-1 font-medium capitalize transition-colors",
                    viewMode===m?"bg-gray-900 text-white":"bg-white text-gray-400 hover:bg-gray-100")}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Nav row */}
        <div className="flex items-center justify-between mt-1.5">
          <button onClick={prev} className="p-1 rounded hover:bg-gray-100"><ChevronLeft className="h-4 w-4 text-gray-500"/></button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">{headerLabel}</span>
            <button onClick={()=>setCurrentDate(new Date())} className="text-[10px] text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-50">Today</button>
          </div>
          <button onClick={next} className="p-1 rounded hover:bg-gray-100"><ChevronRight className="h-4 w-4 text-gray-500"/></button>
        </div>

        {viewTotal > 0 && (
          <div className="text-xs text-blue-700 text-center mt-0.5 font-medium">
            {viewMode==="month"?"This month":"This week"}: <strong>${viewTotal.toFixed(2)}</strong>
          </div>
        )}

        {!loading && divCount === 0 && stocks.length > 0 && (
          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-1">
            No dividend data yet — click ↻ to load. This takes a moment for the first load.
          </div>
        )}
        {!loading && divCount > 0 && (
          <div className="text-[10px] text-gray-400 mt-0.5">
            {divCount} dividend-paying stocks · click any day with payments to see full list
          </div>
        )}
      </CardHeader>

      <CardContent className="p-2">

        {/* ── MONTH VIEW ── */}
        {viewMode==="month" && (
          <div>
            <div className="grid grid-cols-7 mb-0.5">
              {DAY_NAMES.map(d=>(
                <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
              {monthDays.map((day,i)=>{
                const dStr   = toDateStr(day)
                const events = eventsByDate[dStr] || []
                const isCur  = day.getMonth()===month
                const isToday = dStr===todayStr
                const dayTotal = events.reduce((s,e)=>s+e.amount,0)
                const MAX_CHIPS = 3
                const shown  = events.slice(0, MAX_CHIPS)
                const hidden = events.length - MAX_CHIPS
                const hasEvents = events.length > 0
                return (
                  <div key={i}
                    onClick={()=>hasEvents&&setPopupDay(dStr)}
                    className={cn(
                      "bg-white p-0.5 relative flex flex-col",
                      "min-h-[80px]",
                      !isCur && "bg-gray-50/60",
                      isToday && "ring-2 ring-inset ring-blue-500 z-10",
                      hasEvents && "cursor-pointer hover:bg-blue-50/30 transition-colors"
                    )}>
                    {/* Day number */}
                    <div className={cn(
                      "w-5 h-5 flex items-center justify-center rounded-full text-[11px] font-semibold mb-0.5 mx-auto flex-shrink-0",
                      isToday?"bg-blue-600 text-white":isCur?"text-gray-700":"text-gray-300"
                    )}>
                      {day.getDate()}
                    </div>
                    {/* Day total */}
                    {dayTotal > 0 && (
                      <div className="text-center text-[9px] font-bold text-green-700 mb-0.5 flex-shrink-0">
                        ${dayTotal.toFixed(0)}
                      </div>
                    )}
                    {/* Event chips — show up to MAX_CHIPS */}
                    <div className="space-y-0.5 flex-1">
                      {shown.map(e=><EventChip key={e.id} e={e} />)}
                    </div>
                    {/* Overflow badge */}
                    {hidden > 0 && (
                      <div className="mt-0.5 text-center text-[9px] font-semibold text-blue-600 bg-blue-100 rounded px-1 py-0.5 flex-shrink-0">
                        +{hidden} more
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── WEEK VIEW ── */}
        {viewMode==="week" && (
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map((day,i)=>{
              const dStr   = toDateStr(day)
              const events = eventsByDate[dStr] || []
              const isToday = dStr===todayStr
              const dayTotal = events.reduce((s,e)=>s+e.amount,0)
              return (
                <div key={i} className={cn(
                  "rounded-xl border flex flex-col min-h-[140px]",
                  isToday?"border-blue-400 bg-blue-50/40":"border-gray-200 bg-white"
                )}>
                  {/* Day header */}
                  <div className={cn("text-center py-2 border-b flex-shrink-0",
                    isToday?"border-blue-200":"border-gray-100")}>
                    <div className="text-[10px] font-semibold text-gray-400 uppercase">{DAY_NAMES[i]}</div>
                    <div className={cn("w-7 h-7 mx-auto flex items-center justify-center rounded-full text-sm font-bold mt-0.5",
                      isToday?"bg-blue-600 text-white":"text-gray-700")}>{day.getDate()}</div>
                    {dayTotal > 0 && (
                      <div className="text-[11px] font-bold text-green-700 mt-0.5">${dayTotal.toFixed(2)}</div>
                    )}
                  </div>
                  {/* Events */}
                  <div className="p-1.5 space-y-1.5 flex-1 overflow-y-auto max-h-48">
                    {events.map(e=>(
                      <div key={e.id} className={cn(
                        "rounded-lg px-2 py-1.5 border",
                        e.type==="actual"?"bg-green-50 border-green-200":"bg-blue-50 border-blue-100"
                      )}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <StockLogoButton symbol={e.symbol} name={e.name} size={18} stock={e.stock} />
                          <span className="font-bold text-xs text-gray-900 truncate">{e.symbol}</span>
                        </div>
                        {e.amount > 0 && (
                          <div className={cn("text-xs font-bold", e.type==="actual"?"text-green-700":"text-blue-600")}>
                            {fmtAmt(e.amount)}
                          </div>
                        )}
                        <div className="text-[9px] text-gray-400 capitalize mt-0.5">{e.type}</div>
                      </div>
                    ))}
                    {events.length === 0 && (
                      <div className="text-[10px] text-gray-300 text-center pt-4">—</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 px-1">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <div className="w-3 h-3 rounded bg-green-100 border border-green-300"/>Actual received
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <div className="w-3 h-3 rounded bg-blue-50 border border-blue-200"/>Projected
          </div>
          <div className="text-[10px] text-gray-400">Month view: click any day to see all payments</div>
        </div>
      </CardContent>
    </Card>

    {/* Day detail popup */}
    {popupDay && (
      <DayPopup
        dateStr={popupDay}
        events={eventsByDate[popupDay]||[]}
        onClose={()=>setPopupDay(null)}
      />
    )}
    </>
  )
}
