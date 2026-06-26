// Pre-extracted stocks from Roch_TD_and_MD1.ods — Active Trades tab
// Run importSpreadsheetStocks() to load all stocks into the app

import { Stock, Transaction } from "@/api/localData"

function cleanTicker(raw) {
  if (!raw) return ""
  // Remove exchange prefix: TSE: NASDAQ: NYSE: etc.
  const t = raw.trim().toUpperCase()
  const idx = t.indexOf(":")
  return idx >= 0 ? t.slice(idx + 1).trim() : t
}

function cleanPrice(raw) {
  if (!raw) return 0
  const n = parseFloat(String(raw).replace(/[$,%\s]/g, ""))
  return isNaN(n) ? 0 : n
}

function cleanShares(raw) {
  if (!raw) return 0
  // Handle "split 1:4 on aug 28 2020 -Roch Boucher 20" → take last number
  const s = String(raw).trim()
  const nums = s.match(/[\d.]+/g)
  if (!nums) return 0
  const n = parseFloat(nums[nums.length - 1])
  return isNaN(n) ? 0 : n
}

function normalizeAccount(raw) {
  const s = (raw || "").trim().toUpperCase()
  if (s === "TSFA" || s === "TFSA") return "TFSA"
  if (s === "RRSP" || s === "RRSPP") return "RRSP"
  if (s === "CUR") return "CUR"
  return s || "RRSP"
}

