/**
 * Stock logo sources (tried in order):
 * 1. Hardcoded known domains  → Clearbit (most reliable for major stocks)
 * 2. Yahoo Finance logo CDN   → works for most US + Canadian stocks
 * 3. Logo.dev API             → broad coverage, no auth needed
 * 4. Clearbit name-derived    → guesses domain from company name
 * 5. Google favicon           → last resort
 * 6. Colored letter tile      → always works
 */

// Strip exchange suffixes to get base ticker
function baseTicker(symbol) {
  return (symbol || "")
    .replace(/\.TO$/i, "")
    .replace(/\.V$/i,  "")
    .replace(/\.CN$/i, "")
    .replace(/\.NE$/i, "")
    .replace(/\.L$/i,  "")
    .replace(/-([A-Z])$/, ".$1")  // BBD-A → BBD.A display
    .toUpperCase()
}

// Known ticker → domain mappings
const KNOWN_DOMAINS = {
  // US mega-cap
  AAPL:"apple.com", MSFT:"microsoft.com", GOOGL:"google.com", GOOG:"google.com",
  AMZN:"amazon.com", META:"meta.com", NVDA:"nvidia.com", TSLA:"tesla.com",
  NFLX:"netflix.com", PYPL:"paypal.com", UBER:"uber.com", ABNB:"airbnb.com",
  AMD:"amd.com", INTC:"intel.com", QCOM:"qualcomm.com", AVGO:"broadcom.com",
  ORCL:"oracle.com", CRM:"salesforce.com", ADBE:"adobe.com", NOW:"servicenow.com",
  COST:"costco.com", WMT:"walmart.com", HD:"homedepot.com", TGT:"target.com",
  DIS:"thewaltdisneycompany.com", CMCSA:"comcast.com",
  JPM:"jpmorganchase.com", BAC:"bankofamerica.com", WFC:"wellsfargo.com",
  GS:"goldmansachs.com", MS:"morganstanley.com", C:"citigroup.com",
  V:"visa.com", MA:"mastercard.com", AXP:"americanexpress.com",
  JNJ:"jnj.com", PFE:"pfizer.com", MRK:"merck.com", ABBV:"abbvie.com",
  LLY:"lilly.com", BMY:"bms.com", AMGN:"amgen.com", GILD:"gilead.com",
  AZN:"astrazeneca.com",
  XOM:"exxonmobil.com", CVX:"chevron.com", COP:"conocophillips.com",
  KO:"coca-cola.com", PEP:"pepsico.com", MCD:"mcdonalds.com",
  SBUX:"starbucks.com", NKE:"nike.com", PG:"pg.com",
  T:"att.com", VZ:"verizon.com",
  PLTR:"palantir.com", PANW:"paloaltonetworks.com",
  GOOGL:"abc.xyz",
  // Canadian banks
  TD:"td.com", RY:"rbc.com", BMO:"bmo.com", BNS:"scotiabank.com",
  CM:"cibc.com", NA:"bnc.ca",
  // Canadian energy
  ENB:"enbridge.com", TRP:"tc.ca", CNQ:"cnq.ca", SU:"suncor.com",
  CVE:"cenovus.com", IMO:"imperialoil.ca",
  // Canadian rail/transport
  CNR:"cn.ca", CP:"cpr.ca",
  // Canadian telecom
  BCE:"bce.ca", RCI:"rogers.com",
  // Canadian insurance/finance
  MFC:"manulife.com", SLF:"sunlife.com", GWO:"greatwestlifeco.com",
  IFC:"intactfc.com",
  // Canadian utilities
  FTS:"fortis.ca", EMA:"emera.com", AQN:"algonquinpowerutilities.com",
  H:"hydro.one", CU:"canadianutilities.com",
  // Canadian retail/consumer
  ATD:"couche-tard.com", DOL:"dollarama.com", MRU:"metro.ca",
  L:"loblaw.ca", WN:"weston.ca", EMP:"empireco.ca",
  // Canadian tech
  SHOP:"shopify.com", BB:"blackberry.com", OTEX:"opentext.com",
  // Canadian mining/materials
  ABX:"barrick.com", AEM:"agnicoeagle.com", WPM:"wheaton.com",
  // Canadian misc
  BN:"brookfield.com", BAM:"brookfield.com",
  // ETF providers (use issuer logo)
  XIU:"blackrock.com", XIC:"blackrock.com", XEF:"blackrock.com",
  XUS:"blackrock.com", XEQT:"blackrock.com", XGRO:"blackrock.com",
  VFV:"vanguard.ca", VCN:"vanguard.ca", VXC:"vanguard.ca",
  ZWB:"bmo.com", ZWC:"bmo.com", ZAG:"bmo.com",
  SCHD:"schwab.com", JEPI:"jpmorganchase.com", JEPQ:"jpmorganchase.com",
  QDTE:"roundhillinvestments.com", XDTE:"roundhillinvestments.com",
  YMAX:"roundhillinvestments.com",
  HDIV:"hamiltonetfs.com", HYLD:"hamiltonetfs.com", HMAX:"hamiltonetfs.com",
  HHIS:"harvestportfolios.com", MSTE:"harvestportfolios.com",
}

// Yahoo Finance logo CDN — very broad coverage, handles TSX stocks well
export function getYahooLogoUrl(symbol) {
  const base = baseTicker(symbol).toLowerCase()
  return `https://s.yimg.com/lb/brands/150x150/brand-${base}-150x150-2x.png`
}

// Logo.dev — broad coverage, no API key needed for basic use
export function getLogoDevUrl(symbol, name) {
  const domain = KNOWN_DOMAINS[baseTicker(symbol)]
  if (domain) return `https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6BeQ&size=80`
  // Try to derive domain from name
  const cleaned = (name || "")
    .toLowerCase()
    .replace(/\s+(inc\.?|corp\.?|ltd\.?|co\.?|plc|lp\.?|trust|reit|group|holdings?|technologies?|financial|services?|energy|resources?|bank|communications?|properties|realty|property)\.*\s*$/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim()
  return cleaned ? `https://img.logo.dev/${cleaned}.com?token=pk_X-1ZO13GSgeOoUrIuJ6BeQ&size=80` : null
}

// Clearbit — good for well-known companies
export function getClearbitUrl(symbol, name) {
  const domain = KNOWN_DOMAINS[baseTicker(symbol)]
  if (domain) return `https://logo.clearbit.com/${domain}`
  const cleaned = (name || "")
    .toLowerCase()
    .replace(/\s+(inc\.?|corp\.?|ltd\.?|co\.?|plc|lp\.?|trust|reit|group|holdings?|technologies?|financial|services?|energy|resources?|bank|communications?|properties|realty|property)\.*\s*$/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim()
  return cleaned ? `https://logo.clearbit.com/${cleaned}.com` : null
}

// Google favicon
export function getGoogleFaviconUrl(symbol, name) {
  const domain = KNOWN_DOMAINS[baseTicker(symbol)]
  if (domain) return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  return null
}

// Letter + color fallback
export function getLetterFallback(symbol) {
  return baseTicker(symbol).slice(0, 2).toUpperCase()
}
