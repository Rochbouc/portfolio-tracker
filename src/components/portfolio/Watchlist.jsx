import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Eye, Trash2, RefreshCw, TrendingUp, TrendingDown, Bell, BellOff, X, BellRing } from "lucide-react"
import { fetchQuote, searchTickers } from "@/api/stockSearch"
import { useToast } from "@/components/ui/toast"
import { StockLogoButton } from "@/components/ui/StockPopup"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "watchlist_items"
const ALERTS_KEY  = "watchlist_alerts"
const FIRED_KEY   = "watchlist_alerts_fired"   // track which alerts have already notified

function load(key)    { try { return JSON.parse(localStorage.getItem(key) || "[]") } catch { return [] } }
function loadObj(key) { try { return JSON.parse(localStorage.getItem(key) || "{}") } catch { return {} } }
function save(key, d) { localStorage.setItem(key, JSON.stringify(d)) }

function fmt(n, cur = "USD") {
  if (n == null) return "—"
  return new Intl.NumberFormat("en-CA", { style:"currency", currency:cur, minimumFractionDigits:2, maximumFractionDigits:2 }).format(n)
}

// Play a subtle beep using Web Audio API
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.5)
  } catch {}
}

// Request browser notification permission
async function requestNotifPermission() {
  if (!("Notification" in window)) return false
  if (Notification.permission === "granted") return true
  const result = await Notification.requestPermission()
  return result === "granted"
}

// Fire a browser notification
function fireBrowserNotif(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return
  try {
    const n = new Notification(title, { body, icon: "/favicon.ico", badge: "/favicon.ico", tag: title })
    setTimeout(() => n.close(), 10000)
    n.onclick = () => { window.focus(); n.close() }
  } catch {}
}