// All stocks from Active Trades sheet — cleaned and ready
export const SPREADSHEET_STOCKS = [
  { raw:"TSE:TRp",        symbol:"TRP",   account:"RRSP", sector:"Energy",                currency:"CAD", name:"TC Pipelines LP",                         shares:20,       avg_cost:53.38,  date:"2018-02-22" },
  { raw:"TSE:XIC",        symbol:"XIC",   account:"RRSP", sector:"ETF",                   currency:"CAD", name:"iShares Core S&P/TSX Capped Composite",   shares:160,      avg_cost:30.52,  date:"2021-10-20" },
  { raw:"TSE:VFV",        symbol:"VFV",   account:"RRSP", sector:"ETF",                   currency:"CAD", name:"Vanguard S&P 500 Index ETF",              shares:39,       avg_cost:188.93, date:"2026-06-19" },
  { raw:"TSE:ENb",        symbol:"ENB",   account:"RRSP", sector:"Energy",                currency:"CAD", name:"Enbridge Inc",                            shares:30,       avg_cost:40.29,  date:"2020-04-22" },
  { raw:"TSE:TD",         symbol:"TD",    account:"RRSP", sector:"Financial Services",    currency:"CAD", name:"Toronto-Dominion Bank",                   shares:95,       avg_cost:67.81,  date:"2020-04-22" },
  { raw:"TSE:MFC",        symbol:"MFC",   account:"RRSP", sector:"Financial Services",    currency:"CAD", name:"Manulife Financial Corp",                 shares:50,       avg_cost:28.43,  date:"2021-08-22" },
  { raw:"OTCMKTS:HRUFF",  symbol:"HRUFF", account:"RRSP", sector:"Real Estate",           currency:"CAD", name:"H&R REIT",                                shares:35,       avg_cost:9.20,   date:"2020-04-22" },
  { raw:"OTCMKTS:RIOCF",  symbol:"RIOCF", account:"RRSP", sector:"Real Estate",           currency:"CAD", name:"RioCan REIT",                             shares:58,       avg_cost:18.53,  date:"2021-02-23" },
  { raw:"TSE:BBD.A",      symbol:"BBD.A", account:"RRSP", sector:"Transportation",        currency:"CAD", name:"Bombardier Inc Class A",                  shares:8,        avg_cost:151.64, date:"2025-06-24" },
  { raw:"CNSX:PWR",       symbol:"PWR",   account:"RRSP", sector:"Other",                 currency:"CAD", name:"Captiva Verde Wellness Corp",             shares:14000,    avg_cost:0.05,   date:"2026-03-11" },
  { raw:"CNSX:PWR",       symbol:"PWR",   account:"TFSA", sector:"Other",                 currency:"CAD", name:"Captiva Verde Wellness Corp",             shares:8000,     avg_cost:0.05,   date:"2026-03-11" },
  { raw:"TSE:CNR",        symbol:"CNR",   account:"RRSP", sector:"Transportation",        currency:"CAD", name:"Canadian National Railway",               shares:10,       avg_cost:162.96, date:"2021-10-20" },
  { raw:"NYSE:BN",        symbol:"BN",    account:"RRSP", sector:"Real Estate",           currency:"CAD", name:"Brookfield Corp",                         shares:15,       avg_cost:49.69,  date:"2021-08-03" },
  { raw:"TSE:SOBO",       symbol:"SOBO",  account:"RRSP", sector:"Energy",                currency:"CAD", name:"South Bow Corp (free shares)",            shares:4,        avg_cost:0.10,   date:"2024-10-02" },
  { raw:"NASDAQ:SETM",    symbol:"SETM",  account:"RRSP", sector:"Technology",            currency:"USD", name:"Sprott Critical Materials ETF",            shares:19,       avg_cost:35.10,  date:"2026-02-04" },
  { raw:"NASDAQ:PLTR",    symbol:"PLTR",  account:"RRSP", sector:"Technology",            currency:"USD", name:"Palantir Technologies Inc",               shares:14,       avg_cost:78.44,  date:"2024-12-27" },
  { raw:"NYSE:XOM",       symbol:"XOM",   account:"RRSP", sector:"Energy",                currency:"USD", name:"Exxon Mobil Corp",                        shares:30,       avg_cost:33.83,  date:"2020-03-20" },
  { raw:"NASDAQ:AMD",     symbol:"AMD",   account:"RRSP", sector:"Technology",            currency:"USD", name:"Advanced Micro Devices Inc",              shares:6,        avg_cost:107.62, date:"2025-02-07" },
  { raw:"NYSE:V",         symbol:"V",     account:"RRSP", sector:"Financial Services",    currency:"USD", name:"Visa Inc",                                shares:5,        avg_cost:164.07, date:"2020-03-30" },
  { raw:"NYSE:LLY",       symbol:"LLY",   account:"RRSP", sector:"Healthcare",            currency:"USD", name:"Eli Lilly And Co",                        shares:3,        avg_cost:528.40, date:"2023-08-11" },
  { raw:"NASDAQ:META",    symbol:"META",  account:"RRSP", sector:"Communication Services",currency:"USD", name:"Meta Platforms Inc",                      shares:5,        avg_cost:170.07, date:"2020-03-31" },
  { raw:"NASDAQ:AVGO",    symbol:"AVGO",  account:"TFSA", sector:"Technology",            currency:"USD", name:"Broadcom Inc",                            shares:5,        avg_cost:180.03, date:"2024-12-06" },
  { raw:"NASDAQ:COST",    symbol:"COST",  account:"RRSP", sector:"Food",                  currency:"USD", name:"Costco Wholesale Corp",                   shares:2,        avg_cost:379.91, date:"2020-12-09" },
  { raw:"NASDAQ:MSFT",    symbol:"MSFT",  account:"RRSP", sector:"Technology",            currency:"USD", name:"Microsoft Corp",                          shares:9,        avg_cost:210.35, date:"2020-04-22" },
  { raw:"NASDAQ:ADBE",    symbol:"ADBE",  account:"RRSP", sector:"Technology",            currency:"USD", name:"Adobe Inc",                               shares:3,        avg_cost:354.63, date:"2025-08-28" },
  { raw:"NYSE:ABBV",      symbol:"ABBV",  account:"RRSP", sector:"Healthcare",            currency:"USD", name:"AbbVie Common Stock",                     shares:10,       avg_cost:108.67, date:"2021-10-20" },
  { raw:"NYSEARCA:SCHD",  symbol:"SCHD",  account:"RRSP", sector:"ETF",                   currency:"USD", name:"Schwab US Dividend Equity ETF",           shares:150,      avg_cost:25.94,  date:"2021-10-20" },
  { raw:"NASDAQ:NFLX",    symbol:"NFLX",  account:"RRSP", sector:"Technology",            currency:"USD", name:"Netflix Inc",                             shares:20,       avg_cost:91.39,  date:"2021-10-20" },
  { raw:"NYSE:MA",        symbol:"MA",    account:"RRSP", sector:"Financial Services",    currency:"USD", name:"Mastercard Inc",                          shares:5,        avg_cost:358.81, date:"2021-10-20" },
  { raw:"NYSE:RTX",       symbol:"RTX",   account:"RRSP", sector:"Defence",               currency:"USD", name:"RTX Corp",                                shares:35,       avg_cost:166.36, date:"2025-06-24" },
  { raw:"NYSEARCA:SHLD",  symbol:"SHLD",  account:"RRSP", sector:"Defence",               currency:"USD", name:"Global X Defense Tech ETF",              shares:50,       avg_cost:64.93,  date:"2025-06-24" },
  { raw:"TSE:MSTE",       symbol:"MSTE",  account:"RRSP", sector:"ETF",                   currency:"CAD", name:"Harvest Strategy Enhanced High Inc ETF",  shares:493.4471, avg_cost:7.39,   date:"2025-09-10" },
  { raw:"NASDAQ:SPCX",    symbol:"SPCX",  account:"RRSP", sector:"Technology",            currency:"USD", name:"Space Exploration Technologies Corp",     shares:3,        avg_cost:135.00, date:"2026-06-15" },
  { raw:"NASDAQ:NVDA",    symbol:"NVDA",  account:"RRSP", sector:"Technology",            currency:"USD", name:"NVIDIA Corp",                             shares:37,       avg_cost:97.97,  date:"2024-02-22" },
  { raw:"TSE:XETM",       symbol:"XETM",  account:"TFSA", sector:"Energy",                currency:"CAD", name:"iShares S&P/TSX Energy Transition ETF",   shares:18,       avg_cost:84.18,  date:"2026-02-04" },
  { raw:"TSE:RY",         symbol:"RY",    account:"TFSA", sector:"Financial Services",    currency:"CAD", name:"Royal Bank of Canada",                    shares:21,       avg_cost:98.80,  date:"2019-08-14" },
  { raw:"TSE:SU",         symbol:"SU",    account:"TFSA", sector:"Energy",                currency:"CAD", name:"Suncor Energy Inc",                       shares:93,       avg_cost:26.95,  date:"2019-02-15" },
  { raw:"OTCMKTS:RIOCF",  symbol:"RIOCF", account:"TFSA", sector:"Real Estate",           currency:"CAD", name:"RioCan REIT",                             shares:5,        avg_cost:17.22,  date:"2020-10-05" },
  { raw:"TSE:FTS",        symbol:"FTS",   account:"TFSA", sector:"Utilities",             currency:"CAD", name:"Fortis Inc",                              shares:16,       avg_cost:51.23,  date:"2020-06-11" },
  { raw:"OTCMKTS:HRUFF",  symbol:"HRUFF", account:"TFSA", sector:"Real Estate",           currency:"CAD", name:"H&R REIT",                                shares:100,      avg_cost:10.37,  date:"2020-06-11" },
  { raw:"TSE:CNQ",        symbol:"CNQ",   account:"TFSA", sector:"Energy",                currency:"CAD", name:"Canadian Natural Resources Ltd",          shares:38,       avg_cost:21.00,  date:"2021-08-31" },
  { raw:"TSE:CU",         symbol:"CU",    account:"TFSA", sector:"Utilities",             currency:"CAD", name:"Canadian Utilities Ltd Class A",          shares:60,       avg_cost:30.65,  date:"2021-03-08" },
  { raw:"TSE:DOL",        symbol:"DOL",   account:"RRSP", sector:"Technology",            currency:"CAD", name:"Dollarama Inc",                           shares:7,        avg_cost:144.65, date:"2024-10-14" },
  { raw:"NASDAQ:MSFT",    symbol:"MSFT",  account:"TFSA", sector:"Technology",            currency:"USD", name:"Microsoft Corp",                          shares:3,        avg_cost:390.85, date:"2026-03-19" },
  { raw:"NASDAQ:CELH",    symbol:"CELH",  account:"TFSA", sector:"Food",                  currency:"CAD", name:"Celsius Holdings Inc",                   shares:50,       avg_cost:42.04,  date:"2026-03-19" },
  { raw:"NYSEARCA:YMAX",  symbol:"YMAX",  account:"RRSP", sector:"ETF",                   currency:"USD", name:"YieldMax Universe Fund of Option Income", shares:100,      avg_cost:10.49,  date:"2025-09-10" },
  { raw:"TSE:HHIS",       symbol:"HHIS",  account:"TFSA", sector:"ETF",                   currency:"CAD", name:"Harvest Diversified High Income ETF",     shares:191.9593, avg_cost:12.09,  date:"2025-09-10" },
  { raw:"TSE:HYLD",       symbol:"HYLD",  account:"TFSA", sector:"ETF",                   currency:"CAD", name:"Hamilton Enhanced US Covered Call ETF",   shares:100,      avg_cost:12.43,  date:"2023-05-01" },
  { raw:"TSE:HDIV",       symbol:"HDIV",  account:"TFSA", sector:"ETF",                   currency:"CAD", name:"Hamilton Enhanced Canadian Covered Call", shares:100,      avg_cost:16.28,  date:"2023-05-01" },
  { raw:"CBOE:MSFT",      symbol:"MSFT",  account:"TFSA", sector:"Technology",            currency:"CAD", name:"Microsoft Corp (CAD)",                    shares:50,       avg_cost:27.66,  date:"2026-03-19" },
  { raw:"TSE:SHOP",       symbol:"SHOP",  account:"TFSA", sector:"Technology",            currency:"CAD", name:"Shopify Inc",                             shares:16,       avg_cost:87.20,  date:"2023-08-30" },
  { raw:"TSE:HMAX",       symbol:"HMAX",  account:"RRSP", sector:"ETF",                   currency:"CAD", name:"Hamilton Canadian Financials Yield Max",  shares:100,      avg_cost:14.91,  date:"2024-12-06" },
  { raw:"NYSE:T",         symbol:"T",     account:"RRSP", sector:"Communication Services",currency:"USD", name:"AT&T Inc",                                shares:35,       avg_cost:31.55,  date:"2019-06-05" },
  { raw:"NASDAQ:PEP",     symbol:"PEP",   account:"TFSA", sector:"Food",                  currency:"USD", name:"PepsiCo Inc",                             shares:20,       avg_cost:128.84, date:"2025-06-25" },
  { raw:"NASDAQ:GOOGL",   symbol:"GOOGL", account:"RRSP", sector:"Technology",            currency:"USD", name:"Alphabet Inc Class A",                    shares:7,        avg_cost:170.42, date:"2024-08-13" },
  { raw:"NASDAQ:AMD",     symbol:"AMD",   account:"TFSA", sector:"Technology",            currency:"USD", name:"Advanced Micro Devices Inc",              shares:9,        avg_cost:53.24,  date:"2020-06-12" },
  { raw:"NASDAQ:AAPL",    symbol:"AAPL",  account:"TFSA", sector:"Technology",            currency:"USD", name:"Apple Inc",                               shares:20,       avg_cost:123.11, date:"2020-08-26" },
  { raw:"NYSE:ABBV",      symbol:"ABBV",  account:"TFSA", sector:"Healthcare",            currency:"USD", name:"AbbVie Common Stock",                     shares:5,        avg_cost:93.50,  date:"2020-08-26" },
  { raw:"NYSE:AZN",       symbol:"AZN",   account:"RRSP", sector:"Healthcare",            currency:"USD", name:"AstraZeneca PLC",                         shares:6,        avg_cost:133.74, date:"2020-08-26" },
  { raw:"NASDAQ:PANW",    symbol:"PANW",  account:"TFSA", sector:"Technology",            currency:"USD", name:"Palo Alto Networks Inc",                  shares:10,       avg_cost:144.49, date:"2024-03-14" },
  { raw:"NASDAQ:AMZN",    symbol:"AMZN",  account:"RRSP", sector:"Retail",                currency:"USD", name:"Amazon.com Inc",                          shares:10,       avg_cost:116.26, date:"2022-10-03" },
  { raw:"BATS:QDTE",      symbol:"QDTE",  account:"RRSP", sector:"ETF",                   currency:"USD", name:"Roundhill Innov-100 0DTE Covered Call",   shares:24.7805,  avg_cost:32.97,  date:"2025-01-28" },
  { raw:"BATS:XDTE",      symbol:"XDTE",  account:"RRSP", sector:"ETF",                   currency:"USD", name:"Roundhill S&P 500 0DTE Covered Call",     shares:24.6228,  avg_cost:42.67,  date:"2025-01-28" },
  { raw:"TSE:XEQT",       symbol:"XEQT",  account:"RRSP", sector:"ETF",                   currency:"USD", name:"iShares Core Equity ETF Portfolio",        shares:25,       avg_cost:40.90,  date:"2026-01-30" },
  { raw:"TSE:XEF",        symbol:"XEF",   account:"RRSP", sector:"ETF",                   currency:"USD", name:"iShares Core MSCI EAFE IMI Index ETF",    shares:30,       avg_cost:48.28,  date:"2026-01-30" },
  { raw:"TSE:XUS",        symbol:"XUS",   account:"RRSP", sector:"ETF",                   currency:"USD", name:"iShares Core S&P 500 Index ETF",          shares:33,       avg_cost:57.83,  date:"2026-01-30" },
  { raw:"CVE:GRB",        symbol:"GRB",   account:"RRSP", sector:"ETF",                   currency:"CAD", name:"Greenbriar Sustainable Living Inc",       shares:25000,    avg_cost:0.40,   date:"2026-02-27" },
  { raw:"TSE:XEQT",       symbol:"XEQT",  account:"RRSP", sector:"ETF",                   currency:"CAD", name:"iShares Core Equity ETF Portfolio",        shares:18,       avg_cost:45.54,  date:"2026-06-19" },
]

