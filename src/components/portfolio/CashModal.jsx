import { useState } from "react"
import { setCash, adjustCash, recordCashContribution, cloudSetValue } from "@/api/localData"
import { getRate } from "@/api/rateContext"
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

// Auto-updates the RRSP/TFSA contribution-room widget (Settings tab) whenever
// cash is manually deposited or withdrawn from those accounts.
// - TFSA room is tracked CUMULATIVELY (lifetime unused room carries forward,
//   matching how TFSA room actually works) — stored flat as contribs.TFSA.
// - RRSP room is tracked PER YEAR (this year's contribution vs. this year's
//   limit) — stored under contribs[year].RRSP, same as before.
function bumpContributionRoom(account, deltaCAD) {
  if (account !== "RRSP" && account !== "TFSA") return
  try {
    const contribs = JSON.parse(localStorage.getItem("contribution_tracking") || "{}")
    if (account === "TFSA") {
      const cur = contribs.TFSA || {}
      const contributed = (cur.contributed ?? 55756.68) + deltaCAD
      const next = { ...contribs, TFSA: { room: cur.room ?? 109000, contributed } }
      localStorage.setItem("contribution_tracking", JSON.stringify(next))
      cloudSetValue("contribution_tracking", next)
    } else {
      const year = new Date().getFullYear()
      const yearData = contribs[year] || {}
      const acctData = yearData.RRSP || {}
      const contributed = (acctData.contributed || 0) + deltaCAD
      const next = { ...contribs, [year]: { ...yearData, RRSP: { ...acctData, contributed } } }
      localStorage.setItem("contribution_tracking", JSON.stringify(next))
      cloudSetValue("contribution_tracking", next)
    }
  } catch {}
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
        // "Set Balance" is a correction/sync, not a new deposit — not logged as a contribution.
        await setCash(account, currency, val)
      } else {
        // "Deposit"/"Withdraw" is real new money moving in or out — log it as a contribution.
        const delta = mode === "add" ? val : -val
        await adjustCash(account, currency, delta)
        await recordCashContribution(account, currency, delta)
        const deltaCAD = currency === "USD" ? delta * getRate() : delta
        bumpContributionRoom(account, deltaCAD)
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
