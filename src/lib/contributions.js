// Single source of truth for "yearly contributions" used across Dashboard,
// PortfolioPerformanceChart, and YearOverYear.
//
// Contributions = ONLY manual cash Deposit/Withdraw actions (logged via
// CashModal → recordCashContribution). Buying/selling stocks and receiving
// dividends move cash around too, but that's money already inside the
// portfolio — it must never be counted as a new contribution.
//
// CONTRIB_BASE is a manually-reconciled checkpoint covering everything
// contributed before the contribution log existed: "as of this date, total
// new money contributed this year was this amount." After that date, only
// logged cash-contribution entries are added on top.
//
// Every Jan 1, the base resets to $0 automatically (no manual edit needed).
export const CONTRIB_BASE = { amount: 23520, asOf: "2026-08-03" }

/**
 * @param {Array} cashContributions - entries from CashContribution.list() /
 *   getAll("cashContributions"): { date, account_type, currency, amount }
 *   where amount is signed (deposit = positive, withdrawal = negative)
 * @param {(amount:number, currency:string)=>number} toDisplay - currency converter
 * @param {number} [forYear] - defaults to current year
 */
export function getYearContributions(cashContributions, toDisplay, forYear = new Date().getFullYear()) {
  const asOfDate = new Date(CONTRIB_BASE.asOf)
  const asOfYear = asOfDate.getFullYear()

  let base, cutoff
  if (forYear === asOfYear) {
    // Same year as the manual checkpoint: start from the reconciled base,
    // only count logged contributions strictly after the checkpoint date.
    base = CONTRIB_BASE.amount
    cutoff = asOfDate
  } else {
    // Different year (past or future relative to the checkpoint): no
    // checkpoint applies, so start from zero and count the whole year.
    base = 0
    cutoff = new Date(forYear, 0, 1)
  }

  let total = base
  ;(cashContributions || []).forEach(c => {
    const d = new Date(c.date)
    if (d.getFullYear() !== forYear) return
    if (d <= cutoff) return
    total += toDisplay(c.amount || 0, c.currency || "CAD")
  })
  return total
}

