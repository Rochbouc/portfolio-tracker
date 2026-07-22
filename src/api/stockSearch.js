/**
 * Stock data API - uses Yahoo Finance v8 chart via CORS proxy.
 * Automatically converts stored ticker symbols to Yahoo Finance format.
 * e.g.  TD (CAD) → TD.TO    ENB (CAD) → ENB.TO    NVDA (USD) → NVDA
 */
import { toYahooTicker } from "./tickerUtils"

const CORS_PROXIES = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
]

async function proxyFetch(url) {
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(`${proxy}${encodeURIComponent(url)}`, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const data = await res.json()
      return data
    } catch { /* try next proxy */ }
  }
  return null
}


// Fetch live USD/CAD exchange rate from Yahoo Finance
export async function fetchUSDCADRate() {
  try {
    const data = await proxyFetch(
      "https://query2.finance.yahoo.com/v8/finance/chart/USDCAD=X?interval=1d&range=1d"
    )
    const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    if (rate && rate > 1.0 && rate < 2.0) return parseFloat(rate.toFixed(4))
  } catch {}
  return 1.40  // fallback if fetch fails
}

export async function searchTickers(query) {
  if (!query || query.trim().length < 1) return []
  const data = await proxyFetch(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=20&newsCount=0&enableFuzzyQuery=true`
  )
  if (!data) return []
  return (data.quotes || [])
    .filter(q => q.quoteType === "EQUITY" || q.quoteType === "ETF" || q.quoteType === "MUTUALFUND")
    .map(q => ({
      symbol:   q.symbol,
      name:     q.longname || q.shortname || q.symbol,
      exchange: q.exchDisp || q.exchange || "",
      type:     q.quoteType || "EQUITY",
      market:   detectMarket(q.symbol, q.exchange, q.exchDisp),
    }))
    .sort((a, b) => {
      const aE = a.symbol.toUpperCase() === query.toUpperCase() ? 0 : 1
      const bE = b.symbol.toUpperCase() === query.toUpperCase() ? 0 : 1
      return aE - bE
    })
}

function detectMarket(symbol, exchange, exchDisp) {
  const exch = (exchange || "").toUpperCase()
  const disp = (exchDisp || "").toUpperCase()
  const sym  = (symbol  || "").toUpperCase()
  if (exch === "TOR" || exch === "TSX" || exch === "TSXV" || exch === "CVE" ||
      disp.includes("TORONTO") || disp.includes("TSX") ||
      sym.endsWith(".TO") || sym.endsWith(".V") || sym.endsWith(".CN") || sym.endsWith(".NE"))
    return "CA"
  if (exch === "NYQ" || exch === "NMS" || exch === "NGM" || exch === "PCX" ||
      exch === "BATS" || exch === "NYSE" || exch === "NASDAQ" ||
      disp.includes("NYSE") || disp.includes("NASDAQ") ||
      (!sym.includes(".") && sym.match(/^[A-Z]{1,5}$/)))
    return "US"
  if (!sym.includes(".")) return "US"
  return "US"
}

/**
 * Fetch a live quote. Accepts either a plain symbol ("TD") with stock metadata,
 * or an already-formatted Yahoo ticker ("TD.TO").
 * 
 * @param {string} symbol - ticker as stored in the app
 * @param {object} stock  - stock record (used for currency/market to build Yahoo ticker)
 */
export async function fetchQuote(symbol, stock = {}) {
  const yahooTicker = toYahooTicker(symbol, stock)
  const data = await proxyFetch(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1d&range=1d`
  )
  const meta = data?.chart?.result?.[0]?.meta
  if (!meta) return null

  const cur  = meta.regularMarketPrice ?? null
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? null

  return {
    price:         cur,
    previousClose: prev,
    change:        cur != null && prev != null ? cur - prev : null,
    changePercent: cur != null && prev != null ? ((cur - prev) / prev) * 100 : null,
    currency:      meta.currency ?? "USD",
    name:          meta.longName ?? meta.shortName ?? symbol,
    exchange:      meta.exchangeName ?? "",
    shortName:     meta.shortName ?? symbol,
    yahooTicker,   // store for debugging
    open:          meta.regularMarketOpen        ?? null,
    dayHigh:       meta.regularMarketDayHigh     ?? null,
    dayLow:        meta.regularMarketDayLow      ?? null,
    volume:        meta.regularMarketVolume      ?? null,
    week52High:    meta.fiftyTwoWeekHigh         ?? null,
    week52Low:     meta.fiftyTwoWeekLow          ?? null,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh      ?? null,
    fiftyTwoWeekLow:  meta.fiftyTwoWeekLow       ?? null,
    marketCap:     meta.marketCap                ?? null,
    peRatio:       meta.trailingPE               ?? null,
    divYield:      meta.dividendYield            ?? null,
    trailingAnnualDividendRate: meta.trailingAnnualDividendRate ?? null,
    trailingAnnualDividendYield: meta.trailingAnnualDividendYield ?? null,
    beta:          meta.beta                     ?? null,
  }
}

