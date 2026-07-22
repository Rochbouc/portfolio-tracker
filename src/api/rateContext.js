// Simple live rate reader - reads from localStorage, no hooks needed
// Rate is saved by the ExchangeRateWidget and refreshPrices in Dashboard
export function getRate() {
  try {
    const saved = JSON.parse(localStorage.getItem("usd_cad_rate_v1"))
    if (saved?.rate && saved.rate > 1.0 && saved.rate < 2.0) return saved.rate
  } catch {}
  return 1.40  // fallback
}

// Keep useRate as alias for components that already import it
import { createContext, useContext } from "react"
export const RateContext = createContext(1.40)
export const useRate = () => useContext(RateContext)
