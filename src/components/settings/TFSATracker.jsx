import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PiggyBank, Plus, Trash2, Check, X, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "tfsa_tracker_v1"
// Annual TFSA limits per year (Canada)
const ANNUAL_LIMITS = {
  2009:5000,2010:5000,2011:5000,2012:5000,2013:5500,2014:5500,2015:10000,
  2016:5500,2017:5500,2018:5500,2019:6000,2020:6000,2021:6000,2022:6000,
  2023:6500,2024:7000,2025:7000,2026:7000
}

function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") } catch { return {} } }
function save(d) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) }

function fmt(n) {
  return new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0}).format(n||0)
}

function InlineEdit({ value, onSave, type="number" }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState("")
  function start() { setDraft(String(value||"")); setEditing(true) }
  function commit() { onSave(parseFloat(draft)||0); setEditing(false) }
  if (editing) return (
    <span className="inline-flex items-center gap-1">
      <input autoFocus type={type} value={draft} onChange={e=>setDraft(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape")setEditing(false)}}
        className="w-24 text-xs border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none" />
      <button onClick={commit} className="text-green-500"><Check className="h-3 w-3"/></button>
      <button onClick={()=>setEditing(false)} className="text-gray-400"><X className="h-3 w-3"/></button>
    </span>
  )
  return <button onClick={start} className="hover:text-blue-600 underline decoration-dashed">{value||"—"}</button>
}

export default function TFSATracker({ transactions = [], stocks = [] }) {
  const [data, setData] = useState(() => load())

  function update(key, val) { const d = {...data, [key]:val}; save(d); setData(d) }

  // Opening year = when you turned 18 or 2009, whichever is later
  const openingYear = data.openingYear || 2009
  const currentYear = new Date().getFullYear()

  // Total room accumulated since opening
  const totalRoomAccumulated = Object.entries(ANNUAL_LIMITS)
    .filter(([y]) => parseInt(y) >= openingYear && parseInt(y) <= currentYear)
    .reduce((s,[,v])=>s+v,0)

  // Withdrawals restore room next calendar year
  const withdrawals = data.withdrawals || {} // { year: amount }
  const totalWithdrawals = Object.values(withdrawals).reduce((s,v)=>s+(parseFloat(v)||0),0)

  // Contributions from transactions (buy transactions in TFSA accounts)
  const tfsaContributions = transactions
    .filter(t => {
      const stock = stocks.find(s => s.id === t.stock_id)
      const acct = t.account_type || stock?.account_type || ""
      return t.type === "buy" && acct.toUpperCase().includes("TFSA")
    })
    .reduce((s,t) => s + (t.shares * t.price), 0)

  // Manual adjustments
  const manualContrib = parseFloat(data.manualContrib || 0)
  const totalContributed = tfsaContributions + manualContrib

  const roomRemaining = totalRoomAccumulated + totalWithdrawals - totalContributed

  const years = Object.keys(ANNUAL_LIMITS).map(Number).filter(y => y >= openingYear && y <= currentYear)

  return (
    <Card className="bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <PiggyBank className="h-4 w-4 text-green-600" />
          TFSA Contribution Room
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Big number */}
        <div className={cn("rounded-xl p-4 text-center", roomRemaining >= 0 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200")}>
          <div className="text-xs text-gray-500 mb-1">Contribution Room Available</div>
          <div className={cn("text-3xl font-bold", roomRemaining >= 0 ? "text-green-700" : "text-red-600")}>
            {fmt(roomRemaining)}
          </div>
          {roomRemaining < 0 && <div className="text-xs text-red-500 mt-1">⚠ Over-contributed! CRA penalty applies.</div>}
        </div>

        {/* Settings */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 mb-1">Account opened (year turned 18)</div>
            <InlineEdit value={openingYear} onSave={v => update("openingYear", parseInt(v)||2009)} />
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 mb-1">Manual contributions to add</div>
            <InlineEdit value={manualContrib} onSave={v => update("manualContrib", v)} />
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-1.5 text-xs">
          {[
            { label: `Total room since ${openingYear}`,  value: totalRoomAccumulated, color: "text-blue-700" },
            { label: "From transactions (TFSA buys)",    value: -tfsaContributions,  color: "text-red-600" },
            { label: "Manual contributions",             value: -manualContrib,       color: "text-red-600" },
            { label: "Withdrawals restored",             value: totalWithdrawals,     color: "text-green-600" },
          ].map(r => (
            <div key={r.label} className="flex justify-between py-1 border-b border-gray-100">
              <span className="text-gray-600">{r.label}</span>
              <span className={cn("font-semibold", r.color)}>
                {r.value >= 0 ? "+" : ""}{fmt(r.value)}
              </span>
            </div>
          ))}
          <div className="flex justify-between pt-1 font-semibold text-sm">
            <span>Remaining room</span>
            <span className={roomRemaining >= 0 ? "text-green-600" : "text-red-600"}>{fmt(roomRemaining)}</span>
          </div>
        </div>

        {/* Withdrawal tracking */}
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-2">Withdrawals (room restored next year)</div>
          <div className="space-y-1.5">
            {years.slice(-5).map(y => (
              <div key={y} className="flex items-center justify-between text-xs">
                <span className="text-gray-500 w-12">{y}</span>
                <span className="text-gray-400 flex-1 text-center">Limit: {fmt(ANNUAL_LIMITS[y])}</span>
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">Withdrawal:</span>
                  <InlineEdit value={withdrawals[y]||0} onSave={v => {
                    const w = {...withdrawals, [y]:v}; update("withdrawals", w)
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-gray-400">
          Based on annual TFSA limits 2009–{currentYear}. Contribution room from transactions is calculated from buy transactions in TFSA accounts. Always verify with CRA My Account.
        </p>
      </CardContent>
    </Card>
  )
}
