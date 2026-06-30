import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Calendar, CheckCircle, X } from "lucide-react"
import { getDividendData } from "@/api/dividendData"
import { getPaySchedule } from "@/api/dividendData"
import { cn } from "@/lib/utils"

const schema = z.object({
  stock_id:     z.string().min(1, "Required"),
  account_type: z.string().min(1, "Required"),
  amount:       z.coerce.number().positive("Must be > 0"),
  date:         z.string().min(1, "Required"),
  notes:        z.string().optional(),
})

export default function AddDividendForm({ open, onOpenChange, onSubmit, stocks = [], suggestions = [] }) {
  const {
    register, handleSubmit, setValue, watch, reset, control,
    formState: { errors, isSubmitting }
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { date: new Date().toISOString().slice(0,10), account_type: "", stock_id: "" }
  })

  const [loadingAmount, setLoadingAmount] = useState(false)
  const [currency,      setCurrency]      = useState("CAD")
  const [suggestUsed,   setSuggestUsed]   = useState(false)
  const [dismissed,     setDismissed]     = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("dismissed_div_suggestions") || "[]")) }
    catch { return new Set() }
  })

  function dismissSuggestion(e, sug) {
    e.stopPropagation()
    const key = `${sug.symbol}|${sug.date}`
    const next = new Set(dismissed)
    next.add(key)
    setDismissed(next)
    localStorage.setItem("dismissed_div_suggestions", JSON.stringify([...next]))
  }

  // Clean up dismissed entries older than 60 days to keep storage tidy
  useEffect(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 60)
    const filtered = [...dismissed].filter(key => {
      const datePart = key.split("|")[1]
      return datePart && new Date(datePart) >= cutoff
    })
    if (filtered.length !== dismissed.size) {
      const next = new Set(filtered)
      setDismissed(next)
      localStorage.setItem("dismissed_div_suggestions", JSON.stringify(filtered))
    }
  }, [])

  // Slow scroll when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        document.querySelector("[role=dialog]")?.scrollTo({ top: 0, behavior: "smooth" })
      }, 100)
    }
  }, [open])

  const selectedStockId = watch("stock_id")
  const selectedStock   = stocks.find(s => s.id === selectedStockId)

  // Auto-fill account + currency when stock changes
  useEffect(() => {
    if (!selectedStock) return
    setValue("account_type", selectedStock.account_type || "")
    setCurrency(selectedStock.currency || "CAD")
  }, [selectedStockId, stocks, setValue])

  // Auto-suggest amount from dividend calendar data
  useEffect(() => {
    if (!selectedStock || suggestUsed) return
    const sched = getPaySchedule(selectedStock.symbol)
    if (sched && sched.frequency > 0) {
      const fetch = async () => {
        setLoadingAmount(true)
        try {
          const data = await getDividendData(selectedStock.symbol, selectedStock.shares, selectedStock.avg_cost, selectedStock)
          if (data?.annualTotal > 0) {
            const perPayment = data.annualTotal / (sched.frequency || 4)
            setValue("amount", parseFloat(perPayment.toFixed(2)))
          }
        } catch {}
        finally { setLoadingAmount(false) }
      }
      fetch()
    }
  }, [selectedStockId])

  // Stock options sorted alphabetically with account shown
  const stockOptions = useMemo(() => {
    return [...stocks]
      .filter(s => (s.shares || 0) > 0)
      .map(s => ({
        id:      s.id,
        label:   `${s.symbol} — ${s.account_type || ""}`,
        symbol:  s.symbol,
        account: s.account_type || "",
        currency: s.currency || "CAD",
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.account.localeCompare(b.account))
  }, [stocks])

  // Account options sorted alphabetically
  const accountOptions = useMemo(() =>
    [...new Set(stocks.map(s => s.account_type).filter(Boolean))].sort()
  , [stocks])

  // Suggestions from dividend calendar (upcoming payments)
  const upcomingSuggestions = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return []
    return suggestions
      .filter(s => s.type === "projected")
      .filter(s => !dismissed.has(`${s.symbol}|${s.date}`))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5)
  }, [suggestions, dismissed])

  function applySuggestion(sug) {
    const stock = stocks.find(s => s.symbol === sug.symbol)
    if (!stock) return
    setValue("stock_id",     stock.id)
    setValue("account_type", stock.account_type || "")
    setValue("amount",       parseFloat(sug.amount.toFixed(2)))
    setValue("date",         sug.date)
    setCurrency(stock.currency || "CAD")
    setSuggestUsed(true)
  }

  const onForm = async (data) => {
    // Store currency with the dividend so totals display correctly
    await onSubmit({ ...data, currency })
    reset()
    setSuggestUsed(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); setSuggestUsed(false) } onOpenChange(v) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Dividend</DialogTitle>
          <p className="text-xs text-gray-500 mt-1">
            Enter the amount in the stock's native currency — CAD for Canadian stocks, USD for US stocks.
          </p>
        </DialogHeader>

        {/* Upcoming suggestions from calendar */}
        {upcomingSuggestions.length > 0 && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-blue-600">
              <Calendar className="h-3.5 w-3.5"/> Upcoming payments from calendar — click to auto-fill
            </Label>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {upcomingSuggestions.map((sug, i) => {
                const stock = stocks.find(s => s.symbol === sug.symbol)
                return (
                  <div key={i} className="flex items-center gap-1">
                    <button type="button"
                      onClick={() => applySuggestion(sug)}
                      className="flex-1 text-left flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-blue-100 hover:bg-blue-50 hover:border-blue-300 transition-colors text-xs">
                      <div>
                        <span className="font-semibold text-gray-900">{sug.symbol}</span>
                        <span className="text-gray-400 ml-2">{stock?.account_type}</span>
                        <span className="text-gray-400 ml-2">{sug.date}</span>
                      </div>
                      <span className="font-semibold text-green-600">${sug.amount.toFixed(2)} {stock?.currency || "USD"}</span>
                    </button>
                    <button type="button" onClick={e => dismissSuggestion(e, sug)}
                      title="Already entered — remove from list"
                      className="flex-shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onForm)} className="space-y-4">

          {/* Stock — sorted alphabetically, shows account */}
          <div className="space-y-1.5">
            <Label>Stock *</Label>
            <Controller name="stock_id" control={control} render={({ field }) => (
              <Select value={field.value} onValueChange={v => { field.onChange(v); setSuggestUsed(false) }}>
                <SelectTrigger className={errors.stock_id ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select stock" />
                </SelectTrigger>
                <SelectContent>
                  {stockOptions.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="font-medium">{s.symbol}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{s.account}</span>
                      <span className="ml-2 text-xs text-gray-400">{s.currency}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}/>
            {errors.stock_id && <p className="text-xs text-destructive">{errors.stock_id.message}</p>}
          </div>

          {/* Account — sorted alphabetically */}
          <div className="space-y-1.5">
            <Label>Account *</Label>
            <Controller name="account_type" control={control} render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className={errors.account_type ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accountOptions.map(a => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}/>
            {errors.account_type && <p className="text-xs text-destructive">{errors.account_type.message}</p>}
          </div>

          {/* Amount + Currency indicator */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                Amount *
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded",
                  currency === "CAD" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")}>
                  {currency}
                </span>
                {loadingAmount && <Loader2 className="h-3 w-3 animate-spin text-gray-400"/>}
              </Label>
              <Input type="number" step="0.01" min="0" {...register("amount")}
                className={errors.amount ? "border-destructive" : ""}/>
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
              <p className="text-[10px] text-gray-400">Enter in {currency} — do not convert</p>
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" {...register("date")}
                className={errors.date ? "border-destructive" : ""}/>
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input {...register("notes")} placeholder="Optional" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1"
              onClick={() => { reset(); setSuggestUsed(false); onOpenChange(false) }}>Cancel</Button>
            <Button type="submit" className="flex-1 gap-1.5" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4"/>Record Dividend</>}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
