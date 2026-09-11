import { useState } from "react"
import { cloudSetValue } from "@/api/localData"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Landmark, Plus, Trash2, X, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "loan_tracker_v1"

function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") } catch { return {} } }
function save(d) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); cloudSetValue(STORAGE_KEY, d) }

function fmt(n, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, minimumFractionDigits: 2 }).format(n || 0)
}

function genId() { return "ln_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

const TYPE_LABELS = {
  initial:   { label: "Initial loan",    sign: 1,  color: "text-gray-700" },
  interest:  { label: "Interest charge", sign: 1,  color: "text-red-600" },
  repayment: { label: "Repayment",       sign: -1, color: "text-green-600" },
}

export default function LoanTracker({ stocks = [] }) {
  const [data, setData] = useState(() => load())
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState({})
  const [form, setForm] = useState({ account: "", type: "interest", amount: "", date: new Date().toISOString().slice(0, 10), currency: "CAD", note: "" })

  const knownAccounts = [...new Set(stocks.map(s => s.account_type).filter(Boolean))].sort()
  const accounts = data.accounts || {}
  const accountNames = Object.keys(accounts).sort()

  function balanceFor(name) {
    const txns = accounts[name]?.transactions || []
    return txns.reduce((sum, t) => sum + (TYPE_LABELS[t.type]?.sign ?? 1) * (parseFloat(t.amount) || 0), 0)
  }

  function addEntry() {
    const account = form.account.trim()
    const amount = parseFloat(form.amount)
    if (!account || !amount || amount <= 0) return
    const entry = { id: genId(), type: form.type, amount, date: form.date, currency: form.currency, note: form.note.trim() }
    const next = {
      ...data,
      accounts: {
        ...accounts,
        [account]: {
          transactions: [...(accounts[account]?.transactions || []), entry].sort((a, b) => a.date.localeCompare(b.date)),
        },
      },
    }
    save(next); setData(next)
    setForm({ account: "", type: "interest", amount: "", date: new Date().toISOString().slice(0, 10), currency: form.currency, note: "" })
    setShowForm(false)
    setExpanded(prev => ({ ...prev, [account]: true }))
  }

  function deleteEntry(account, id) {
    const next = {
      ...data,
      accounts: {
        ...accounts,
        [account]: { transactions: (accounts[account]?.transactions || []).filter(t => t.id !== id) },
      },
    }
    save(next); setData(next)
  }

  return (
    <Card className="bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Landmark className="h-4 w-4 text-amber-600" />
            Margin & Loans
          </CardTitle>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowForm(v => !v)}>
            <Plus className="h-3.5 w-3.5" /> Add entry
          </Button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Tracked separately — does not affect your Total Portfolio Value elsewhere in the app.</p>
      </CardHeader>
      <CardContent className="space-y-3">

        {showForm && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-gray-500">Account</label>
                <input list="loan-account-options" value={form.account} onChange={e => setForm({ ...form, account: e.target.value })}
                  placeholder="e.g. Roch Margin"
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 mt-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400" />
                <datalist id="loan-account-options">
                  {knownAccounts.map(a => <option key={a} value={a} />)}
                </datalist>
              </div>
              <div>
                <label className="text-[11px] text-gray-500">Type</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 mt-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400">
                  <option value="initial">Initial loan amount</option>
                  <option value="interest">Interest charge</option>
                  <option value="repayment">Repayment</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-gray-500">Amount</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 mt-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400" />
              </div>
              <div>
                <label className="text-[11px] text-gray-500">Date</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 mt-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400" />
              </div>
              <div>
                <label className="text-[11px] text-gray-500">Currency</label>
                <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 mt-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400">
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-gray-500">Note (optional)</label>
                <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                  placeholder="e.g. Aug statement"
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 mt-0.5 focus:outline-none focus:ring-1 focus:ring-amber-400" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700" onClick={addEntry}>Save entry</Button>
            </div>
          </div>
        )}

        {accountNames.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No loans tracked yet. Click "Add entry" to log an initial loan balance, interest charge, or repayment.</p>
        ) : (
          <div className="space-y-2">
            {accountNames.map(name => {
              const bal = balanceFor(name)
              const txns = [...(accounts[name]?.transactions || [])].sort((a, b) => b.date.localeCompare(a.date))
              const isOpen = !!expanded[name]
              const currency = txns[0]?.currency || "CAD"
              return (
                <div key={name} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button onClick={() => setExpanded(p => ({ ...p, [name]: !p[name] }))}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-1.5">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                      <span className="text-sm font-semibold text-gray-800">{name}</span>
                    </div>
                    <span className={cn("text-sm font-bold", bal > 0 ? "text-red-600" : "text-gray-400")}>
                      {fmt(bal, currency)} owing
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {txns.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">No entries yet.</p>
                      ) : txns.map(t => {
                        const meta = TYPE_LABELS[t.type] || TYPE_LABELS.interest
                        return (
                          <div key={t.id} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-50 group">
                            <div>
                              <span className="text-gray-400 mr-2">{t.date}</span>
                              <span className={meta.color}>{meta.label}</span>
                              {t.note && <span className="text-gray-400 ml-1.5">— {t.note}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={cn("font-medium", meta.sign > 0 ? "text-red-600" : "text-green-600")}>
                                {meta.sign > 0 ? "+" : "−"}{fmt(t.amount, t.currency)}
                              </span>
                              <button onClick={() => deleteEntry(name, t.id)}
                                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
