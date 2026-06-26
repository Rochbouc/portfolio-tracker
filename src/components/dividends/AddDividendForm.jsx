import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2 } from "lucide-react"

const schema = z.object({
  stock_id:     z.string().min(1, "Required"),
  account_type: z.string().min(1, "Required"),
  amount:       z.coerce.number().positive("Must be > 0"),
  date:         z.string().min(1, "Required"),
  notes:        z.string().optional(),
})

export default function AddDividendForm({ open, onOpenChange, onSubmit, stocks = [] }) {
  const {
    register, handleSubmit, setValue, watch, reset, control,
    formState: { errors, isSubmitting }
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { date: new Date().toISOString().slice(0, 10), account_type: "", stock_id: "" }
  })

  const selectedStockId = watch("stock_id")

  // When stock changes, auto-fill account from that stock's account_type
  useEffect(() => {
    if (!selectedStockId) return
    const stock = stocks.find(s => s.id === selectedStockId)
    if (stock?.account_type) {
      setValue("account_type", stock.account_type)
    }
  }, [selectedStockId, stocks, setValue])

  // Get unique accounts across all stocks for the account dropdown
  const accountOptions = [...new Set(stocks.map(s => s.account_type).filter(Boolean))]

  // Group stocks by symbol so user can see which account each belongs to
  const stockOptions = stocks.map(s => ({
    id:    s.id,
    label: s.account_type
      ? `${s.symbol} — ${s.account_type}`
      : s.symbol,
    symbol:  s.symbol,
    account: s.account_type || "",
  }))

  const onForm = async (data) => {
    await onSubmit(data)
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record Dividend</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onForm)} className="space-y-4">

          {/* Stock — shows symbol + account */}
          <div className="space-y-1.5">
            <Label>Stock *</Label>
            <Controller
              name="stock_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className={errors.stock_id ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select stock" />
                  </SelectTrigger>
                  <SelectContent>
                    {stockOptions.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="font-medium">{s.symbol}</span>
                        {s.account && (
                          <span className="ml-2 text-xs text-muted-foreground">{s.account}</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.stock_id && <p className="text-xs text-destructive">{errors.stock_id.message}</p>}
          </div>

          {/* Account — auto-filled from stock but editable */}
          <div className="space-y-1.5">
            <Label>Account *</Label>
            <Controller
              name="account_type"
              control={control}
              render={({ field }) => (
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
              )}
            />
            {errors.account_type && <p className="text-xs text-destructive">{errors.account_type.message}</p>}
            <p className="text-xs text-muted-foreground">Auto-filled from stock — change if needed.</p>
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount ($) *</Label>
              <Input type="number" step="0.01" min="0" {...register("amount")} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" {...register("date")} />
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
              onClick={() => { reset(); onOpenChange(false) }}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record Dividend"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