export async function fetchChartData(symbol, range = "1M", stock = {}) {
  const yahooTicker = toYahooTicker(symbol, stock)
  const rangeMap = { "1D":"1d","1W":"5d","1M":"1mo","3M":"3mo","1Y":"1y","5Y":"5y" }
  const intMap   = { "1D":"5m","1W":"60m","1M":"1d","3M":"1d","1Y":"1wk","5Y":"1mo" }
  const data = await proxyFetch(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=${intMap[range]||"1d"}&range=${rangeMap[range]||"1mo"}`
  )
  const result = data?.chart?.result?.[0]
  if (!result) return []
  const timestamps = result.timestamp || []
  const closes     = result.indicators?.quote?.[0]?.close || []
  return timestamps
    .map((t, i) => ({
      date:  new Date(t * 1000).toLocaleDateString("en-CA", { month:"short", day:"numeric" }),
      price: closes[i] ? parseFloat(closes[i].toFixed(2)) : null,
    }))
    .filter(d => d.price !== null)
}

export async function fetchKeyStats(symbol, stock = {}) {
  const yahooTicker = toYahooTicker(symbol, stock)
  const data = await proxyFetch(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1d&range=1y`
  )
  const result = data?.chart?.result?.[0]
  const meta   = result?.meta
  if (!meta) return null

  const closes = (result?.indicators?.quote?.[0]?.close || []).filter(c => c != null)
  const sma200 = closes.length >= 20
    ? closes.slice(-Math.min(200, closes.length)).reduce((a, b) => a + b, 0) / Math.min(200, closes.length)
    : null

  const cur = meta.regularMarketPrice ?? null

  return {
    price:        cur,
    open:         meta.regularMarketOpen         ?? null,
    dayHigh:      meta.regularMarketDayHigh      ?? null,
    dayLow:       meta.regularMarketDayLow       ?? null,
    volume:       meta.regularMarketVolume       ?? null,
    week52High:   meta.fiftyTwoWeekHigh          ?? null,
    week52Low:    meta.fiftyTwoWeekLow           ?? null,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh      ?? null,
    fiftyTwoWeekLow:  meta.fiftyTwoWeekLow       ?? null,
    marketCap:    meta.marketCap                 ?? null,
    peRatio:      meta.trailingPE                ?? null,
    divYield:     meta.dividendYield             ?? null,
    trailingAnnualDividendRate: meta.trailingAnnualDividendRate ?? null,
    sma200,
    bid:          null,
    ask:          null,
    sector:       "",
    targetPrice:  null,
    targetLow:    null,
    targetHigh:   null,
    recommendation: "",
    numAnalysts:  null,
    hasAnalystData: false,
    currency:     meta.currency ?? "USD",
    yahooTicker,
  }
}
