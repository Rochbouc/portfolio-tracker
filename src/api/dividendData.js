/**
 * Dividend data fetching strategy:
 * 1. Try Yahoo Finance v8 chart (trailingAnnualDividendRate field)
 * 2. Fallback to hardcoded table for well-known stocks
 * 3. If Groq key set, ask AI for any stock not in hardcoded table
 */

const PROXIES = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
];

// ── Hardcoded dividend table (annual $ per share, updated June 2026) ──
// Covers the most common Canadian and US dividend stocks
const KNOWN_DIVIDENDS = {
  // US stocks — annual dividend per share in USD
  "AAPL":  { rate: 1.00,  freq: 4,  currency: "USD", payDay: 15, payMonths: [2,5,8,11] },
  "MSFT":  { rate: 3.32,  freq: 4,  currency: "USD", payDay: 8, payMonths: [3,6,9,12] },
  "JNJ":   { rate: 4.96,  freq: 4,  currency: "USD", payMonths: [3, 6, 9, 12] },
  "KO":    { rate: 1.94,  freq: 4,  currency: "USD", payMonths: [1, 4, 7, 10] },
  "PEP":   { rate: 5.42,  freq: 4,  currency: "USD", payMonths: [1, 4, 7, 10] },
  "PG":    { rate: 4.03,  freq: 4,  currency: "USD" },
  "VZ":    { rate: 2.66,  freq: 4,  currency: "USD" },
  "T":     { rate: 1.11,  freq: 4,  currency: "USD", payMonths: [2, 5, 8, 11] },
  "XOM":   { rate: 3.84,  freq: 4,  currency: "USD", payMonths: [3, 6, 9, 12] },
  "CVX":   { rate: 6.52,  freq: 4,  currency: "USD", payMonths: [3, 6, 9, 12] },
  "JPM":   { rate: 5.00,  freq: 4,  currency: "USD" },
  "BAC":   { rate: 1.04,  freq: 4,  currency: "USD" },
  "WMT":   { rate: 0.83,  freq: 4,  currency: "USD" },
  "HD":    { rate: 9.00,  freq: 4,  currency: "USD" },
  "V":     { rate: 2.34,  freq: 4,  currency: "USD", payMonths: [3, 6, 9, 12] },
  "MA":    { rate: 2.64,  freq: 4,  currency: "USD", payMonths: [2, 5, 8, 11] },
  "PFE":   { rate: 1.68,  freq: 4,  currency: "USD" },
  "ABT":   { rate: 2.20,  freq: 4,  currency: "USD" },
  "MMM":   { rate: 2.80,  freq: 4,  currency: "USD" },
  "IBM":   { rate: 6.68,  freq: 4,  currency: "USD" },
  // Monthly income / covered call ETFs (USD)
  "JEPI":  { rate: 5.40,  freq: 12, currency: "USD" },
  "JEPQ":  { rate: 5.20,  freq: 12, currency: "USD" },
  "XYLD":  { rate: 3.80,  freq: 12, currency: "USD" },
  "QYLD":  { rate: 1.90,  freq: 12, currency: "USD" },
  "RYLD":  { rate: 1.80,  freq: 12, currency: "USD" },
  "DIVO":  { rate: 1.80,  freq: 12, currency: "USD" },
  "O":     { rate: 3.24,  freq: 12, currency: "USD" },  // Realty Income
  "STAG":  { rate: 1.47,  freq: 12, currency: "USD" },
  "AGNC":  { rate: 1.44,  freq: 12, currency: "USD" },
  // Canadian banks (CAD)
  "TD.TO":   { rate: 4.08, freq: 4, currency: "CAD", payDay: 30, payMonths: [1,4,7,10] },   // Jan/Apr/Jul/Oct 30
  "RY.TO":   { rate: 5.72, freq: 4, currency: "CAD", payDay: 24, payMonths: [2,5,8,11] },
  "BMO.TO":  { rate: 6.00, freq: 4, currency: "CAD", payMonths: [2, 5, 8, 11] },
  "BNS.TO":  { rate: 4.24, freq: 4, currency: "CAD", payDay: 27, payMonths: [1,4,7,10] },
  "CM.TO":   { rate: 3.60, freq: 4, currency: "CAD", payMonths: [1, 4, 7, 10] },
  "NA.TO":   { rate: 4.56, freq: 4, currency: "CAD", payMonths: [2, 5, 8, 11] },
  // Canadian energy / pipelines
  "ENB.TO":  { rate: 3.77, freq: 4, currency: "CAD", payDay:  1, payMonths: [3,6,9,12] },
  "TRP.TO":  { rate: 3.72, freq: 4,  currency: "CAD", payMonths: [1, 4, 7, 10] },
  "PPL.TO":  { rate: 1.05, freq: 4,  currency: "CAD" },
  // Canadian telecom
  "BCE.TO":  { rate: 3.99, freq: 4,  currency: "CAD" },
  "T.TO":    { rate: 1.61, freq: 4,  currency: "CAD" },
  "RCI.B.TO":{ rate: 2.00, freq: 4,  currency: "CAD" },
  // Canadian utilities
  "FTS.TO":  { rate: 2.36, freq: 4, currency: "CAD", payDay:  1, payMonths: [3,6,9,12] },
  "EMA.TO":  { rate: 2.65, freq: 4,  currency: "CAD", payMonths: [2, 5, 8, 11] },
  "AQN.TO":  { rate: 0.72, freq: 4,  currency: "CAD" },
  // Canadian rail
  "CNR.TO":  { rate: 3.44, freq: 4,  currency: "CAD", payMonths: [3, 6, 9, 12] },
  "CP.TO":   { rate: 1.24, freq: 4,  currency: "CAD", payMonths: [1, 4, 7, 10] },
  // Canadian insurance / financial
  "MFC.TO":  { rate: 1.60, freq: 4, currency: "CAD", payDay: 19, payMonths: [3,6,9,12] },
  "SLF.TO":  { rate: 2.76, freq: 4,  currency: "CAD", payMonths: [3, 6, 9, 12] },
  "GWO.TO":  { rate: 1.88, freq: 4,  currency: "CAD" },
  // Canadian covered call / income ETFs (monthly)
  "ZWC.TO":  { rate: 0.72, freq: 12, currency: "CAD" },
  "ZWB.TO":  { rate: 0.60, freq: 12, currency: "CAD" },
  "HDIV.TO": { rate: 1.56, freq: 12, currency: "CAD" },
  "ZPAY.TO": { rate: 0.60, freq: 12, currency: "CAD" },
  "HYLD.TO": { rate: 0.96, freq: 12, currency: "CAD" },
  "XDIV.TO": { rate: 0.84, freq: 12, currency: "CAD" },
  // Your covered call ETFs (Canadian) — monthly, .TO suffix
  "HMAX.TO": { rate: 1.68, freq: 12, currency: "CAD" },   // Hamilton Canadian Financials Yield Max
  "HDIF.TO": { rate: 1.20, freq: 12, currency: "CAD" },   // Hamilton Diversified
  "HHIS.TO": { rate: 1.44, freq: 12, currency: "CAD" },   // Harvest Diversified High Income
  "MSTE.TO": { rate: 1.00, freq: 12, currency: "CAD" },   // Harvest Strategy Enhanced
  "ENCL.TO": { rate: 1.20, freq: 12, currency: "CAD" },
  "UTES.TO": { rate: 0.84, freq: 12, currency: "CAD" },
  // Also store without .TO so lookup works regardless of how symbol is stored
  "ZWC":  { rate: 0.72, freq: 12, currency: "CAD" },
  "ZWB":  { rate: 0.60, freq: 12, currency: "CAD" },
  "HDIV": { rate: 1.56, freq: 12, currency: "CAD", payDay:  8 },  // ~8th each month
  "ZPAY": { rate: 0.60, freq: 12, currency: "CAD" },
  "HYLD": { rate: 0.96, freq: 12, currency: "CAD", payDay: 12 },
  "XDIV": { rate: 0.84, freq: 12, currency: "CAD" },
  "HMAX": { rate: 1.68, freq: 12, currency: "CAD", payDay:  8 },
  "HHIS": { rate: 1.44, freq: 12, currency: "CAD", payDay: 10 },
  "MSTE": { rate: 1.00, freq: 12, currency: "CAD", payDay: 10 },
  "HDIF": { rate: 1.20, freq: 12, currency: "CAD" },
  // US covered call / high-yield ETFs — monthly
  "QDTE":  { rate: 3.60, freq: 52, currency: "USD", payDow: 5 }, // Friday weekly  // Roundhill 0DTE Nasdaq — WEEKLY
  "XDTE":  { rate: 4.80, freq: 52, currency: "USD", payDow: 5 }, // Friday weekly  // Roundhill 0DTE S&P 500 — WEEKLY
  "YMAX":  { rate: 2.40, freq: 52, currency: "USD" },  // YieldMax Universe — WEEKLY
  // Other weekly-paying ETFs
  "YMAG":  { rate: 2.80, freq: 52, currency: "USD" },  // YieldMax Mag7 — WEEKLY
  "MSFO":  { rate: 3.20, freq: 52, currency: "USD" },  // YieldMax MSFT — WEEKLY
  "NVDY":  { rate: 4.00, freq: 52, currency: "USD" },  // YieldMax NVDA — WEEKLY
  "NVDA":  { rate: 0.04, freq: 4,  currency: "USD", payDay: 2, payMonths: [3,6,9,12] },  // NVIDIA quarterly
  "AMZY":  { rate: 3.60, freq: 52, currency: "USD" },  // YieldMax AMZN — WEEKLY
  "GOOGY": { rate: 3.00, freq: 52, currency: "USD" },  // YieldMax GOOGL — WEEKLY
  "XYLD":  { rate: 3.60, freq: 12, currency: "USD" },  // Global X S&P 500 Covered Call
  "QYLD":  { rate: 2.88, freq: 12, currency: "USD" },  // Global X NASDAQ Covered Call
  "RYLD":  { rate: 2.64, freq: 12, currency: "USD" },  // Global X Russell 2000 Covered Call
  "JEPI":  { rate: 4.20, freq: 12, currency: "USD" },  // JPMorgan Equity Premium Income
  "JEPQ":  { rate: 4.80, freq: 12, currency: "USD" },  // JPMorgan NASDAQ Equity Premium
  "DIVO":  { rate: 1.80, freq: 12, currency: "USD" },  // Amplify Enhanced Dividend Income
  // Schwab ETFs
  "SCHD":  { rate: 2.76, freq: 4,  currency: "USD", payDay: 26, payMonths: [1,4,7,10] },  // Schwab US Dividend Equity — quarterly
  "SCHP":  { rate: 1.20, freq: 12, currency: "USD", payDay: 1  },  // Schwab U.S. TIPS ETF — monthly
  "SCHB":  { rate: 1.40, freq: 4,  currency: "USD", payDay: 26, payMonths: [1,4,7,10] },
  "SCHX":  { rate: 1.40, freq: 4,  currency: "USD", payDay: 26, payMonths: [1,4,7,10] },
  "SCHF":  { rate: 1.60, freq: 4,  currency: "USD", payDay: 26, payMonths: [1,4,7,10] },
  "SCHI":  { rate: 1.40, freq: 4,  currency: "USD", payDay: 26, payMonths: [1,4,7,10] },  // quarterly ~26th  // Schwab US Dividend Equity
  // Canadian REITs — monthly distributions
  "REI.UN.TO": { rate: 0.88, freq: 12, currency: "CAD" },  // RioCan
  "REI.UN":    { rate: 0.88, freq: 12, currency: "CAD", payDay:  6 },
  "RIOCF":     { rate: 0.88, freq: 12, currency: "CAD", payDay:  6 },  // RioCan OTC
  "AP.UN.TO":  { rate: 1.44, freq: 12, currency: "CAD" },  // Allied Properties
  "AP.UN":     { rate: 1.44, freq: 12, currency: "CAD" },
  "HR.UN.TO":  { rate: 0.48, freq: 12, currency: "CAD" },  // H&R REIT
  "HR.UN":     { rate: 0.48, freq: 12, currency: "CAD", payDay:  5 },
  "HRUFF":     { rate: 0.48, freq: 12, currency: "CAD", payDay:  5 },  // H&R REIT OTC
  "CAR.UN.TO": { rate: 1.89, freq: 12, currency: "CAD" },  // Canadian Apartment
  "CAR.UN":    { rate: 1.89, freq: 12, currency: "CAD" },
  "CHP.UN.TO": { rate: 0.74, freq: 12, currency: "CAD" },  // Choice Properties
  "CHP.UN":    { rate: 0.74, freq: 12, currency: "CAD" },
  "SRU.UN.TO": { rate: 0.90, freq: 12, currency: "CAD" },  // SmartCentres
  "SRU.UN":    { rate: 0.90, freq: 12, currency: "CAD" },
  "GRT.UN.TO": { rate: 0.90, freq: 12, currency: "CAD" },  // Granite REIT
  "GRT.UN":    { rate: 0.90, freq: 12, currency: "CAD" },
  "NWH.UN.TO": { rate: 0.72, freq: 12, currency: "CAD" },  // NorthWest Healthcare
  "NWH.UN":    { rate: 0.72, freq: 12, currency: "CAD" },
  "CSH.UN.TO": { rate: 0.78, freq: 12, currency: "CAD" },  // Chartwell
  "CSH.UN":    { rate: 0.78, freq: 12, currency: "CAD" },
  "FCR.UN.TO": { rate: 0.81, freq: 12, currency: "CAD" },  // First Capital
  "FCR.UN":    { rate: 0.81, freq: 12, currency: "CAD" },
  "IIP.UN.TO": { rate: 0.90, freq: 12, currency: "CAD" },  // InterRent
  "IIP.UN":    { rate: 0.90, freq: 12, currency: "CAD" },
  "D.UN.TO":   { rate: 1.00, freq: 12, currency: "CAD" },  // Dream Office
  "D.UN":      { rate: 1.00, freq: 12, currency: "CAD" },
  "DIR.UN.TO": { rate: 0.70, freq: 12, currency: "CAD" },  // Dream Industrial
  "DIR.UN":    { rate: 0.70, freq: 12, currency: "CAD" },
  "BEI.UN.TO": { rate: 1.50, freq: 12, currency: "CAD" },  // Boardwalk REIT
  "BEI.UN":    { rate: 1.50, freq: 12, currency: "CAD" },
  "SMU.UN.TO": { rate: 0.51, freq: 12, currency: "CAD" },  // Summit Industrial
  "SMU.UN":    { rate: 0.51, freq: 12, currency: "CAD" },
  "WIR.UN.TO": { rate: 0.72, freq: 12, currency: "CAD" },  // WPT Industrial
  "CRR.UN.TO": { rate: 0.62, freq: 12, currency: "CAD" },  // Crombie REIT
  "CRR.UN":    { rate: 0.62, freq: 12, currency: "CAD" },
  "AX.UN.TO":  { rate: 0.72, freq: 12, currency: "CAD" },  // Artis REIT
  "AX.UN":     { rate: 0.72, freq: 12, currency: "CAD" },
  "PLZ.UN.TO": { rate: 0.60, freq: 12, currency: "CAD" },  // Plaza Retail
  "PLZ.UN":    { rate: 0.60, freq: 12, currency: "CAD" },
  "TNT.UN.TO": { rate: 0.48, freq: 12, currency: "CAD" },  // True North Commercial
  "TNT.UN":    { rate: 0.48, freq: 12, currency: "CAD" },
  "SOT.UN.TO": { rate: 0.96, freq: 12, currency: "CAD" },  // Slate Office
  "SOT.UN":    { rate: 0.96, freq: 12, currency: "CAD" },
  "KMP.UN.TO": { rate: 0.84, freq: 12, currency: "CAD" },  // Killam Apartment
  "KMP.UN":    { rate: 0.84, freq: 12, currency: "CAD" },
  "PRV.UN.TO": { rate: 0.72, freq: 12, currency: "CAD" },  // Pro REIT
  "PRV.UN":    { rate: 0.72, freq: 12, currency: "CAD" },
  "MRT.UN.TO": { rate: 0.60, freq: 12, currency: "CAD" },  // Morguard REIT
  "MRT.UN":    { rate: 0.60, freq: 12, currency: "CAD" },
  "BPY.UN.TO": { rate: 1.28, freq: 4,  currency: "CAD" },  // Brookfield Property
  "BPY.UN":    { rate: 1.28, freq: 4,  currency: "CAD" },
  // Brookfield infrastructure (quarterly)
  "BIP.UN.TO": { rate: 1.62, freq: 4,  currency: "CAD" },
  "BIP.UN":    { rate: 1.62, freq: 4,  currency: "CAD" },
  "BEP.UN.TO": { rate: 1.50, freq: 4,  currency: "CAD" },
  "BEP.UN":    { rate: 1.50, freq: 4,  currency: "CAD" },
  // US REITs — monthly
  "O":     { rate: 3.24, freq: 12, currency: "USD" },   // Realty Income
  "STAG":  { rate: 1.56, freq: 12, currency: "USD" },   // STAG Industrial
  "MAIN":  { rate: 2.76, freq: 12, currency: "USD" },   // Main Street Capital
  "AGNC":  { rate: 1.44, freq: 12, currency: "USD" },   // AGNC Investment
  "NNN":   { rate: 2.28, freq: 4,  currency: "USD" },   // National Retail (quarterly)
  "WPC":   { rate: 4.48, freq: 4,  currency: "USD" },   // W. P. Carey
  "VTR":   { rate: 1.80, freq: 4,  currency: "USD" },   // Ventas
  "SPG":   { rate: 8.40, freq: 4,  currency: "USD" },   // Simon Property Group
  "PSA":   { rate: 12.00,freq: 4,  currency: "USD" },   // Public Storage
  "EQR":   { rate: 2.56, freq: 4,  currency: "USD" },   // Equity Residential
  "AVB":   { rate: 6.80, freq: 4,  currency: "USD" },   // AvalonBay
  "PLD":   { rate: 3.76, freq: 4,  currency: "USD" },   // Prologis
  "AMT":   { rate: 6.48, freq: 4,  currency: "USD" },   // American Tower
  "CCI":   { rate: 4.72, freq: 4,  currency: "USD" },   // Crown Castle
  "WELL":  { rate: 2.44, freq: 4,  currency: "USD" },   // Welltower
  "DLR":   { rate: 4.88, freq: 4,  currency: "USD" },   // Digital Realty
  "EQIX":  { rate: 16.00,freq: 4,  currency: "USD" },   // Equinix
  "IRM":   { rate: 4.92, freq: 4,  currency: "USD" },   // Iron Mountain
  "VICI":  { rate: 1.72, freq: 4,  currency: "USD" },   // VICI Properties
  "MPW":   { rate: 0.60, freq: 4,  currency: "USD" },   // Medical Properties
  "IIPR":  { rate: 7.40, freq: 4,  currency: "USD" },   // Innovative Industrial
  // Canadian diversified
  "ATD.TO":  { rate: 0.56, freq: 4,  currency: "CAD", payMonths: [1, 4, 7, 10] },
  "MRU.TO":  { rate: 0.94, freq: 4,  currency: "CAD" },
  "L.TO":    { rate: 1.68, freq: 4,  currency: "CAD" },
  "WN.TO":   { rate: 1.20, freq: 4,  currency: "CAD" },
  "POW.TO":  { rate: 2.40, freq: 4,  currency: "CAD" },
  "SU.TO":   { rate: 2.20, freq: 4, currency: "CAD", payDay: 25, payMonths: [3,6,9,12] },
  "CNQ.TO":  { rate: 4.00, freq: 4, currency: "CAD", payDay: 15, payMonths: [1,4,7,10] },
};

