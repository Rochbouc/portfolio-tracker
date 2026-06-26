const PROXIES = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
]

async function fetchWithProxy(url) {
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(url), { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const text = await res.text()
      return JSON.parse(text)
    } catch { continue }
  }
  throw new Error('All proxies failed for: ' + url)
}

export async function fetchQuote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`
  const data = await fetchWithProxy(url)
  const meta = data?.chart?.result?.[0]?.meta
  if (!meta) throw new Error('No data for ' + ticker)
  return {
    ticker,
    price: meta.regularMarketPrice ?? meta.previousClose ?? 0,
    previousClose: meta.previousClose ?? 0,
    change: (meta.regularMarketPrice ?? 0) - (meta.previousClose ?? 0),
    changePct: meta.previousClose ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100 : 0,
    currency: meta.currency ?? 'USD',
    name: meta.shortName ?? meta.symbol ?? ticker,
    marketCap: meta.marketCap,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
    trailingPE: meta.trailingPE,
    trailingAnnualDividendRate: meta.trailingAnnualDividendRate,
    trailingAnnualDividendYield: meta.trailingAnnualDividendYield,
  }
}

export async function fetchHistory(ticker, range = '1y') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`
  const data = await fetchWithProxy(url)
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error('No history for ' + ticker)
  const timestamps = result.timestamp ?? []
  const closes = result.indicators?.quote?.[0]?.close ?? []
  const points = []
  timestamps.forEach((ts, i) => {
    if (closes[i] != null) {
      points.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), close: closes[i] })
    }
  })
  return points
}

export async function fetchDetailedQuote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`
  const data = await fetchWithProxy(url)
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error('No data for ' + ticker)
  const meta = result.meta
  const timestamps = result.timestamp ?? []
  const closes = result.indicators?.quote?.[0]?.close ?? []
  const history = []
  timestamps.forEach((ts, i) => {
    if (closes[i] != null) {
      history.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), close: closes[i] })
    }
  })
  // 200-day SMA
  let sma200 = null
  if (history.length >= 200) {
    const last200 = history.slice(-200).map(h => h.close)
    sma200 = last200.reduce((a, b) => a + b, 0) / 200
  }
  return {
    ticker,
    price: meta.regularMarketPrice ?? 0,
    previousClose: meta.previousClose ?? 0,
    change: (meta.regularMarketPrice ?? 0) - (meta.previousClose ?? 0),
    changePct: meta.previousClose ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100 : 0,
    currency: meta.currency ?? 'USD',
    name: meta.shortName ?? ticker,
    marketCap: meta.marketCap,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
    trailingPE: meta.trailingPE,
    trailingAnnualDividendRate: meta.trailingAnnualDividendRate ?? 0,
    trailingAnnualDividendYield: meta.trailingAnnualDividendYield ?? 0,
    sma200,
    history,
  }
}

export async function searchTickers(query) {
  if (!query || query.length < 1) return []
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`
  try {
    const data = await fetchWithProxy(url)
    return (data?.quotes ?? [])
      .filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
      .map(q => ({ symbol: q.symbol, name: q.shortname || q.longname || q.symbol, exchange: q.exchDisp || q.exchange }))
  } catch { return [] }
}
