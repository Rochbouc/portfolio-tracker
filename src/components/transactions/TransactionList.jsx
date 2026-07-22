import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Pencil, Loader2, Search, X } from "lucide-react"
import { StockLogoButton } from "@/components/ui/StockPopup"

function EditTransactionDialog({ transaction, stocks, open, onOpenChange, onSave }) {
  const stock = stocks.find(s => s.id === transaction?.stock_id)
  const currency = stock?.currency || "USD"

  const [type, setType]       = useState(transaction?.type || "buy")
  const [shares, setShares]   = useState(String(transaction?.shares || ""))
  const [price, setPrice]     = useState(String(transaction?.price || ""))
  const [date, setDate]       = useState(transaction?.date || "")
  const [notes, setNotes]     = useState(transaction?.notes || "")
  const [account, setAccount] = useState(transaction?.account_type || "")
  const [saving, setSaving]   = useState(false)

  const ACCOUNTS = [...new Set(stocks.map(s => s.account_type).filter(Boolean))]

  async function handleSave() {
    if (!shares || !price || !date) return
    setSaving(true)
    await onSave(transaction.id, {
      type,
      shares: parseFloat(shares),
      price:  parseFloat(price),
      date,
      notes,
      account_type: account,
    })
    setSaving(false)
    onOpenChange(false)
  }

  const total = (parseFloat(shares) || 0) * (parseFloat(price) || 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Transaction — {stock?.symbol}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">🟢 Buy</SelectItem>
                <SelectItem value="sell">🔴 Sell</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Account */}
          <div className="space-y-1.5">
            <Label>Account</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {ACCOUNTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Shares + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Shares</Label>
              <Input type="number" step="0.0001" value={shares} onChange={e => setShares(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Price / Share ({currency})</Label>
              <Input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
            </div>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {/* Total preview */}
          {total > 0 && (
            <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
              <span className="text-gray-500">Total: </span>
              <span className="font-semibold text-gray-900">
                {new Intl.NumberFormat("en-CA", { style:"currency", currency }).format(total)}
              </span>
            </div>
          )}

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

export default function TransactionList({ transactions = [], stocks = [], onDelete, onEdit }) {
  const [editingTx, setEditingTx] = useState(null)
  const [search,    setSearch]    = useState("")

  const fmt = (n, currency) => n == null ? "-"
    : new Intl.NumberFormat("en-CA", { style:"currency", currency: currency||"USD" }).format(n)
  const getStock = id => stocks.find(s => s.id === id)

  const sorted = [...transactions].sort((a,b) => new Date(b.date)-new Date(a.date))
  const filtered = search.trim()
    ? sorted.filter(t => {
        const stock = getStock(t.stock_id)
        const sym   = (t.symbol || stock?.symbol || "").toLowerCase()
        const name  = (stock?.name || "").toLowerCase()
        const acct  = (t.account_type || stock?.account_type || "").toLowerCase()
        const q     = search.toLowerCase()
        return sym.includes(q) || name.includes(q) || acct.includes(q) ||
               String(t.shares||"").includes(q) || String(t.price||"").includes(q) ||
               (t.date||"").includes(q) || (t.type||"").includes(q)
      })
    : sorted

  return (
    <Card className="bg-white">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm text-gray-700">Transaction History</CardTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search transactions..."
              className="pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 w-44"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {search && (
          <div className="text-xs text-gray-400 mt-1">{filtered.length} of {transactions.length} transactions</div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {transactions.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No transactions yet.</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No transactions match "{search}"</div>
        ) : (
          <div className="divide-y">
            {filtered.map(t => {
              const stock    = getStock(t.stock_id)
              const currency = stock?.currency || "USD"
              const sym      = t.symbol || stock?.symbol || t.stock_id
              return (
                <div key={t.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <StockLogoButton symbol={sym} name={stock?.name || sym} size={32} stock={stock} />
                    <Badge variant={t.type==="buy"?"default":"secondary"} className="flex-shrink-0">
                      {t.type?.toUpperCase()}
                    </Badge>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                        {sym}
                        {t.account_type && (
                          <span className="text-xs font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            {t.account_type}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {t.date} · {t.shares} shares @ {fmt(t.price, currency)}
                        {t.notes ? ` · ${t.notes}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-semibold text-sm text-gray-900">{fmt(t.shares * t.price, currency)}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                      onClick={() => setEditingTx(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-300 hover:text-red-500 hover:bg-red-50"
                      onClick={() => onDelete(t.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      {editingTx && (
        <EditTransactionDialog
          transaction={editingTx}
          stocks={stocks}
          open={!!editingTx}
          onOpenChange={open => { if (!open) setEditingTx(null) }}
          onSave={async (id, data) => { await onEdit(id, data); setEditingTx(null) }}
        />
      )}
    </Card>
  )
}
