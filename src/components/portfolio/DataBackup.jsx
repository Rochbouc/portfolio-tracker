import { useRef } from "react"
import { exportAllData, importAllData } from "@/api/localData"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, Upload, AlertTriangle } from "lucide-react"
export default function DataBackup({ onRestored }) {
  function exportDividends() {
    const raw = localStorage.getItem("dividends") || "[]"
    const blob = new Blob([raw], { type: "application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = "my_dividends.json"; a.click()
    URL.revokeObjectURL(url)
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
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Backup and Restore</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Your data is stored in your browser. Export a backup regularly.</p>
        <div className="flex gap-3 flex-wrap">
          <Button onClick={handleExport} variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export Backup</Button>
          <Button onClick={() => fileRef.current?.click()} variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Restore Backup</Button>
          <Button onClick={exportDividends} variant="outline" className="gap-2 text-green-600 border-green-200 hover:bg-green-50"><Download className="h-4 w-4" /> Export Dividends (for audit)</Button>
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