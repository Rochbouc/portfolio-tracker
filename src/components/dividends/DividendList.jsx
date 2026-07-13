import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2, Pencil, Loader2, Search, X } from "lucide-react"
import { StockLogoButton } from "@/components/ui/StockPopup"
import { cn } from "@/lib/utils"

function EditDividendDialog({ dividend, stocks, open, onOpenChange, onSave }) {
  const stock    = stocks.find(s => s.id === dividend?.stock_id)
  const accounts = [...new Set(stocks.map(s => s.account_type).filter(Boolean))].sort()

  const [amount,   setAmount]   = useState(String(dividend?.amount  || ""))
  const [date,     setDate]     = useState(dividend?.date    || "")
  const [notes,    setNotes]    = useState(dividend?.notes   || "")
  const [account,  setAccount]  = useState(dividend?.account_type || stock?.account_type || "")
  const [currency, setCurrency] = useState(dividend?.currency || stock?.currency || "USD")
  const [saving,   setSaving]   = useState(false)

  async function handleSave() {
    if (!amount || !date) return
    setSaving(true)
    await onSave(dividend.id, {
      amount:       parseFloat(amount),
      date,
      notes,
      account_type: account,
      currency,
    })
    setSaving(false)
    onOpenChange(false)
  }

  const sym = stock?.symbol || dividend?.symbol || "Cash"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Dividend — {sym}</DialogTitle>
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

          {/* Amount + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" step="0.01" min="0" value={amount}
                onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <div className="flex rounded-md border border-gray-200 overflow-hidden">
                {["CAD","USD"].map(c => (
                  <button key={c} type="button" onClick={() => setCurrency(c)}
                    className={cn("flex-1 py-2 text-sm font-semibold transition-colors",
                      currency === c ? "bg-gray-900 text-white" : "bg-white text-gray-400 hover:bg-gray-50")}>
                    {c === "CAD" ? "🍁 CAD" : "🇺🇸 USD"}
                  </button>
                ))}
              </div>
              {currency !== (stock?.currency || "USD") && (
                <p className="text-[10px] text-amber-600">
                  ⚠️ Different from stock's default ({stock?.currency || "USD"})
                </p>
              )}
            </div>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
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

export default function DividendList({ dividends = [], stocks = [], onDelete, onEdit, globalCurrency = "CAD" }) {
  const [editingDiv, setEditingDiv] = useState(null)
  const [search,     setSearch]     = useState("")
  const USD_CAD = 1.37

  const getStockCurrency = (d) => d.currency || stocks.find(s => s.id === d.stock_id)?.currency || "USD"
  const getSym = id => {
    if (!id) return "💰 Cash"
    return stocks.find(s => s.id === id)?.symbol || id
  }

  const fmtNative = (d) => {
    const cur = getStockCurrency(d)
    return new Intl.NumberFormat("en-CA", { style:"currency", currency: cur }).format(d.amount || 0)
  }

  const toGlobal = (d) => {
    const cur = getStockCurrency(d)
    const amt = d.amount || 0
    if (cur === globalCurrency) return amt
    if (globalCurrency === "CAD" && cur === "USD") return amt * USD_CAD
    if (globalCurrency === "USD" && cur === "CAD") return amt / USD_CAD
    return amt
  }

  const fmtGlobal = n => new Intl.NumberFormat("en-CA", { style:"currency", currency: globalCurrency }).format(n || 0)

  const sorted = useMemo(() =>
    [...dividends].sort((a,b) => new Date(b.date) - new Date(a.date))
  , [dividends])

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted
    const q = search.toLowerCase().trim()
    return sorted.filter(d => {
      const sym   = getSym(d.stock_id).toLowerCase()
      const acct  = (d.account_type || "").toLowerCase()
      const notes = (d.notes || "").toLowerCase()
      const date  = (d.date || "").toLowerCase()
      const amt   = String(d.amount || "")
      return sym.includes(q) || acct.includes(q) || notes.includes(q) || date.includes(q) || amt.includes(q)
    })
  }, [sorted, search])

  const total         = dividends.reduce((s, d) => s + toGlobal(d), 0)
  const filteredTotal = filtered.reduce((s, d) => s + toGlobal(d), 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Dividend History</CardTitle>
          <span className="text-sm font-semibold text-green-600">
            Total: {fmtGlobal(total)}
          </span>
        </div>

        {/* Search bar */}
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by stock, account, date, amount..."
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Search result count */}
        {search && (
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{filtered.length} of {dividends.length} entries</span>
            <span className="text-green-600 font-medium">Subtotal: {fmtGlobal(filteredTotal)}</span>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {dividends.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No dividends recorded yet.</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No results for "{search}"</div>
        ) : (
          <div className="divide-y">
            {filtered.map(d => (
              <div key={d.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/30">
                <div className="flex items-center gap-3 min-w-0">
                  <StockLogoButton
                    symbol={getSym(d.stock_id)}
                    name={stocks.find(s => s.id === d.stock_id)?.name || ""}
                    size={32}
                    stock={stocks.find(s => s.id === d.stock_id)}
                  />
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
                  <span className="font-semibold text-green-600">{fmtNative(d)}</span>
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