export async function importSpreadsheetStocks(onProgress) {
  const existing = await Stock.list()
  const existingKeys = new Set(existing.map(s => `${s.symbol}|${s.account_type}`))

  let added = 0, skipped = 0, total = SPREADSHEET_STOCKS.length

  for (let i = 0; i < SPREADSHEET_STOCKS.length; i++) {
    const row = SPREADSHEET_STOCKS[i]
    onProgress?.({ current: i + 1, total, symbol: row.symbol, account: row.account })

    const key = `${row.symbol}|${row.account}`
    if (existingKeys.has(key)) {
      skipped++
      continue
    }

    // Create the stock
    const stock = await Stock.create({
      symbol:       row.symbol,
      name:         row.name,
      account_type: row.account,
      sector:       row.sector,
      currency:     row.currency,
      shares:       row.shares,
      avg_cost:     row.avg_cost,
      market:       row.raw.split(":")[0].toUpperCase(),
    })

    // Create a buy transaction
    if (row.date && row.avg_cost > 0 && row.shares > 0) {
      await Transaction.create({
        stock_id:     stock.id,
        symbol:       row.symbol,
        type:         "buy",
        shares:       row.shares,
        price:        row.avg_cost,
        account_type: row.account,
        date:         row.date,
      })
    }

    existingKeys.add(key)
    added++
  }

  return { added, skipped, total }
}