// ── Fetch from Yahoo Finance v8 chart ─────────────────────────────
async function fetchFromYahoo(symbol, stock = {}) {
  const { toYahooTicker } = await import("./tickerUtils")
  const yahooTicker = toYahooTicker(symbol, stock)
  for (const proxy of PROXIES) {
    try {
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1d&range=1y`;
      const res = await fetch(`${proxy}${encodeURIComponent(url)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) continue;

      const price = meta.regularMarketPrice;
      // trailingAnnualDividendRate is $ per share per year
      const rate  = meta.trailingAnnualDividendRate;
      const yld   = meta.trailingAnnualDividendYield ?? meta.dividendYield;

      if (rate && rate > 0) {
        return {
          annualRatePerShare: rate,
          yieldDecimal: yld ?? (price ? rate / price : null),
          price,
          source: "yahoo",
        };
      }
      // Even if rate is 0/null, return what we have for non-dividend stocks
      return { annualRatePerShare: 0, yieldDecimal: 0, price, source: "yahoo_nodiv" };
    } catch { /* try next */ }
  }
  return null;
}

// ── Ask Groq for dividend data ─────────────────────────────────────
const GROQ_KEY = "groq_api_key";
async function fetchFromGroq(symbols) {
  const key = localStorage.getItem(GROQ_KEY);
  if (!key) return {};
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 500,
        temperature: 0.1,
        messages: [{
          role: "system",
          content: "You are a financial data assistant. Respond ONLY with valid JSON. No markdown, no explanation.",
        }, {
          role: "user",
          content: `For these stock symbols: ${symbols.join(", ")}
Give the current annual dividend per share in the stock's native currency and payment frequency.
Respond with ONLY a JSON object like:
{"AAPL": {"annualRate": 1.00, "frequency": 4, "currency": "USD"}, "TD.TO": {"annualRate": 4.08, "frequency": 4, "currency": "CAD"}}
Use frequency: 12=monthly, 4=quarterly, 2=semi-annual, 1=annual. Use 0 if no dividend.`,
        }],
      }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    return JSON.parse(match[0]);
  } catch { return {}; }
}

