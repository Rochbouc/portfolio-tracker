import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileSpreadsheet, CheckCircle, Loader2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import { importSpreadsheetStocks, SPREADSHEET_STOCKS } from "@/api/spreadsheetImport"
import { cn } from "@/lib/utils"

export default function ImportStocks({ onImported }) {
  const [status,   setStatus]   = useState("idle") // idle | loading | done | error
  const [progress, setProgress] = useState(null)
  const [result,   setResult]   = useState(null)
  const [showList, setShowList] = useState(false)

  async function handleImport() {
    setStatus("loading")
    setProgress({ current: 0, total: SPREADSHEET_STOCKS.length, symbol: "", account: "" })
    try {
      const res = await importSpreadsheetStocks((p) => setProgress(p))
      setResult(res)
      setStatus("done")
      onImported?.()
    } catch (err) {
      setResult({ error: err.message })
      setStatus("error")
    }
  }

  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0

  // Group preview by account
  const byAccount = SPREADSHEET_STOCKS.reduce((acc, s) => {
    if (!acc[s.account]) acc[s.account] = []
    acc[s.account].push(s)
    return acc
  }, {})

  return (
    <Card className="bg-white border-2 border-blue-100">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-green-600" />
          Import from Roch_TD_and_MD1.ods
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          Your spreadsheet has been read. <strong>{SPREADSHEET_STOCKS.length} stocks</strong> are ready to import
          across <strong>{Object.keys(byAccount).length} accounts</strong> (RRSP + TFSA).
          Existing stocks won't be duplicated.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Account summary */}
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(byAccount).map(([acct, stocks]) => (
            <div key={acct} className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-center">
              <div className="text-sm font-bold text-blue-800">{acct}</div>
              <div className="text-xs text-blue-600">{stocks.length} stocks</div>
            </div>
          ))}
        </div>

        {/* Main import button */}
        {status === "idle" && (
          <Button className="w-full gap-2 h-11 text-base" onClick={handleImport}>
            <FileSpreadsheet className="h-5 w-5" />
            Import All {SPREADSHEET_STOCKS.length} Stocks Now
          </Button>
        )}

        {/* Loading */}
        {status === "loading" && progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                Importing {progress.symbol} → {progress.account}
              </span>
              <span className="font-semibold">{progress.current}/{progress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-400 text-center">{pct}% complete — please wait…</p>
          </div>
        )}

        {/* Done */}
        {status === "done" && result && (
          <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center space-y-2">
            <CheckCircle className="h-8 w-8 text-green-600 mx-auto" />
            <div className="text-green-800 font-semibold">Import complete!</div>
            <div className="text-sm text-green-700">
              <strong>{result.added}</strong> stocks added
              {result.skipped > 0 && <>, <strong>{result.skipped}</strong> already existed (skipped)</>}
            </div>
            <p className="text-xs text-green-600">
              Your portfolio is now loaded. Switch to the <strong>Holdings</strong> tab to see your stocks with live prices.
            </p>
          </div>
        )}

        {/* Error */}
        {status === "error" && result?.error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-700">
              <strong>Error:</strong> {result.error}
              <button onClick={() => setStatus("idle")} className="block mt-1 text-red-500 underline">Try again</button>
            </div>
          </div>
        )}

        {/* Collapsible stock list preview */}
        <button
          onClick={() => setShowList(v => !v)}
          className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-700 py-1 border-t border-gray-100 mt-2 transition-colors"
        >
          <span>Preview all {SPREADSHEET_STOCKS.length} stocks to be imported</span>
          {showList ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showList && (
          <div className="max-h-64 overflow-y-auto rounded border border-gray-200">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Symbol</th>
                  <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Name</th>
                  <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Account</th>
                  <th className="px-2 py-1.5 text-right text-gray-500 font-medium">Shares</th>
                  <th className="px-2 py-1.5 text-right text-gray-500 font-medium">Avg Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {SPREADSHEET_STOCKS.map((s, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-2 py-1 font-semibold text-gray-900">{s.symbol}</td>
                    <td className="px-2 py-1 text-gray-500 max-w-[140px] truncate">{s.name}</td>
                    <td className="px-2 py-1">
                      <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
                        s.account === "RRSP" ? "bg-blue-50 text-blue-700" :
                        s.account === "TFSA" ? "bg-green-50 text-green-700" :
                        "bg-gray-100 text-gray-600")}>
                        {s.account}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right">{s.shares}</td>
                    <td className="px-2 py-1 text-right">${s.avg_cost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
