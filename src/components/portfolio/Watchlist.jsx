import { useState, useEffect, useRef, useMemo } from "react"
import { getRate } from "@/api/rateContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Eye, Trash2, RefreshCw, TrendingUp, TrendingDown, Bell, BellOff, X, BellRing, Plus, Pencil, StickyNote, Check } from "lucide-react"
import { searchTickers } from "@/api/stockSearch"
import { cloudSetValue } from "@/api/localData"
import { useToast } from "@/components/ui/toast"
import { StockLogoButton } from "@/components/ui/StockPopup"
import { cn } from "@/lib/utils"
import RangeBar from "./RangeBar"
import { ensureAnalystEstimate } from "@/api/analystEstimate"

const STORAGE_KEY    = "watchlist_items"        // legacy flat single-list format, read once for migration
const WATCHLISTS_KEY = "watchlists_v1"          // current format: [{ id, name, items:[{symbol,description}] }]
const ACTIVE_KEY     = "watchlist_active_id_v1" // which watchlist tab is selected — device-local, like tab order
const ALERTS_KEY  = "price_alerts"   // same key as sidebar PriceAlertsPanel
const FIRED_KEY   = "watchlist_alerts_fired"   // track which alerts have already notified

function load(key)    { try { return JSON.parse(localStorage.getItem(key) || "[]") } catch { return [] } }
function loadObj(key) { try { return JSON.parse(localStorage.getItem(key) || "{}") } catch { return {} } }
function save(key, d) { localStorage.setItem(key, JSON.stringify(d)) }


function genListId() { return "wl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

const EXT_INFO_CACHE_KEY = "watchlist_ext_info_cache_v2"  // v2: switched from broken Yahoo quoteSummary to Groq-based estimate
function loadExtInfoCache() { try { return JSON.parse(localStorage.getItem(EXT_INFO_CACHE_KEY) || "{}") } catch { return {} } }
function saveExtInfoCache(c) { localStorage.setItem(EXT_INFO_CACHE_KEY, JSON.stringify(c)) }

// Sector + analyst target range via the shared Groq-based estimate (see
// api/analystEstimate.js) — Yahoo's live analyst-target endpoint needs an
// auth cookie a public CORS proxy can't provide, so this reuses the same
// approach the stock detail panel already uses successfully. Needs a Groq
// key set; without one this returns null and the badges/bar just don't show.
async function fetchExtendedInfo(symbol, stock = {}, quote = {}) {
  const est = await ensureAnalystEstimate(
    symbol, stock.name || quote.shortName || symbol, quote.price,
    quote.fiftyTwoWeekLow, quote.fiftyTwoWeekHigh, null, quote.currency || stock.currency
  )
  if (!est) return null
  return {
    sector: stock.sector || est.sector || null,   // the stock's own stored sector wins if set
    targetLow:  est.targetLow  ?? null,
    targetHigh: est.targetHigh ?? null,
    targetMean: est.targetAvg  ?? null,
    numAnalysts: est.analysts ?? null,
  }
}

// Fetches quotes in small staggered batches instead of all at once — firing
// 8-10+ simultaneous requests at a free CORS proxy reliably gets a chunk of
// them silently rate-limited (they come back null and never retry until the
// next 60s cycle repeats the same failure), which is why some watchlist
// rows can end up permanently stuck showing "—" with no price/52-week range.
// Same shape as api/stockSearch's fetchQuote, but requests a year-to-date
// range instead of 1 day so YTD % return can be computed from the same
// response — no extra proxy request needed just for that one number.
async function fetchQuoteWithYTD(symbol) {
  try {
    const { toYahooTicker } = await import("@/api/tickerUtils")
    const yahooTicker = toYahooTicker(symbol, {})
    const proxies = ["https://corsproxy.io/?", "https://api.allorigins.win/raw?url="]
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1d&range=ytd`
    for (const proxy of proxies) {
      try {
        const res = await fetch(`${proxy}${encodeURIComponent(url)}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) })
        if (!res.ok) continue
        const data = await res.json()
        const result = data?.chart?.result?.[0]
        const meta = result?.meta
        if (!meta) continue
        const cur  = meta.regularMarketPrice ?? null
        const prev = meta.chartPreviousClose ?? meta.previousClose ?? null
        const closes = result?.indicators?.quote?.[0]?.close || []
        const firstClose = closes.find(c => c != null)
        const ytdPct = firstClose && cur != null ? ((cur - firstClose) / firstClose) * 100 : null
        return {
          price: cur, previousClose: prev,
          change: cur != null && prev != null ? cur - prev : null,
          changePercent: cur != null && prev != null ? ((cur - prev) / prev) * 100 : null,
          currency: meta.currency ?? "USD",
          shortName: meta.shortName ?? symbol,
          fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
          dividendYield: meta.dividendYield ?? null,
          trailingAnnualDividendYield: meta.trailingAnnualDividendYield ?? null,
          divYield: meta.dividendYield ?? null,
          ytdPct,
        }
      } catch { /* try next proxy */ }
    }
  } catch {}
  return null
}

