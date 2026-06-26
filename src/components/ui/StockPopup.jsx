import { useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import StockDetailPanel from "@/components/portfolio/StockDetailPanel"

// Known ticker → domain for Google favicon fallback
const DOMAINS = {
  AAPL:"apple.com", MSFT:"microsoft.com", GOOGL:"google.com", GOOG:"google.com",
  AMZN:"amazon.com", META:"meta.com", NVDA:"nvidia.com", TSLA:"tesla.com",
  NFLX:"netflix.com", SHOP:"shopify.com", AMD:"amd.com", INTC:"intel.com",
  AVGO:"broadcom.com", ORCL:"oracle.com", CRM:"salesforce.com", ADBE:"adobe.com",
  COST:"costco.com", WMT:"walmart.com", HD:"homedepot.com",
  DIS:"thewaltdisneycompany.com", JPM:"jpmorganchase.com", BAC:"bankofamerica.com",
  V:"visa.com", MA:"mastercard.com", JNJ:"jnj.com", PFE:"pfizer.com",
  ABBV:"abbvie.com", LLY:"lilly.com", AZN:"astrazeneca.com",
  XOM:"exxonmobil.com", CVX:"chevron.com", KO:"coca-cola.com", PEP:"pepsico.com",
  T:"att.com", VZ:"verizon.com", PLTR:"palantir.com", PANW:"paloaltonetworks.com",
  PYPL:"paypal.com", UBER:"uber.com",
  // Canadian
  TD:"td.com", RY:"rbc.com", BMO:"bmo.com", BNS:"scotiabank.com",
  CM:"cibc.com", NA:"bnc.ca", ENB:"enbridge.com", TRP:"tc.ca",
  CNQ:"cnq.ca", SU:"suncor.com", CVE:"cenovus.com", CNR:"cn.ca",
  CP:"cpr.ca", BCE:"bce.ca", MFC:"manulife.com", SLF:"sunlife.com",
  IFC:"intactfc.com", FTS:"fortis.ca", EMA:"emera.com",
  ATD:"couche-tard.com", DOL:"dollarama.com", MRU:"metro.ca",
  L:"loblaw.ca", ABX:"barrick.com", AEM:"agnicoeagle.com",
  WPM:"wheaton.com", BN:"brookfield.com", BAM:"brookfield.com",
  CU:"canadianutilities.com", RTX:"rtx.com",
  // ETF providers
  SCHD:"schwab.com", JEPI:"jpmorganchase.com", JEPQ:"jpmorganchase.com",
  HDIV:"hamiltonetfs.com", HYLD:"hamiltonetfs.com", HMAX:"hamiltonetfs.com",
  HHIS:"harvestportfolios.com", MSTE:"harvestportfolios.com",
  QDTE:"roundhillinvestments.com", XDTE:"roundhillinvestments.com",
  YMAX:"roundhillinvestments.com",
}

function baseSym(symbol) {
  return (symbol || "").toUpperCase()
    .replace(/\.TO$/, "").replace(/\.V$/, "").replace(/\.CN$/, "")
    .replace(/\.NE$/, "").replace(/\.L$/, "").replace(/-[A-Z]$/, "")
}

// Build ordered list of logo URLs to try
function getLogoSources(symbol, name) {
  const base   = baseSym(symbol)
  const domain = DOMAINS[base]
  const sources = []

  // 1. Financial Modeling Prep — free, no key, broad ticker coverage
  sources.push(`https://financialmodelingprep.com/image-stock/${base}.png`)

  // 2. Clearbit with known domain — high quality for major companies
  if (domain) {
    sources.push(`https://logo.clearbit.com/${domain}`)
  }

  // 3. Google favicon with known domain — very reliable, never 404
  if (domain) {
    sources.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`)
  }

  // 4. Clearbit guessed from company name
  if (!domain && name) {
    const cleaned = (name || "")
      .toLowerCase()
      .replace(/\s+(inc\.?|corp\.?|ltd\.?|lp\.?|trust|reit|group|holdings?|technologies?|financial|services?|energy|resources?|bank|communications?|properties|realty|etf|fund)\.*\s*$/g, "")
      .replace(/[^a-z0-9]/g, "").trim()
    if (cleaned) sources.push(`https://logo.clearbit.com/${cleaned}.com`)
  }

  return sources
}

const COLORS = ["#1e40af","#065f46","#7c2d12","#4c1d95","#831843","#134e4a","#1e3a5f","#92400e"]

export function StockLogo({ symbol, name, size = 34 }) {
  const [stage, setStage] = useState(0)
  const sources = getLogoSources(symbol, name)
  const base    = baseSym(symbol)
  const letter  = base.slice(0, 2) || "??"
  const ci      = (letter.charCodeAt(0) + (letter.charCodeAt(1) || 0)) % COLORS.length

  if (stage >= sources.length) {
    return (
      <div
        className="rounded flex items-center justify-center text-white font-bold flex-shrink-0 select-none"
        style={{ width: size, height: size, fontSize: size * 0.36, background: COLORS[ci], lineHeight: 1 }}
      >
        {letter}
      </div>
    )
  }

  return (
    <img
      src={sources[stage]}
      alt={symbol}
      className="rounded object-contain flex-shrink-0 bg-white border border-gray-100"
      style={{ width: size, height: size }}
      onError={() => setStage(s => s + 1)}
    />
  )
}

export function StockLogoButton({ symbol, name, size = 34, stock = null, quote = null }) {
  const [open, setOpen] = useState(false)
  const fakeStock = stock ?? { symbol, name, shares: 0, avg_cost: 0, currency: "USD" }
  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setOpen(true) }}
        className="flex-shrink-0 rounded hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 transition-all"
        title={`View ${symbol} details`}
      >
        <StockLogo symbol={symbol} name={name} size={size} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          <StockDetailPanel stock={fakeStock} quote={quote} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}