export default function Watchlist() {
  const { toast } = useToast()
  const [items,    setItems]    = useState(() => load(STORAGE_KEY))
  const [alerts,   setAlerts]   = useState(() => load(ALERTS_KEY))
  const [fired,    setFired]    = useState(() => loadObj(FIRED_KEY))   // { alertId: true }
  const [quotes,   setQuotes]   = useState({})
  const [loading,  setLoading]  = useState(false)
  const [query,    setQuery]    = useState("")
  const [results,  setResults]  = useState([])
  const [searching,setSearching]= useState(false)
  const [alertForm,setAlertForm]= useState(null)
  const [notifPerm,setNotifPerm]= useState(() => "Notification" in window ? Notification.permission : "denied")
  const alertsRef = useRef(alerts)
  alertsRef.current = alerts

  function saveItems(list)  { save(STORAGE_KEY, list); setItems(list) }
  function saveAlerts(list) { save(ALERTS_KEY,  list); setAlerts(list) }
  function saveFired(obj)   { save(FIRED_KEY,   obj);  setFired(obj) }

  // ── Fetch prices + check alerts ─────────────────────────────────
  async function fetchAll(list = items, silentAlerts = false) {
    if (list.length === 0) return
    setLoading(true)
    try {
      const entries = await Promise.allSettled(list.map(async sym => {
        const q = await fetchQuote(sym, {})
        return [sym, q]
      }))
      const map = {}
      entries.forEach(r => { if (r.status === "fulfilled" && r.value[1]) map[r.value[0]] = r.value[1] })
      setQuotes(map)

      if (!silentAlerts) {
        // Check each alert
        const currentAlerts = alertsRef.current
        const currentFired  = loadObj(FIRED_KEY)
        const newFired = { ...currentFired }
        let anyNew = false

        currentAlerts.filter(a => a.active).forEach(a => {
          const q = map[a.symbol]
          if (!q?.price) return
          const hit = a.condition === "above" ? q.price >= a.targetPrice : q.price <= a.targetPrice
          if (hit && !currentFired[a.id]) {
            anyNew = true
            newFired[a.id] = { price: q.price, time: new Date().toISOString() }

            const direction = a.condition === "above" ? "↑ Above" : "↓ Below"
            const msg = `${a.symbol} is ${direction} $${a.targetPrice.toFixed(2)} — now at ${fmt(q.price, q.currency)}`

            // 1. In-app toast (persistent until dismissed)
            toast({
              title:       `🔔 Price Alert — ${a.symbol}`,
              description: msg,
              variant:     "alert",
              persistent:  true,
            })

            // 2. Sound
            playAlertSound()

            // 3. Browser notification (if permitted)
            fireBrowserNotif(`🔔 Price Alert — ${a.symbol}`, msg)
          }
          // Reset fired state if price moved back (so alert can fire again)
          if (!hit && currentFired[a.id]) {
            delete newFired[a.id]
            anyNew = true
          }
        })

        if (anyNew) saveFired(newFired)
      }
    } finally { setLoading(false) }
  }

  // Auto-refresh every 60s
  useEffect(() => {
    fetchAll(items, true)  // initial load — silent (don't re-fire old alerts)
    const id = setInterval(() => fetchAll(), 60000)
    return () => clearInterval(id)
  }, [])

  // Re-check when alerts change
  useEffect(() => { if (quotes && Object.keys(quotes).length > 0) fetchAll() }, [alerts.length])

  // ── Search ────────────────────────────────────────────────────
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try { setResults(await searchTickers(query)) }
      catch { setResults([]) }
      finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  function addSymbol(sym) {
    if (items.includes(sym)) return
    const next = [...items, sym]
    saveItems(next)
    setQuery(""); setResults([])
    fetchAll(next, true)
  }

  function removeSymbol(sym) {
    saveItems(items.filter(s => s !== sym))
    const newAlerts = alerts.filter(a => a.symbol !== sym)
    saveAlerts(newAlerts)
    setQuotes(q => { const n = {...q}; delete n[sym]; return n })
  }

  function addAlert(sym, condition, price) {
    const a = { id: Date.now().toString(), symbol:sym, condition, targetPrice:parseFloat(price), active:true, createdAt:new Date().toISOString() }
    saveAlerts([...alerts, a])
    setAlertForm(null)
    toast({ title:`Alert set for ${sym}`, description:`Notify when ${condition} $${parseFloat(price).toFixed(2)}`, variant:"success", duration:3000 })
  }

  function removeAlert(id) {
    saveAlerts(alerts.filter(a => a.id !== id))
    const newFired = {...fired}; delete newFired[id]; saveFired(newFired)
  }

  function toggleAlert(id) { saveAlerts(alerts.map(a => a.id === id ? {...a, active:!a.active} : a)) }

  async function handleRequestNotif() {
    const granted = await requestNotifPermission()
    setNotifPerm(granted ? "granted" : "denied")
    toast({ title: granted ? "Browser notifications enabled ✓" : "Notifications blocked", variant: granted ? "success" : "destructive", duration:3000 })
  }

  const triggeredAlerts = alerts.filter(a => fired[a.id])

  return (
    <Card className="bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4 text-blue-500" /> Watchlist
            {triggeredAlerts.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-semibold border border-yellow-300 animate-pulse">
                <BellRing className="h-3 w-3" /> {triggeredAlerts.length} alert{triggeredAlerts.length > 1 ? "s" : ""} hit!
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {notifPerm !== "granted" && (
              <button onClick={handleRequestNotif}
                className="flex items-center gap-1 text-[10px] text-blue-600 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50 transition-colors"
                title="Enable browser notifications for price alerts">
                <Bell className="h-3 w-3" /> Enable notifications
              </button>
            )}
            {notifPerm === "granted" && (
              <span className="flex items-center gap-1 text-[10px] text-green-600">
                <Bell className="h-3 w-3" /> Notifications on
              </span>
            )}
            <button onClick={() => fetchAll()} disabled={loading}
              className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Triggered alerts banner */}
        {triggeredAlerts.length > 0 && (
          <div className="mt-2 rounded-lg bg-yellow-50 border border-yellow-300 px-3 py-2">
            <div className="text-xs font-semibold text-yellow-800 mb-1 flex items-center gap-1.5">
              <BellRing className="h-3.5 w-3.5" /> Price Alert{triggeredAlerts.length > 1 ? "s" : ""} Triggered
            </div>
            {triggeredAlerts.map(a => (
              <div key={a.id} className="flex items-center justify-between text-xs text-yellow-800 py-0.5">
                <span>
                  <strong>{a.symbol}</strong> {a.condition === "above" ? "≥" : "≤"} ${a.targetPrice.toFixed(2)}
                  {fired[a.id]?.price && <span className="ml-1 text-yellow-600">→ now {fmt(fired[a.id].price, quotes[a.symbol]?.currency)}</span>}
                </span>
                <button onClick={() => removeAlert(a.id)} className="text-yellow-500 hover:text-red-500 ml-2">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative mt-2">
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Add stock — search ticker or name..."
            className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          {searching && <RefreshCw className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-gray-400" />}
          {results.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {results.map(r => (
                <button key={r.symbol} onClick={() => addSymbol(r.symbol)}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between gap-2 text-xs border-b border-gray-100 last:border-0">
                  <span className="font-semibold text-gray-900">{r.symbol}</span>
                  <span className="text-gray-500 truncate flex-1 mx-2">{r.name}</span>
                  <span className="text-gray-400 shrink-0">{r.exchange}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-gray-400">
            <Eye className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">No stocks on watchlist</p>
            <p className="text-[11px] text-gray-300 mt-0.5">Search above to add stocks to watch</p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map(sym => {
              const q        = quotes[sym]
              const chg      = q?.changePercent ?? null
              const pos      = chg != null && chg >= 0
              const symAlerts = alerts.filter(a => a.symbol === sym)
              const anyHit   = symAlerts.some(a => !!fired[a.id])

              return (
                <div key={sym} className={cn("px-3 py-2.5 hover:bg-gray-50 transition-colors",
                  anyHit && "bg-yellow-50 hover:bg-yellow-100")}>

                  {/* Main row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <StockLogoButton symbol={sym} name={q?.shortName || sym} size={32}
                        stock={{ symbol:sym, name:q?.shortName||sym, shares:0, avg_cost:q?.price||0, currency:q?.currency||"USD" }}
                        quote={q} />
                      <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-sm text-gray-900">{sym}</span>
                        {anyHit && <BellRing className="h-3.5 w-3.5 text-yellow-500 animate-pulse" />}
                        {symAlerts.length > 0 && !anyHit && <Bell className="h-3 w-3 text-gray-300" />}
                        {q?.shortName && <span className="text-[11px] text-gray-400 truncate max-w-[120px]">{q.shortName}</span>}
                      </div>

                      {/* Alert chips */}
                      {symAlerts.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {symAlerts.map(a => (
                            <div key={a.id} className={cn(
                              "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border",
                              fired[a.id]
                                ? "bg-yellow-100 border-yellow-300 text-yellow-800 font-semibold"
                                : a.active
                                ? "bg-blue-50 border-blue-200 text-blue-700"
                                : "bg-gray-100 border-gray-200 text-gray-400"
                            )}>
                              {fired[a.id] && "🔔 "}
                              {a.condition === "above" ? "≥" : "≤"} ${a.targetPrice.toFixed(2)}
                              <button onClick={() => toggleAlert(a.id)} className="opacity-60 hover:opacity-100 ml-0.5" title="Toggle">
                                {a.active ? "●" : "○"}
                              </button>
                              <button onClick={() => removeAlert(a.id)} className="opacity-50 hover:text-red-500">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    </div>

                    {/* Price */}
                    <div className="text-right shrink-0">
                      {q ? (
                        <>
                          <div className="font-semibold text-sm text-gray-900">{fmt(q.price, q.currency)}</div>
                          <div className={cn("text-xs font-medium flex items-center justify-end gap-0.5",
                            pos ? "text-green-600" : "text-red-500")}>
                            {pos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {pos ? "+" : ""}{chg.toFixed(2)}%
                          </div>
                        </>
                      ) : loading ? <div className="text-xs text-gray-400">…</div>
                        : <div className="text-xs text-gray-300">—</div>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      <button
                        onClick={() => setAlertForm(alertForm?.symbol === sym ? null : { symbol:sym, condition:"above", price:"" })}
                        className={cn("p-1 rounded hover:bg-gray-200 transition-colors",
                          symAlerts.length > 0 ? "text-blue-400 hover:text-blue-600" : "text-gray-300 hover:text-blue-500")}
                        title="Add price alert">
                        <Bell className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => removeSymbol(sym)}
                        className="p-1 rounded hover:bg-red-100 text-gray-300 hover:text-red-500 transition-colors"
                        title="Remove from watchlist">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Add-alert inline form */}
                  {alertForm?.symbol === sym && (
                    <div className="mt-2 flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg p-2">
                      <Bell className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                      <span className="text-[11px] text-blue-600 font-medium">Alert when</span>
                      <select value={alertForm.condition}
                        onChange={e => setAlertForm(f => ({...f, condition:e.target.value}))}
                        className="text-xs border border-blue-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                        <option value="above">price ≥</option>
                        <option value="below">price ≤</option>
                      </select>
                      <span className="text-xs text-gray-500">$</span>
                      <input type="number" step="0.01" placeholder={q?.price?.toFixed(2) || "0.00"}
                        value={alertForm.price}
                        onChange={e => setAlertForm(f => ({...f, price:e.target.value}))}
                        className="text-xs border border-blue-300 rounded px-2 py-1 bg-white w-20 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        onKeyDown={e => { if (e.key === "Enter" && alertForm.price) addAlert(sym, alertForm.condition, alertForm.price) }}
                      />
                      <Button size="sm" className="h-6 text-[11px] px-2"
                        onClick={() => addAlert(sym, alertForm.condition, alertForm.price)}
                        disabled={!alertForm.price}>Set</Button>
                      <button onClick={() => setAlertForm(null)} className="text-gray-400 hover:text-gray-600 ml-auto">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* 52-week range */}
                  {q?.fiftyTwoWeekLow != null && q?.fiftyTwoWeekHigh != null && (
                    <div className="mt-1.5">
                      <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                        <span>${q.fiftyTwoWeekLow.toFixed(2)}</span>
                        <span className="text-gray-400">52-week range</span>
                        <span>${q.fiftyTwoWeekHigh.toFixed(2)}</span>
                      </div>
                      <div className="relative h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-300 via-yellow-200 to-green-400 opacity-50" />
                        <div className="absolute top-0 bottom-0 w-1.5 bg-blue-500 rounded-full shadow-sm"
                          style={{ left: `calc(${Math.min(100, Math.max(0, ((q.price - q.fiftyTwoWeekLow) / (q.fiftyTwoWeekHigh - q.fiftyTwoWeekLow)) * 100))}% - 3px)` }} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
