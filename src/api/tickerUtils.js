/**
 * Converts stored ticker symbols to Yahoo Finance format.
 *
 * Problem: stocks are stored as plain symbols (TD, ENB, SHOP) but Yahoo Finance
 * needs exchange suffixes for non-US stocks:
 *   TD    → TD.TO      (TSX)
 *   ENB   → ENB.TO     (TSX)
 *   BBD.A → BBD-A.TO   (TSX — dots become dashes)
 *   PWR   → PWR.CN     (CSE/CNSX)
 *   XIC   → XIC.TO     (TSX ETF)
 *   NVDA  → NVDA       (NASDAQ — no suffix needed)
 *
 * We determine the correct suffix from:
 *   1. The stock's `market` field (set from exchange prefix during import)
 *   2. The stock's `currency` field (CAD = likely TSX)
 *   3. A hardcoded known-ticker list for common cases
 */

// Known TSX tickers (no suffix stored, need .TO)
// Covers the most common Canadian stocks
const TSX_KNOWN = new Set([
  "TD","RY","BNS","BMO","CM","NA","MFC","SLF","GWO","IAG","IFC",
  "ENB","TRP","CNQ","SU","CVE","IMO","MEG","ARX","WCP","BTE","ERF","PEY","TVE","CPG",
  "CNR","CP","TIH","WFT","CAE","ABX","AEM","AGI","AUY","K","KL","OGC",
  "ATD","DOL","CTC","CTC.A","MRU","L","EMP.A","SAP","GIL","CCL.B",
  "BCE","T","RCI.B","QBR.B","SJR.B","MBT",
  "FTS","ALA","EMA","NPI","INE","CPX","H","BEP.UN","BIP.UN",
  "WN","BAM","BN","BPY.UN","BPY","BPO",
  "WPM","LUN","CS","CQR.UN","AP.UN","SRU.UN","REI.UN","HR.UN","CAR.UN","CHP.UN",
  "XIC","XEI","XIU","VFV","XSP","ZWB","ZWC","HDIV","HYLD","HMAX","HDIF",
  "XEC","XEF","XUS","XEQT","XGRO","XBAL","ZEQT","VCN","VXC","VAB",
  "MSTE","HHIS","SOBO","RY","SU","CNQ","FTS","CU","SHOP","DOL","MFC",
  "BBD.A","BBD.B","TRP","ENB","TD","BNS","CNR","CP","RY","SOBO",
  "PWR","XETM","VFV","XIC","HMAX",
])

// Known TSX Venture tickers → .V suffix
const TSXV_KNOWN = new Set(["GRB","CYM","PWR"])

// Exchange prefix → Yahoo suffix mapping
const EXCHANGE_TO_SUFFIX = {
  // Canadian exchanges → .TO
  "TSE":     ".TO",
  "TSX":     ".TO",
  "TOR":     ".TO",
  // CSE (Canadian Securities Exchange) → .CN
  "CNSX":    ".CN",
  "CSE":     ".CN",
  // TSX Venture → .V  (CVE is the TSX Venture exchange code, not CSE)
  "TSXV":    ".V",
  "TSX-V":   ".V",
  "TSX_V":   ".V",
  "VENTURE": ".V",
  "CVE":     ".V",
  // NEO Exchange → .NE
  "NEO":     ".NE",
  // OTC / Pink sheets (US, no suffix needed)
  "OTCMKTS": "",
  "OTCPK":   "",
  "OTCQX":   "",
  "OTCQB":   "",
  "OTC":     "",
  "PINK":    "",
  // US exchanges (no suffix)
  "NYSE":    "",
  "NASDAQ":  "",
  "NYSEARCA":"",
  "NYSEAMERICAN": "",
  "AMEX":    "",
  "BATS":    "",
  "CBOE":    "",
  "IEX":     "",
  // International (already have Yahoo suffixes if needed)
  "LSE":     ".L",
  "LON":     ".L",
  "FRA":     ".F",
  "ETR":     ".DE",
  "EPA":     ".PA",
  "AMS":     ".AS",
  "STO":     ".ST",
  "CPH":     ".CO",
}

/**
 * Convert a stored symbol + stock metadata to the Yahoo Finance ticker format.
 * 
 * @param {string} symbol - stored symbol e.g. "TD", "ENB", "NVDA", "BBD.A"
 * @param {object} stock  - stock record with .market, .currency, .account_type
 * @returns {string}      - Yahoo Finance ticker e.g. "TD.TO", "ENB.TO", "NVDA"
 */
export function toYahooTicker(symbol, stock = {}) {
  if (!symbol) return symbol
  const sym = symbol.trim().toUpperCase()

  // 0. Crypto pairs — pass through as-is (e.g. BTC-CAD, ETH-CAD, BTC-USD)
  if (/^(BTC|ETH|SOL|ADA|XRP|DOGE|DOT|AVAX|MATIC|LTC)-(CAD|USD|EUR)$/.test(sym)) {
    return sym
  }
  if (stock.market === "CRYPTO" || stock.sector === "Crypto" || stock.sector === "Cryptocurrency") {
    return sym  // pass through crypto tickers unchanged
  }

  // 1. Already has a Yahoo suffix — return as-is
  if (sym.endsWith(".TO") || sym.endsWith(".V") || sym.endsWith(".CN") ||
      sym.endsWith(".NE") || sym.endsWith(".L") || sym.endsWith(".F") ||
      sym.endsWith(".DE") || sym.endsWith(".PA") || sym.endsWith(".AS")) {
    return sym
  }

  // 2. Use market field set during import (e.g. "TSE", "NASDAQ", "NYSE")
  const market = (stock.market || "").trim().toUpperCase()
  if (market && EXCHANGE_TO_SUFFIX[market] !== undefined) {
    const suffix = EXCHANGE_TO_SUFFIX[market]
    if (suffix) {
      // TSX special: dots in ticker become dashes (BBD.A → BBD-A.TO)
      const cleanSym = suffix === ".TO" ? sym.replace(/\./g, "-") : sym
      return cleanSym + suffix
    }
    return sym  // US exchange, no suffix
  }

  // 3. Currency is CAD → likely TSX
  if (stock.currency === "CAD") {
    // CSE tickers (usually very short or in known CSE list)
    // TSX Venture tickers
    if (TSXV_KNOWN.has(sym)) return sym + ".V"
    // TSX
    const cleanSym = sym.replace(/\./g, "-")
    return cleanSym + ".TO"
  }

  // 4. Known TSX ticker list
  if (TSX_KNOWN.has(sym)) {
    const cleanSym = sym.replace(/\./g, "-")
    return cleanSym + ".TO"
  }

  // 5. Default: return as-is (assume US)
  return sym
}

/**
 * Convert back from Yahoo ticker to display symbol (strip suffixes).
 */
export function fromYahooTicker(yahooSymbol) {
  return (yahooSymbol || "")
    .replace(/\.TO$/, "")
    .replace(/\.V$/, "")
    .replace(/\.CN$/, "")
    .replace(/\.NE$/, "")
    .replace(/\.L$/, "")
    .replace(/\.F$/, "")
    .replace(/\.DE$/, "")
    // Restore dashes back to dots for display (BBD-A → BBD.A)
    .replace(/-([A-Z])$/, ".$1")
}
