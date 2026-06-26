import React, { useRef } from 'react'
import { db } from '../../api/localData'
import { Button, Card } from '../ui/index.jsx'

export default function DataBackup() {
  const fileRef = useRef(null)

  function handleExport() {
    const data = db.exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `portfolio-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!confirm('This will overwrite all your current data. Continue?')) return
        db.importAll(data)
        alert('Data imported successfully. Refresh the page.')
      } catch {
        alert('Invalid backup file.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Data Backup & Restore</h3>
      <p className="text-xs text-gray-500">Export all portfolio data as a JSON file. Import to restore from a backup.</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleExport}>⬇ Export JSON</Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}>⬆ Import JSON</Button>
        <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
      </div>
    </Card>
  )
}
