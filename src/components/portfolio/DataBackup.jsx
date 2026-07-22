import React, { useRef } from "react"
import { exportAllData, importAllData } from "@/api/localData"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, Upload, AlertTriangle } from "lucide-react"
export default function DataBackup({ onRestored, stocks = [], prices = {} }) {
  function exportStocks() {
    // Merge live prices into each stock record before exporting
    const enriched = stocks.map(s => ({
      ...s,
      current_price: prices[s.symbol]?.price ?? s.current_price ?? s.avg_cost,
      market_value:  (prices[s.symbol]?.price ?? s.current_price ?? s.avg_cost) * (s.shares || 0),
    }))
    const blob = new Blob([JSON.stringify(enriched, null, 2)], { type: "application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = "my_stocks.json"; a.click()
    URL.revokeObjectURL(url)
  }

  function exportDividends() {
    const raw = localStorage.getItem("dividends") || "[]"
    const blob = new Blob([raw], { type: "application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = "my_dividends.json"; a.click()
    URL.revokeObjectURL(url)
  }

  function archiveYear() {
    const year = new Date().getFullYear()
    if (!confirm(`Archive all ${year} dividend data and prepare for ${year+1}?\n\nThis will:\n• Save ${year} totals to archive\n• Keep all your data intact\n• Nothing will be deleted`)) return
    try {
      // Read current dividends
      const divs = JSON.parse(localStorage.getItem("dividends") || "[]")
      const thisYearDivs = divs.filter(d => d.date?.startsWith(String(year)))

      // Build archive summary
      const archive = JSON.parse(localStorage.getItem("dividend_archive") || "{}")
      const summary = { CAD: 0, USD: 0, byAccount: {}, entries: thisYearDivs.length }
      thisYearDivs.forEach(d => {
        const cur = d.currency || "CAD"
        summary[cur] = (summary[cur] || 0) + (parseFloat(d.amount) || 0)
        const acct = d.account_type || "Unknown"
        if (!summary.byAccount[acct]) summary.byAccount[acct] = { CAD: 0, USD: 0 }
        summary.byAccount[acct][cur] = (summary.byAccount[acct][cur] || 0) + (parseFloat(d.amount) || 0)
      })
      archive[year] = summary
      localStorage.setItem("dividend_archive", JSON.stringify(archive))

      // Also save to historical_dividends_per_stock_v2 for the Dividend History tab
      // This is already handled by the user manually entering past years

      alert(`✓ ${year} archived!\n\nRRSP: C$${(summary.byAccount.RRSP?.CAD||0).toFixed(2)} + US$${(summary.byAccount.RRSP?.USD||0).toFixed(2)}\nTFSA: C$${(summary.byAccount.TFSA?.CAD||0).toFixed(2)} + US$${(summary.byAccount.TFSA?.USD||0).toFixed(2)}\nMargin: C$${(summary.byAccount.Margin?.CAD||0).toFixed(2)}\n\nData is preserved. Start entering ${year+1} dividends as they arrive.`)
    } catch(e) {
      alert("Error: " + e.message)
    }
  }

  function fixAnnualDividends() {
    const CORRECT_RATES = {
      "TRP":3.72,"ENB":3.77,"TD":4.08,"MFC":1.60,"RY":5.72,"SU":2.20,
      "FTS":2.36,"CNQ":4.00,"CNR":3.24,"BN.TO":0.76,"DOL":0.92,"CU":1.78,
      "HR-UN.TO":0.60,"REI-UN.TO":1.16,"VFV":2.40,"XIC":0.80,"XEQT":1.20,
      "XEQT.TO":1.20,"XEF":1.40,"XUS":1.20,"XETM":1.00,"MSTE":1.00,
      "HDIV":1.56,"HYLD":0.96,"HMAX":1.68,"HHIS":1.44,"MSFT.NE":0.186,
      "UTES.TO":0.84,"USCL.TO":2.82,"QQCL.TO":3.72,"HDIF.TO":1.32,
      "ENCL.TO":1.20,"CANY.TO":2.52,"V":2.34,"LLY":5.40,"META":2.00,
      "AVGO":21.00,"COST":4.60,"MSFT":3.32,"ABBV":6.20,"SCHD":2.76,
      "MA":2.64,"RTX":2.60,"NVDA":0.04,"GOOGL":0.80,"AAPL":1.00,
      "PEP":5.42,"T":1.11,"AZN":3.00,"VOO":7.84,"VTI":3.55,
      "YMAX":2.40,"QDTE":3.60,"XDTE":4.80,"QQQ":2.00,
      "SCHP":1.20,"SOBO":2.79,"GRB":0,"PWR":0,"BBD.A":0,
    }
    try {
      const stocks = JSON.parse(localStorage.getItem("stocks") || "[]")
      let fixed = 0
      const updated = stocks.map(s => {
        const sym = s.symbol || ""
        const correct = CORRECT_RATES[sym]
        if (correct !== undefined) {
          fixed++
          return { ...s, annual_dividend: correct }
        }
        // Fallback: if stored value is clearly the total (> 10x a reasonable per-share rate)
        const ann = parseFloat(s.annual_dividend) || 0
        const sh  = parseFloat(s.shares) || 0
        if (ann > 0 && sh > 1) {
          const px = s.current_price || s.avg_cost || 0
          const yld = px > 0 ? ann / px * 100 : 0
          if (yld > 30) {
            fixed++
            return { ...s, annual_dividend: parseFloat((ann / sh).toFixed(6)) }
          }
        }
        return s
      })
      localStorage.setItem("stocks", JSON.stringify(updated))
      alert(`✓ Fixed ${fixed} stock dividend rates.\nPage will reload.`)
      window.location.reload()
    } catch(e) {
      alert("Error: " + e.message)
    }
  }

  function fixDividendCurrencies() {
    try {
      const stocks   = JSON.parse(localStorage.getItem("stocks")   || "[]")
      const divs     = JSON.parse(localStorage.getItem("dividends") || "[]")
      const stockMap = {}
      stocks.forEach(s => { stockMap[s.id] = s.currency || "USD" })
      let fixed = 0
      const updated = divs.map(d => {
        if (!d.stock_id) return d  // cash entries keep their currency
        const correctCur = stockMap[d.stock_id]
        if (!correctCur || d.currency === correctCur) return d
        fixed++
        return { ...d, currency: correctCur }
      })
      localStorage.setItem("dividends", JSON.stringify(updated))
      alert(`✓ Fixed ${fixed} dividend entries. Page will reload.`)
      window.location.reload()
    } catch(e) {
      alert("Error: " + e.message)
    }
  }
  const fileRef = useRef(null)
  const handleExport = () => {
    const data = exportAllData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `portfolio-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        importAllData(JSON.parse(ev.target.result))
        onRestored?.()
        alert("Data restored successfully!")
      } catch { alert("Invalid backup file.") }
    }
    reader.readAsText(file)
    e.target.value = ""
  }
  // RRSP/TFSA contribution and room tracking
  const [contribs, setContribs] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("contribution_tracking") || "{}") } catch { return {} }
  })
  const year = new Date().getFullYear()
  function saveContribs(next) { setContribs(next); localStorage.setItem("contribution_tracking", JSON.stringify(next)) }
  function updateContrib(account, field, value) {
    const next = { ...contribs, [year]: { ...(contribs[year]||{}), [account]: { ...(contribs[year]?.[account]||{}), [field]: parseFloat(value)||0 } } }
    saveContribs(next)
  }
  const thisYear = contribs[year] || {}

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Backup and Restore</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Your data is stored in your browser. Export a backup regularly.</p>
        <div className="flex gap-3 flex-wrap">
          <Button onClick={handleExport} variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export Backup</Button>
          <Button onClick={() => fileRef.current?.click()} variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Restore Backup</Button>
          {/* ── RRSP / TFSA Contribution Tracking ── */}
          <div className="mt-4 mb-2">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">📊 {year} Contribution Tracking</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {["RRSP","TFSA"].map(acct => {
                const data = thisYear[acct] || {}
                const room = contribs.room?.[acct] || (acct==="TFSA" ? 6500 : 18000)
                const contributed = data.contributed || 0
                const remaining = room - contributed
                return (
                  <div key={acct} className="border rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-700">{acct} {year}</span>
                      <span className={`text-xs font-semibold ${remaining >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {remaining >= 0 ? "Room: " : "Over by: "}C${Math.abs(remaining).toLocaleString()}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 w-28">Contribution Room</label>
                        <input type="number" value={room}
                          onChange={e => saveContribs({...contribs, room:{...(contribs.room||{}), [acct]: parseFloat(e.target.value)||0}})}
                          className="flex-1 text-xs border rounded px-2 py-1 text-right"/>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 w-28">Contributed {year}</label>
                        <input type="number" value={contributed}
                          onChange={e => updateContrib(acct,"contributed",e.target.value)}
                          className="flex-1 text-xs border rounded px-2 py-1 text-right"/>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full mt-1">
                        <div className={`h-1.5 rounded-full ${remaining >= 0 ? "bg-green-500" : "bg-red-500"}`}
                          style={{width:`${Math.min(100,(contributed/room)*100)}%`}}/>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <Button onClick={exportStocks} variant="outline" className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"><Download className="h-4 w-4" /> Export Stocks (for audit)</Button>
          <Button onClick={exportDividends} variant="outline" className="gap-2 text-green-600 border-green-200 hover:bg-green-50"><Download className="h-4 w-4" /> Export Dividends (for audit)</Button>
          <Button onClick={fixAnnualDividends} variant="outline" className="gap-2 text-red-600 border-red-200 hover:bg-red-50"><Download className="h-4 w-4" /> Fix Annual Dividend Rates</Button>
          <Button onClick={fixDividendCurrencies} variant="outline" className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"><Download className="h-4 w-4" /> Fix Dividend Currencies</Button>
          <Button onClick={archiveYear} variant="outline" className="gap-2 text-purple-600 border-purple-200 hover:bg-purple-50"><Download className="h-4 w-4" /> Archive Year (End of Year)</Button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        </div>
        <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 rounded-md p-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>Restoring will replace all current data.</span>
        </div>
      </CardContent>
    </Card>
  )
}