// ── Main export: get dividend info for a stock ─────────────────────
// Returns { annualRatePerShare, yieldDecimal, frequency, source }
// ── Quick lookup: get payMonths + payDay for a symbol (no network) ─
export function getPaySchedule(symbol) {
  const sym = (symbol || "").toUpperCase()
  const known = KNOWN_DIVIDENDS[sym]
    || KNOWN_DIVIDENDS[sym + ".TO"]
    || KNOWN_DIVIDENDS[sym + ".UN.TO"]
    || KNOWN_DIVIDENDS[sym + ".UN"]
    || KNOWN_DIVIDENDS[sym.replace(/\.TO$/, "")]
    || KNOWN_DIVIDENDS[sym.replace(/\.UN\.TO$/, "")]
    || KNOWN_DIVIDENDS[sym.replace(/\.UN$/, "")]
  if (!known) return { payMonths: null, payDay: null, frequency: 4 }
  return {
    payMonths: known.payMonths || null,
    payDay:    known.payDay    || null,
    payDow:    known.payDow    || null,
    frequency: known.freq      || 4,
  }
}

export async function getDividendData(symbol, shares, avgCost, stock = {}) {
  // 1. Check hardcoded table — try plain symbol first, then with .TO suffix
  const sym = symbol.toUpperCase()
  const known = KNOWN_DIVIDENDS[sym]
    || KNOWN_DIVIDENDS[sym + ".TO"]
    || KNOWN_DIVIDENDS[sym + ".UN.TO"]
    || KNOWN_DIVIDENDS[sym + ".UN"]
    || KNOWN_DIVIDENDS[sym.replace(/\.TO$/, "")]
    || KNOWN_DIVIDENDS[sym.replace(/\.UN\.TO$/, "")]
    || KNOWN_DIVIDENDS[sym.replace(/\.UN$/, "")]
  if (known && known.rate > 0) {
    const annualTotal = known.rate * shares;
    const yieldDecimal = avgCost > 0 ? known.rate / avgCost : 0;
    return {
      annualRatePerShare: known.rate,
      annualTotal,
      payDay:    known.payDay    || null,   // day of month (1-31)
      payDow:    known.payDow    || null,   // day of week (0=Sun,5=Fri)
      payMonths: known.payMonths || null,   // array of months [1..12] they pay
      yieldDecimal,
      yieldPct: yieldDecimal * 100,
      frequency: known.freq,
      source: "hardcoded",
    };
  }

  // 2. Try Yahoo Finance v8 chart
  const yahoo = await fetchFromYahoo(symbol, stock);
  if (yahoo && yahoo.annualRatePerShare > 0) {
    return {
      annualRatePerShare: yahoo.annualRatePerShare,
      annualTotal: yahoo.annualRatePerShare * shares,
      yieldDecimal: yahoo.yieldDecimal,
      yieldPct: yahoo.yieldDecimal ? yahoo.yieldDecimal * 100 : 0,
      frequency: 4, // default quarterly if Yahoo doesn't specify
      source: "yahoo",
    };
  }

  // 3. If Yahoo returned nothing useful, return null (no dividend or data unavailable)
  return null;
}

// ── Batch fetch for multiple symbols using Groq as fallback ───────
export async function getDividendDataBatch(stocks) {
  const results = {};
  const needsGroq = [];

  for (const stock of stocks) {
    const data = await getDividendData(stock.symbol, stock.shares, stock.avg_cost, stock);
    if (data) {
      results[stock.id] = data;
    } else {
      needsGroq.push(stock);
    }
  }

  // For unknowns, try Groq in one batch call
  if (needsGroq.length > 0) {
    const groqData = await fetchFromGroq(needsGroq.map(s => s.symbol));
    for (const stock of needsGroq) {
      const g = groqData[stock.symbol.toUpperCase()] || groqData[stock.symbol];
      if (g && g.annualRate > 0) {
        const annual = g.annualRate * stock.shares;
        const yieldD = stock.avg_cost > 0 ? g.annualRate / stock.avg_cost : 0;
        results[stock.id] = {
          annualRatePerShare: g.annualRate,
          annualTotal: annual,
          yieldDecimal: yieldD,
          yieldPct: yieldD * 100,
          frequency: g.frequency || 4,
          source: "groq",
        };
      }
    }
  }

  return results;
}
