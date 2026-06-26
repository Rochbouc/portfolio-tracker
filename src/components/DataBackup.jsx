import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { exportAllData, importAllData } from "@/api/localData";
import { Download, Upload, DatabaseBackup } from "lucide-react";
import { useRef, useState } from "react";

export default function DataBackup({ onImported }) {
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState("");

  function handleExport() {
    const data = exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Exported!");
    setTimeout(() => setStatus(""), 2000);
  }

  function handleImportClick() { fileInputRef.current?.click(); }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      importAllData(data);
      setStatus("Imported successfully!");
      onImported?.();
    } catch {
      setStatus("Error: invalid backup file.");
    }
    setTimeout(() => setStatus(""), 3000);
    e.target.value = "";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><DatabaseBackup className="h-4 w-4" />Backup & Restore</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">All data is stored in your browser. Export a backup to keep it safe or transfer it to another device.</p>
        {status && <p className="text-sm font-medium text-green-600">{status}</p>}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1.5" />Export
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={handleImportClick}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />Import
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileChange} />
      </CardContent>
    </Card>
  );
}
