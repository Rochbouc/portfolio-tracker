import { useState } from "react"
import { setCash } from "@/api/localData"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DollarSign } from "lucide-react"

const BUILTIN_ACCOUNTS = ["RRSP","TFSA","FHSA","Cash","Margin","USD Cash"]
const ACCOUNTS_KEY = "custom_account_types"
function loadCustomAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]") } catch { return [] }
}

export default function CashModal({ open, onOpenChange, onSaved, initialAccount, initialCurrency }) {
  const customAccounts = loadCustomAccounts()
  const allAccounts = [...BUILTIN_ACCOUNTS, ...customAccounts].filter((v,i,a) => a.indexOf(v)===i)

  const [account, setAccount] = useState(initialAccount || "")
  const [currency, setCurrency] = useState(initialCurrency || "CAD")
  const [amount, setAmount] = useState("")
  const [mode, setMode] = useState("set") // "set" | "add" | "subtract"
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const handleSave = async () => {
    if (!account) { setError("Select an account"); return }
    const val = parseFloat(amount)
    if (isNaN(val) || val < 0) { setError("Enter a valid amount"); return }
    setSaving(true)
    try {
      if (mode === "set") {
        await setCash(account, currency, val)
      } else {
        const { adjustCash } = await import("@/api/localData")
        await adjustCash(account, currency, mode === "add" ? val : -val)
      }
      onSaved()
      onOpenChange(false)
      setAmount("")
      setError("")
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setError(""); setAmount("") } onOpenChange(v) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Manage Cash Balance
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Account */}
          <div className="space-y-1.5">
            <Label className="text-gray-700 font-medium">Account *</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger><SelectValue placeholder="Select account..." /></SelectTrigger>
              <SelectContent>
                {allAccounts.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <Label className="text-gray-700 font-medium">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CAD">🍁 CAD (Canadian Dollar)</SelectItem>
                <SelectItem value="USD">🇺🇸 USD (US Dollar)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mode */}
          <div className="space-y-1.5">
            <Label className="text-gray-700 font-medium">Action</Label>
            <div className="flex rounded-md border overflow-hidden text-sm">
              {[["set","Set Balance"],["add","Deposit"],["subtract","Withdraw"]].map(([m, label]) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 py-1.5 font-medium transition-colors ${mode===m ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label className="text-gray-700 font-medium">
              {mode === "set" ? "New Balance" : mode === "add" ? "Amount to Deposit" : "Amount to Withdraw"} ({currency})
            </Label>
            <Input
              type="number" step="0.01" min="0"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError("") }}
              placeholder="0.00"
              className="bg-white border-gray-300 text-gray-900"
              onKeyDown={e => { if (e.key === "Enter") handleSave() }}
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving || !amount}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