async function fetchQuotesBatched(symbolList, batchSize = 3, delayMs = 400) {
  const map = {}
  for (let i = 0; i < symbolList.length; i += batchSize) {
    const batch = symbolList.slice(i, i + batchSize)
    const results = await Promise.allSettled(batch.map(async sym => {
      const q = await fetchQuoteWithYTD(sym)
      return [sym, q]
    }))
    results.forEach(r => { if (r.status === "fulfilled" && r.value[1]) map[r.value[0]] = r.value[1] })
    if (i + batchSize < symbolList.length) await new Promise(res => setTimeout(res, delayMs))
  }
  return map
}

// Loads the current multi-watchlist structure, migrating the old flat
// single-list format (array of symbol strings) into it the first time this
// runs. Always returns at least one watchlist.
function loadWatchlists() {
  try {
    const raw = localStorage.getItem(WATCHLISTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  const legacy = load(STORAGE_KEY) // array of symbol strings from the old format
  return [{
    id: "wl_default",
    name: "My Watchlist",
    items: legacy.map(sym => ({ symbol: sym, description: "" })),
  }]
}

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

export default function Watchlist({ stocks = [], prices = {}, dividends = [], globalCurrency = "CAD" }) {
  const USD_CAD = getRate()
  const [topUS,        setTopUS]        = useState([])
  const [topCA,        setTopCA]        = useState([])
  const [loadingMkt,   setLoadingMkt]   = useState(false)
  const [mktError,     setMktError]     = useState("")
  const [lastFetched,  setLastFetched]  = useState(null)

  // ── Detect fast movers in your portfolio (US + CA separately) ───
  const usMovers = useMemo(() => stocks
    .filter(s => s.shares > 1 && s.avg_cost > 1 && s.currency === "USD")
    .map(s => {
      const q = prices[s.symbol]; const live = q?.price ?? s.avg_cost; const prev = q?.previousClose ?? live
      const chg = prev > 0 ? (live - prev) / prev * 100 : 0
      return { symbol: s.symbol, account: s.account_type, live, chg, cur: "USD" }
    })
    .filter(s => Math.abs(s.chg) >= 3)
    .sort((a,b) => Math.abs(b.chg) - Math.abs(a.chg))
    .slice(0, 10)
  , [stocks, prices])

  const caMovers = useMemo(() => stocks
    .filter(s => s.shares > 1 && s.avg_cost > 1 && s.currency === "CAD")
    .map(s => {
      const q = prices[s.symbol]; const live = q?.price ?? s.avg_cost; const prev = q?.previousClose ?? live
      const chg = prev > 0 ? (live - prev) / prev * 100 : 0
      return { symbol: s.symbol, account: s.account_type, live, chg, cur: "CAD" }
    })
    .filter(s => Math.abs(s.chg) >= 3)
    .sort((a,b) => Math.abs(b.chg) - Math.abs(a.chg))
    .slice(0, 10)
  , [stocks, prices])

  // ── Fetch top market performers — US (Yahoo Finance movers) + CA ─
  async function fetchMarketMovers() {
    setLoadingMkt(true); setMktError("")
    try {
      const groqKey = localStorage.getItem("groq_api_key")
      if (!groqKey) { setMktError("Add your Groq API key in Settings to use this feature"); setLoadingMkt(false); return }

      const today = new Date().toLocaleDateString("en-CA")

      // Ask Groq for US top 10 and CA top 10 separately
      const prompt = `Today is ${today}. List the top 10 best performing stocks on US markets (NYSE/NASDAQ) AND top 10 best performing stocks on Canadian markets (TSX) over the past month. Base this on your training data for recent market performance. For each stock provide: symbol (use .TO suffix for Canadian), company name, approximate 1-month return %, market (US or CA), and one sentence reason. Respond ONLY with valid JSON: {"us":[{"symbol":"NVDA","name":"NVIDIA Corp","return_pct":18.5,"reason":"Strong AI chip sales"}],"ca":[{"symbol":"CNQ.TO","name":"Canadian Natural Resources","return_pct":8.2,"reason":"Rising oil prices"}]}`

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          max_tokens: 1200,
          messages: [{ role: "user", content: prompt }]
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error.message)
      const text  = data.choices?.[0]?.message?.content || ""
      const clean = text.replace(/```json|```/g,"").trim()
      const parsed = JSON.parse(clean)
      setTopUS(parsed.us || [])
      setTopCA(parsed.ca || [])
      setLastFetched(new Date().toLocaleTimeString())
    } catch(e) {
      setMktError(`Error: ${e.message || "Could not fetch market data. Try again."}`)
    }
    setLoadingMkt(false)
  }


  // ── Top/Worst Performers (last 6 months, including dividends received) ──
  const performers = useMemo(() => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0,10)

    return stocks
      .filter(s => s.shares > 0 && s.avg_cost > 1)  // exclude free/spin-off stocks with near-zero cost
      .map(s => {
        const livePrice = prices[s.symbol]?.price ?? s.current_price ?? s.avg_cost
        const cur       = s.currency || "USD"
        const toDisplay = (amt, c) => {
          if (c === globalCurrency) return amt
          return globalCurrency === "CAD" ? amt * USD_CAD : amt / USD_CAD
        }

        const costBasis = s.avg_cost * s.shares
        const mktValue  = livePrice * s.shares

        // Live dividends in last 6 months
        const liveDivTotal = dividends
          .filter(d => d.stock_id === s.id && d.date >= sixMonthsAgoStr)
          .reduce((sum, d) => sum + toDisplay(d.amount||0, d.currency||cur), 0)

        // Historical dividends (all years from Dividend History tab)
        let histDivTotal = 0
        try {
          const hist = JSON.parse(localStorage.getItem("historical_dividends_per_stock_v2")||"{}")
          const key = `${s.symbol}|${s.account_type}`
          if (hist[key]) {
            Object.values(hist[key]).forEach(amt => {
              histDivTotal += toDisplay(parseFloat(amt)||0, cur)
            })
          }
        } catch {}

        const divTotal6m    = liveDivTotal
        const divTotalAll   = liveDivTotal + histDivTotal

        // Return (price only, no dividends)
        const gainNoDiv    = toDisplay(mktValue - costBasis, cur)
        const gainNoDivPct = costBasis > 0 ? gainNoDiv / toDisplay(costBasis, cur) * 100 : 0

        // Return with all dividends
        const gainWithDiv    = gainNoDiv + divTotalAll
        const gainWithDivPct = costBasis > 0 ? gainWithDiv / toDisplay(costBasis, cur) * 100 : 0

        return {
          symbol:      s.symbol,
          name:        s.name || s.symbol,
          account:     s.account_type || "",
          cur,
          mktValue:    toDisplay(mktValue, cur),
          costBasis:   toDisplay(costBasis, cur),
          divTotal:    divTotal6m,
          divTotalAll,
          gain:        gainNoDiv,
          gainPct:     gainNoDivPct,
          gainWithDiv,
          gainWithDivPct,
          stock: s,
        }
      })
      .sort((a,b) => b.gainPct - a.gainPct)
  }, [stocks, prices, dividends, globalCurrency])

  const top10    = performers.slice(0, 10)
  const worst10  = [...performers].reverse().slice(0, 10)

  const fmtD = (n) => new Intl.NumberFormat("en-CA",{style:"currency",currency:globalCurrency,maximumFractionDigits:0}).format(n||0)

  const { toast } = useToast()
  const [watchlists,   setWatchlists]   = useState(() => loadWatchlists())
  const [activeListId, setActiveListId] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_KEY)
    const lists = loadWatchlists()
    return (saved && lists.some(w => w.id === saved)) ? saved : lists[0].id
  })
  const [alerts,   setAlerts]   = useState(() => load(ALERTS_KEY))
  const [fired,    setFired]    = useState(() => loadObj(FIRED_KEY))   // { alertId: true }
  const [quotes,   setQuotes]   = useState({})
  const [loading,  setLoading]  = useState(false)
  const [query,    setQuery]    = useState("")
  const [results,  setResults]  = useState([])
  const [searching,setSearching]= useState(false)
  const [alertForm,setAlertForm]= useState(null)
  const [notifPerm,setNotifPerm]= useState(() => "Notification" in window ? Notification.permission : "denied")
  const [newListName, setNewListName]   = useState(null)  // non-null while the "new watchlist" input is open
  const [renamingList, setRenamingList] = useState(null)  // list id currently being renamed
  const [renameValue, setRenameValue]   = useState("")
  const [descEditing, setDescEditing]   = useState(null)  // symbol currently being described
  const [descValue, setDescValue]       = useState("")
  const alertsRef = useRef(alerts)
  alertsRef.current = alerts

  const activeList = watchlists.find(w => w.id === activeListId) || watchlists[0]
  const items = activeList?.items || []  // [{ symbol, description }]

  function saveWatchlists(next) {
    save(WATCHLISTS_KEY, next)
    setWatchlists(next)
    cloudSetValue(WATCHLISTS_KEY, next)   // push to Firestore, cross-device sync
  }
  function updateActiveItems(updater) {
    const next = watchlists.map(w => w.id === activeList.id ? { ...w, items: updater(w.items) } : w)
    saveWatchlists(next)
  }
  function selectWatchlist(id) {
    setActiveListId(id)
    localStorage.setItem(ACTIVE_KEY, id)  // device-local, like tab order
  }
  function createWatchlist(name) {
    const trimmed = (name || "").trim()
    if (!trimmed) return
    const id = genListId()
    saveWatchlists([...watchlists, { id, name: trimmed, items: [] }])
    selectWatchlist(id)
    setNewListName(null)
  }
  function renameWatchlist(id, name) {
    const trimmed = (name || "").trim()
    if (!trimmed) { setRenamingList(null); return }
    saveWatchlists(watchlists.map(w => w.id === id ? { ...w, name: trimmed } : w))
    setRenamingList(null)
  }
  function deleteWatchlist(id) {
    if (watchlists.length <= 1) return  // always keep at least one watchlist
    const next = watchlists.filter(w => w.id !== id)
    saveWatchlists(next)
    if (activeListId === id) selectWatchlist(next[0].id)
  }
  function updateDescription(sym, description) {
    updateActiveItems(list => list.map(i => i.symbol === sym ? { ...i, description } : i))
    setDescEditing(null)
  }
  function saveAlerts(list) {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(list))
    setAlerts(list)
    cloudSetValue(ALERTS_KEY, list)    // push to Firestore, cross-device sync
    // Dispatch storage event so sidebar PriceAlertsPanel syncs immediately
    window.dispatchEvent(new StorageEvent("storage", { key: ALERTS_KEY, newValue: JSON.stringify(list) }))
  }
  function saveFired(obj)   { save(FIRED_KEY,   obj);  setFired(obj) }

  const [extInfo, setExtInfo] = useState(() => loadExtInfoCache())

  // Fetches sector + analyst target range for any symbols not already
  // cached, in small staggered batches. Shared by the manual watchlist and
  // the auto-generated holdings section below, so a symbol appearing in
  // both only gets fetched once. getContext resolves per-symbol stock
  // record (for its own stored sector) + quote (price/52-week, needed as
  // input for the Groq estimate) — callers pass this since the two
  // sections pull quotes from different places (this file's own `quotes`
  // state vs. the `prices` prop from the portfolio).
  async function ensureExtInfo(symbolList, getContext = sym => ({ stock: {}, quote: quotes[sym] || {} })) {
    const need = [...new Set(symbolList)].filter(sym => extInfo[sym] === undefined && loadExtInfoCache()[sym] === undefined)
    if (need.length === 0) return
    const cache = loadExtInfoCache()
    for (let i = 0; i < need.length; i += 3) {
      const batch = need.slice(i, i + 3)
      const results = await Promise.allSettled(batch.map(async sym => {
        const { stock, quote } = getContext(sym)
        return [sym, await fetchExtendedInfo(sym, stock, quote)]
      }))
      results.forEach(r => { if (r.status === "fulfilled") cache[r.value[0]] = r.value[1] || null })
      if (i + 3 < need.length) await new Promise(res => setTimeout(res, 400))
    }
    saveExtInfoCache(cache)
    setExtInfo(prev => ({ ...prev, ...cache }))
  }

  // ── Fetch prices + check alerts ─────────────────────────────────
  async function fetchAll(symbolList = items.map(i => i.symbol), silentAlerts = false) {
    if (symbolList.length === 0) return
    setLoading(true)
    try {
      let map = await fetchQuotesBatched(symbolList)
      // Retry anything that came back empty once, after a short pause —
      // recovers most transient CORS-proxy rate-limit misses instead of
      // leaving a row stuck at "—" until the next 60s refresh cycle.
      const missing = symbolList.filter(sym => !map[sym])
      if (missing.length > 0) {
        await new Promise(res => setTimeout(res, 800))
        const retryMap = await fetchQuotesBatched(missing)
        map = { ...map, ...retryMap }
      }
      // Merge rather than replace — a quote that fails this cycle keeps
      // showing its last-known value instead of flashing to "—".
      setQuotes(prev => ({ ...prev, ...map }))

      ensureExtInfo(symbolList, sym => ({ stock: {}, quote: map[sym] || {} }))  // sector + analyst target, cached, fire-and-forget

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
    fetchAll(items.map(i => i.symbol), true)  // initial load — silent (don't re-fire old alerts)
    const id = setInterval(() => fetchAll(), 60000)
    return () => clearInterval(id)
  }, [activeListId])

  // Re-check when alerts change
  useEffect(() => { if (quotes && Object.keys(quotes).length > 0) fetchAll() }, [alerts.length])

  // ── Auto-updating "My Holdings" watchlist ───────────────────────
  // Grouped by account, then by currency within each account. Live prices
  // and 52-week range come from the `prices` prop (already fetched
  // elsewhere for the portfolio — no extra requests needed here). Sector +
  // analyst target still need the same cached quoteSummary fetch used above.
  const holdingsGrouped = useMemo(() => {
    const groups = {}
    stocks.forEach(s => {
      if (!s.symbol || !(s.shares > 0)) return
      const acct = s.account_type || "Other"
      const cur  = s.currency || "USD"
      if (!groups[acct]) groups[acct] = {}
      if (!groups[acct][cur]) groups[acct][cur] = []
      groups[acct][cur].push(s)
    })
    return groups
  }, [stocks])

  useEffect(() => {
    const symbols = [...new Set(stocks.map(s => s.symbol).filter(Boolean))]
    if (symbols.length === 0) return
    ensureExtInfo(symbols, sym => ({
      stock: stocks.find(s => s.symbol === sym) || {},
      quote: prices[sym] || {},
    }))
    // YTD % isn't in the `prices` prop (Dashboard fetches 1-day quotes for
    // that), so fetch it here for any holdings not already covered by the
    // manual watchlist's own quote fetch above.
    const missing = symbols.filter(sym => quotes[sym]?.ytdPct === undefined)
    if (missing.length > 0) {
      fetchQuotesBatched(missing).then(map => setQuotes(prev => ({ ...prev, ...map })))
    }
  }, [stocks.map(s => s.symbol).sort().join(",")])

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
    if (items.some(i => i.symbol === sym)) return
    updateActiveItems(list => [...list, { symbol: sym, description: "" }])
    setQuery(""); setResults([])
    fetchAll([...items.map(i => i.symbol), sym], true)
  }

  function removeSymbol(sym) {
    updateActiveItems(list => list.filter(i => i.symbol !== sym))
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
    <div className="space-y-4">

      {/* Portfolio Fast Movers */}
      {(usMovers.length > 0 || caMovers.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[{label:"🇺🇸 US Fast Movers — Today", movers:usMovers}, {label:"🍁 CA Fast Movers — Today", movers:caMovers}].map(({label,movers}) =>
            movers.length === 0 ? null : (
              <Card key={label} className="bg-white border-amber-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="text-amber-500">⚡</span>{label}
                    <span className="text-[10px] font-normal text-gray-400">(≥3% today)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead className="bg-amber-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500">Stock</th>
                        <th className="px-3 py-2 text-right text-gray-500">Price</th>
                        <th className="px-3 py-2 text-right text-gray-500">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movers.map(s => (
                        <tr key={s.symbol+s.account} className="border-t border-amber-50 hover:bg-amber-50/50">
                          <td className="px-3 py-1.5">
                            <div className="font-semibold text-gray-900">{s.symbol}</div>
                            <div className="text-gray-400 text-[10px]">{s.account}</div>
                          </td>
                          <td className="px-3 py-1.5 text-right text-gray-700">${s.live.toFixed(2)} {s.cur}</td>
                          <td className="px-3 py-1.5 text-right">
                            <span className={cn("font-bold", s.chg >= 0 ? "text-green-600" : "text-red-500")}>
                              {s.chg >= 0 ? "▲" : "▼"} {Math.abs(s.chg).toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}

      {/* Market Top Performers */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="text-purple-500">🌍</span>
              Top Market Performers — Past Month
              {lastFetched && <span className="text-[10px] font-normal text-gray-400">Updated {lastFetched}</span>}
            </CardTitle>
            <button onClick={fetchMarketMovers} disabled={loadingMkt}
              className="flex items-center gap-1.5 text-xs text-purple-600 border border-purple-200 rounded px-2.5 py-1.5 hover:bg-purple-50 disabled:opacity-50">
              {loadingMkt
                ? <><div className="w-3 h-3 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mr-1"/>Fetching…</>
                : <>🔍 Fetch Latest</>}
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {mktError && <div className="px-4 py-3 text-xs text-red-600 bg-red-50 rounded">{mktError}</div>}
          {topUS.length === 0 && topCA.length === 0 && !mktError && (
            <div className="text-center py-6 text-gray-400 text-xs">
              Click <strong>Fetch Latest</strong> to load top performers from US & Canadian markets
            </div>
          )}
          {(topUS.length > 0 || topCA.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-gray-100">
              {[{label:"🇺🇸 Top 10 US", list:topUS}, {label:"🍁 Top 10 Canada", list:topCA}].map(({label,list}) => (
                <div key={label}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50">{label}</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="px-3 py-1.5 text-left text-gray-400 font-normal">Stock</th>
                        <th className="px-3 py-1.5 text-right text-gray-400 font-normal">1M</th>
                        <th className="px-3 py-1.5 text-left text-gray-400 font-normal hidden lg:table-cell">Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((s,i) => (
                        <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-3 py-1.5">
                            <div className="font-semibold text-gray-900">{s.symbol}</div>
                            <div className="text-gray-400 text-[10px]">{s.name}</div>
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <span className={cn("font-bold", (s.return_pct||0)>=0?"text-green-600":"text-red-500")}>
                              {(s.return_pct||0)>=0?"+":""}{(s.return_pct||0).toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-gray-400 text-[10px] hidden lg:table-cell max-w-[140px]" style={{whiteSpace:"normal"}}>{s.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {stocks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top 10 */}
          <Card className="bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500"/>
                Top 10 Performers — Last 6 Months
                <span className="text-[10px] font-normal text-gray-400">(incl. dividends)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500">Stock</th>
                    <th className="px-3 py-2 text-right text-gray-500">Mkt Value</th>
                    <th className="px-3 py-2 text-right text-gray-500">Dividends</th>
                    <th className="px-3 py-2 text-right text-gray-500">Return %</th>
                    <th className="px-3 py-2 text-right text-gray-500">Ret+Div %</th>
                  </tr>
                </thead>
                <tbody>
                  {top10.map((s,i) => (
                    <tr key={s.symbol+s.account} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-1.5">
                        <div className="font-semibold text-gray-900">{s.symbol}</div>
                        <div className="text-gray-400">{s.account}</div>
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-700">{fmtD(s.mktValue)}</td>
                      <td className="px-3 py-1.5 text-right text-blue-600">{s.divTotalAll > 0 ? fmtD(s.divTotalAll) : "—"}</td>
                      <td className="px-3 py-1.5 text-right">
                        <span className={cn("font-semibold text-xs", s.gainPct >= 0 ? "text-green-600" : "text-red-500")}>
                          {s.gainPct >= 0 ? "+" : ""}{s.gainPct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <span className={cn("font-bold text-xs", s.gainWithDivPct >= 0 ? "text-green-700" : "text-red-600")}>
                          {s.gainWithDivPct >= 0 ? "+" : ""}{s.gainWithDivPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Worst 10 */}
          <Card className="bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500"/>
                Worst 10 Performers — Last 6 Months
                <span className="text-[10px] font-normal text-gray-400">(incl. dividends)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500">Stock</th>
                    <th className="px-3 py-2 text-right text-gray-500">Mkt Value</th>
                    <th className="px-3 py-2 text-right text-gray-500">Dividends</th>
                    <th className="px-3 py-2 text-right text-gray-500">Return %</th>
                    <th className="px-3 py-2 text-right text-gray-500">Ret+Div %</th>
                  </tr>
                </thead>
                <tbody>
                  {worst10.map((s,i) => (
                    <tr key={s.symbol+s.account} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-1.5">
                        <div className="font-semibold text-gray-900">{s.symbol}</div>
                        <div className="text-gray-400">{s.account}</div>
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-700">{fmtD(s.mktValue)}</td>
                      <td className="px-3 py-1.5 text-right text-blue-600">{s.divTotalAll > 0 ? fmtD(s.divTotalAll) : "—"}</td>
                      <td className="px-3 py-1.5 text-right">
                        <span className={cn("font-semibold text-xs", s.gainPct >= 0 ? "text-green-600" : "text-red-500")}>
                          {s.gainPct >= 0 ? "+" : ""}{s.gainPct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <span className={cn("font-bold text-xs", s.gainWithDivPct >= 0 ? "text-green-700" : "text-red-600")}>
                          {s.gainWithDivPct >= 0 ? "+" : ""}{s.gainWithDivPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Auto-updating: My Holdings, grouped by account then currency */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4 text-emerald-500" /> My Holdings
            <span className="text-[10px] font-normal text-gray-400">auto-updates from your portfolio</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {Object.keys(holdingsGrouped).length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-xs">No holdings yet — add stocks in the Portfolio tab.</div>
          ) : (
            Object.entries(holdingsGrouped).sort(([a],[b]) => a.localeCompare(b)).map(([account, byCurrency]) => (
              <div key={account}>
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 border-y border-gray-200">{account}</div>
                {Object.entries(byCurrency).sort(([a],[b]) => a.localeCompare(b)).map(([currency, list]) => (
                  <div key={currency}>
                    <div className="px-3 py-1 text-[11px] font-medium text-gray-400">{currency} · {list.length} holding{list.length !== 1 ? "s" : ""}</div>
                    <div className="divide-y">
                      {list.map(s => {
                        const q   = prices[s.symbol]
                        const chg = q?.changePercent ?? null
                        const pos = chg != null && chg >= 0
                        const ext = extInfo[s.symbol]
                        const yieldPct = q?.trailingAnnualDividendYield != null ? q.trailingAnnualDividendYield * 100
                                       : q?.divYield != null ? q.divYield * 100
                                       : null
                        const ytdPct = quotes[s.symbol]?.ytdPct ?? null
                        return (
                          <div key={s.id} className="px-3 py-2.5 hover:bg-gray-50 transition-colors">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <StockLogoButton symbol={s.symbol} name={s.name || s.symbol} size={32}
                                  stock={s} quote={q} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-sm text-gray-900">{s.symbol}</span>
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
                                  <div className="text-[11px] text-gray-400">{s.shares} sh</div>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                {q ? (
                                  <>
                                    <div className="font-semibold text-sm text-gray-900">{fmt(q.price, q.currency)}</div>
                                    <div className={cn("text-xs font-medium flex items-center justify-end gap-0.5",
                                      pos ? "text-green-600" : "text-red-500")}>
                                      {pos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                      {pos ? "+" : ""}{chg != null ? chg.toFixed(2) : "0.00"}%
                                    </div>
                                  </>
                                ) : <div className="text-xs text-gray-300">—</div>}
                              </div>
                            </div>
                            <RangeBar low={q?.fiftyTwoWeekLow} high={q?.fiftyTwoWeekHigh} current={q?.price}
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
                  </div>
                ))}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Existing Watchlist */}
      <Card className="bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4 text-blue-500" /> {activeList?.name || "Watchlist"}
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

        {/* Watchlist tabs — switch, rename, delete, create */}
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          {watchlists.map(w => (
            <div key={w.id} className={cn(
              "group flex items-center gap-1 rounded-full border pl-3 pr-1.5 py-1 text-xs transition-colors",
              w.id === activeListId
                ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold"
                : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
            )}>
              {renamingList === w.id ? (
                <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") renameWatchlist(w.id, renameValue); if (e.key === "Escape") setRenamingList(null) }}
                  onBlur={() => renameWatchlist(w.id, renameValue)}
                  className="text-xs border-b border-blue-300 bg-transparent focus:outline-none w-24" />
              ) : (
                <button onClick={() => selectWatchlist(w.id)} className="whitespace-nowrap">
                  {w.name} <span className="text-[10px] opacity-60">({w.items.length})</span>
                </button>
              )}
              {w.id === activeListId && renamingList !== w.id && (
                <>
                  <button onClick={() => { setRenamingList(w.id); setRenameValue(w.name) }}
                    className="opacity-40 hover:opacity-100 p-0.5" title="Rename watchlist">
                    <Pencil className="h-3 w-3" />
                  </button>
                  {watchlists.length > 1 && (
                    <button onClick={() => { if (confirm(`Delete watchlist "${w.name}"? This removes its ${w.items.length} stock(s) too.`)) deleteWatchlist(w.id) }}
                      className="opacity-40 hover:opacity-100 hover:text-red-500 p-0.5" title="Delete watchlist">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          {newListName !== null ? (
            <div className="flex items-center gap-1 rounded-full border border-green-300 bg-green-50 pl-3 pr-1.5 py-1">
              <input autoFocus value={newListName} onChange={e => setNewListName(e.target.value)}
                placeholder="Watchlist name..."
                onKeyDown={e => { if (e.key === "Enter") createWatchlist(newListName); if (e.key === "Escape") setNewListName(null) }}
                className="text-xs bg-transparent focus:outline-none w-28" />
              <button onClick={() => createWatchlist(newListName)} className="text-green-600 hover:text-green-800 p-0.5" title="Create">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setNewListName(null)} className="text-gray-400 hover:text-gray-600 p-0.5" title="Cancel">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={() => setNewListName("")}
              className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 text-gray-400 hover:text-blue-600 hover:border-blue-300 px-2.5 py-1 text-xs transition-colors">
              <Plus className="h-3 w-3" /> New watchlist
            </button>
          )}
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
            <p className="text-xs">No stocks on {activeList?.name || "this watchlist"}</p>
            <p className="text-[11px] text-gray-300 mt-0.5">Search above to add stocks to watch</p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map(item => {
              const sym      = item.symbol
              const q        = quotes[sym]
              const chg      = q?.changePercent ?? null
              const pos      = chg != null && chg >= 0
              const symAlerts = alerts.filter(a => a.symbol === sym)
              const anyHit   = symAlerts.some(a => !!fired[a.id])
              const yieldPct = q?.trailingAnnualDividendYield != null ? q.trailingAnnualDividendYield * 100
                              : q?.divYield != null ? q.divYield * 100
                              : null
              const sector   = extInfo[sym]?.sector
              const ytdPct   = q?.ytdPct ?? null

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
                        {yieldPct != null && yieldPct > 0 && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                            {yieldPct.toFixed(2)}% yield
                          </span>
                        )}
                        {sector && (
                          <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{sector}</span>
                        )}
                        {ytdPct != null && (
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium border",
                            ytdPct >= 0 ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200")}>
                            {ytdPct >= 0 ? "+" : ""}{ytdPct.toFixed(1)}% YTD
                          </span>
                        )}
                        {anyHit && <BellRing className="h-3.5 w-3.5 text-yellow-500 animate-pulse" />}
                        {symAlerts.length > 0 && !anyHit && <Bell className="h-3 w-3 text-gray-300" />}
                      </div>
                      {q?.shortName && <div className="text-[11px] text-gray-400 truncate">{q.shortName}</div>}

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

                      {/* Description note */}
                      {descEditing === sym ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <input autoFocus value={descValue} onChange={e => setDescValue(e.target.value)}
                            placeholder="Why is this on your watchlist?"
                            onKeyDown={e => { if (e.key === "Enter") updateDescription(sym, descValue); if (e.key === "Escape") setDescEditing(null) }}
                            className="text-[11px] border border-gray-300 rounded px-2 py-1 bg-white flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          <button onClick={() => updateDescription(sym, descValue)} className="text-green-600 hover:text-green-800 p-0.5" title="Save">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setDescEditing(null)} className="text-gray-400 hover:text-gray-600 p-0.5" title="Cancel">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : item.description ? (
                        <button onClick={() => { setDescEditing(sym); setDescValue(item.description) }}
                          className="text-[11px] text-gray-500 italic mt-1 text-left hover:text-gray-700 flex items-start gap-1">
                          <StickyNote className="h-3 w-3 mt-0.5 shrink-0 opacity-50" />
                          <span>{item.description}</span>
                        </button>
                      ) : null}
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
                      {descEditing !== sym && !item.description && (
                        <button onClick={() => { setDescEditing(sym); setDescValue("") }}
                          className="p-1 rounded hover:bg-gray-200 text-gray-300 hover:text-gray-600 transition-colors"
                          title="Add a note">
                          <StickyNote className="h-3.5 w-3.5" />
                        </button>
                      )}
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
                  <RangeBar low={q?.fiftyTwoWeekLow} high={q?.fiftyTwoWeekHigh} current={q?.price}
                    label="52-week range"
                    gradientClass="bg-gradient-to-r from-red-300 via-yellow-200 to-green-400"
                    markerClass="bg-blue-500" />

                  {/* Analyst price target range */}
                  <RangeBar low={extInfo[sym]?.targetLow} high={extInfo[sym]?.targetHigh} current={q?.price}
                    label={`12-month forecast${extInfo[sym]?.numAnalysts ? ` (${extInfo[sym].numAnalysts} analysts)` : ""}`}
                    gradientClass="bg-gradient-to-r from-orange-200 via-blue-200 to-purple-300"
                    markerClass="bg-indigo-600" />
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  )
}
