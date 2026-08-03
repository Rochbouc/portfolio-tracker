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
    a.href = url; a.download = "my_stocks.json"
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function exportDividends() {
    const raw = localStorage.getItem("dividends") || "[]"
    const blob = new Blob([raw], { type: "application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = "my_dividends.json"
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
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

  const fileRef = useRef(null)
  const handleExport = () => {
    const data = exportAllData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `portfolio-backup-${new Date().toISOString().slice(0,10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
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
  // TFSA room is CUMULATIVE (lifetime unused room carries forward — that's
  // how TFSA room actually works), stored flat as contribs.TFSA.
  // RRSP stays PER YEAR (this year's contribution vs. this year's limit).
  // Both auto-update when cash is manually deposited/withdrawn via CashModal.
  const [contribs, setContribs] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("contribution_tracking") || "{}") } catch { return {} }
  })
  const year = new Date().getFullYear()
  function saveContribs(next) { setContribs(next); localStorage.setItem("contribution_tracking", JSON.stringify(next)) }
  function updateContrib(account, field, value) {
    const next = { ...contribs, [year]: { ...(contribs[year]||{}), [account]: { ...(contribs[year]?.[account]||{}), [field]: parseFloat(value)||0 } } }
    saveContribs(next)
  }
  function updateTFSA(field, value) {
    saveContribs({ ...contribs, TFSA: { ...(contribs.TFSA||{}), [field]: parseFloat(value)||0 } })
  }
  const thisYear = contribs[year] || {}
  // TFSA starting baseline: $109,000 lifetime room, $55,756.68 contributed to
  // date (this year $30,910 + prior years $24,846.68), leaving $53,243.32.
  const tfsaRoom = contribs.TFSA?.room ?? 109000
  const tfsaContributed = contribs.TFSA?.contributed ?? 55756.68
  const tfsaRemaining = tfsaRoom - tfsaContributed

  return (
    <div className="space-y-4">
      {/* RRSP / TFSA Contribution Tracking — its own card, separate from Backup/Restore */}
      <Card>
        <CardHeader><CardTitle className="text-base">📊 {year} Contribution Tracking</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* RRSP — per-year tracking, auto-updates on manual deposit/withdraw */}
            {(() => {
              const data = thisYear.RRSP || {}
              const room = contribs.room?.RRSP || 18000
              const contributed = data.contributed || 0
              const remaining = room - contributed
              return (
                <div className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-gray-700">RRSP {year}</span>
                    <span className={`text-xs font-semibold ${remaining >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {remaining >= 0 ? "Room: " : "Over by: "}C${Math.abs(remaining).toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 w-28">Contribution Room</label>
                      <input type="number" value={room}
                        onChange={e => saveContribs({...contribs, room:{...(contribs.room||{}), RRSP: parseFloat(e.target.value)||0}})}
                        className="flex-1 text-xs border rounded px-2 py-1 text-right"/>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 w-28">Contributed {year}</label>
                      <input type="number" value={contributed}
                        onChange={e => updateContrib("RRSP","contributed",e.target.value)}
                        className="flex-1 text-xs border rounded px-2 py-1 text-right"/>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full mt-1">
                      <div className={`h-1.5 rounded-full ${remaining >= 0 ? "bg-green-500" : "bg-red-500"}`}
                        style={{width:`${Math.min(100,(contributed/room)*100)}%`}}/>
                    </div>
                    <p className="text-[10px] text-gray-400">Auto-adds when you deposit cash into RRSP. Resets each year.</p>
                  </div>
                </div>
              )
            })()}

            {/* TFSA — cumulative lifetime room, auto-updates on manual deposit/withdraw */}
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-700">TFSA (lifetime)</span>
                <span className={`text-xs font-semibold ${tfsaRemaining >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {tfsaRemaining >= 0 ? "Room: " : "Over by: "}C${Math.abs(tfsaRemaining).toLocaleString()}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 w-28">Total Room</label>
                  <input type="number" value={tfsaRoom}
                    onChange={e => updateTFSA("room", e.target.value)}
                    className="flex-1 text-xs border rounded px-2 py-1 text-right"/>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 w-28">Contributed (total)</label>
                  <input type="number" value={tfsaContributed}
                    onChange={e => updateTFSA("contributed", e.target.value)}
                    className="flex-1 text-xs border rounded px-2 py-1 text-right"/>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full mt-1">
                  <div className={`h-1.5 rounded-full ${tfsaRemaining >= 0 ? "bg-green-500" : "bg-red-500"}`}
                    style={{width:`${Math.min(100,(tfsaContributed/tfsaRoom)*100)}%`}}/>
                </div>
                <p className="text-[10px] text-gray-400">Auto-adds when you deposit cash into TFSA. Cumulative — doesn't reset yearly.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backup and Restore */}
      <Card>
        <CardHeader><CardTitle className="text-base">Backup and Restore</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Your data is stored in your browser. Export a backup regularly.</p>
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleExport} variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export Backup</Button>
            <Button onClick={() => fileRef.current?.click()} variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Restore Backup</Button>
            <Button onClick={exportStocks} variant="outline" className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"><Download className="h-4 w-4" /> Export Stocks (for audit)</Button>
            <Button onClick={exportDividends} variant="outline" className="gap-2 text-green-600 border-green-200 hover:bg-green-50"><Download className="h-4 w-4" /> Export Dividends (for audit)</Button>
            <Button onClick={archiveYear} variant="outline" className="gap-2 text-purple-600 border-purple-200 hover:bg-purple-50"><Download className="h-4 w-4" /> Archive Year (End of Year)</Button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          </div>
          <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 rounded-md p-3">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Restoring will replace all current data.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}