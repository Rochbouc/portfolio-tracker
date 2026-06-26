import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Pencil, Loader2 } from "lucide-react"
import { StockLogoButton } from "@/components/ui/StockPopup"

function EditDividendDialog({ dividend, stocks, open, onOpenChange, onSave }) {
  const stock    = stocks.find(s => s.id === dividend?.stock_id)
  const accounts = [...new Set(stocks.map(s => s.account_type).filter(Boolean))]

  const [amount,  setAmount]  = useState(String(dividend?.amount  || ""))
  const [date,    setDate]    = useState(dividend?.date    || "")
  const [notes,   setNotes]   = useState(dividend?.notes   || "")
  const [account, setAccount] = useState(dividend?.account_type || stock?.account_type || "")
  const [saving,  setSaving]  = useState(false)

  async function handleSave() {
    if (!amount || !date) return
    setSaving(true)
    await onSave(dividend.id, {
      amount:       parseFloat(amount),
      date,
      notes,
      account_type: account,
    })
    setSaving(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Dividend — {stock?.symbol}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Account */}
          <div className="space-y-1.5">
            <Label>Account</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount ($)</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function DividendList({ dividends = [], stocks = [], onDelete, onEdit }) {
  const [editingDiv, setEditingDiv] = useState(null)

  const fmt    = n  => new Intl.NumberFormat("en-CA", { style:"currency", currency:"USD" }).format(n || 0)
  const getSym = id => stocks.find(s => s.id === id)?.symbol || id
  const total  = dividends.reduce((s, d) => s + (d.amount || 0), 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Dividend History</CardTitle>
        <span className="text-sm font-semibold text-green-600">Total: {fmt(total)}</span>
      </CardHeader>
      <CardContent className="p-0">
        {dividends.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No dividends recorded yet.</div>
        ) : (
          <div className="divide-y">
            {[...dividends].sort((a,b) => new Date(b.date)-new Date(a.date)).map(d => (
              <div key={d.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/30">
                <div className="flex items-center gap-3 min-w-0">
                  <StockLogoButton symbol={getSym(d.stock_id)} name={stocks.find(s=>s.id===d.stock_id)?.name || ''} size={32} stock={stocks.find(s=>s.id===d.stock_id)} />
                  <div>
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {getSym(d.stock_id)}
                    {d.account_type && (
                      <span className="text-xs font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {d.account_type}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.date}{d.notes ? " — " + d.notes : ""}
                  </div>
                </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-green-600">{fmt(d.amount)}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                    onClick={() => setEditingDiv(d)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-red-50"
                    onClick={() => onDelete(d.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {editingDiv && (
        <EditDividendDialog
          dividend={editingDiv}
          stocks={stocks}
          open={!!editingDiv}
          onOpenChange={open => { if (!open) setEditingDiv(null) }}
          onSave={async (id, data) => { await onEdit(id, data); setEditingDiv(null) }}
        />
      )}
    </Card>
  )
}
