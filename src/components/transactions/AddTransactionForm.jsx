import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2 } from "lucide-react"

const BUILTIN_ACCOUNTS = ["RRSP","TFSA","FHSA","Cash","Margin","USD Cash"]
const ACCOUNTS_KEY = "custom_account_types"
function loadCustomAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]") } catch { return [] }
}

const schema = z.object({
  stock_id: z.string().min(1,"Required"),
  account_type: z.string().optional(),
  type: z.enum(["buy","sell"]),
  shares: z.coerce.number().positive("Must be positive"),
  price: z.coerce.number().positive("Must be positive"),
  date: z.string().min(1,"Required"),
  notes: z.string().optional(),
})

export default function AddTransactionForm({ open, onOpenChange, onSubmit, stocks = [] }) {
  const customAccounts = loadCustomAccounts()
  const allAccounts = [...BUILTIN_ACCOUNTS, ...customAccounts].filter((v,i,a) => a.indexOf(v)===i)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { type:"buy", date: new Date().toISOString().slice(0,10) }
  })

  const selectedStockId = watch("stock_id")
  const selectedStock = stocks.find(s => s.id === selectedStockId)
  const currency = selectedStock?.currency || "USD"
  const totalValue = (watch("shares") || 0) * (watch("price") || 0)

  const onForm = async (data) => {
    const stock = stocks.find(s => s.id === data.stock_id)
    await onSubmit({
      ...data,
      symbol: stock?.symbol,
      stock_name: stock?.name,
      // Default account to stock's account if not overridden
      account_type: data.account_type || stock?.account_type || "",
    })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => { if(!v) reset(); onOpenChange(v) }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onForm)} className="space-y-4">

          {/* Stock picker */}
          <div className="space-y-1.5">
            <Label className="text-gray-700 font-medium">Stock *</Label>
            <Select onValueChange={v => {
              setValue("stock_id", v, { shouldValidate: true })
              // Auto-set account from stock
              const s = stocks.find(st => st.id === v)
              if (s?.account_type) setValue("account_type", s.account_type)
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a stock..." />
              </SelectTrigger>
              <SelectContent>
                {stocks.length === 0
                  ? <SelectItem value="__none__" disabled>No stocks added yet</SelectItem>
                  : stocks.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="font-semibold">{s.symbol}</span>
                      <span className="text-gray-400 ml-1.5">— {s.name}</span>
                    </SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
            {errors.stock_id && <p className="text-xs text-red-500">{errors.stock_id.message}</p>}
          </div>

          {/* Account Type */}
          <div className="space-y-1.5">
            <Label className="text-gray-700 font-medium">Account</Label>
            <Select
              value={watch("account_type") || ""}
              onValueChange={v => setValue("account_type", v === "none_selected" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account (auto-filled from stock)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none_selected">— None —</SelectItem>
                {allAccounts.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Type + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-gray-700 font-medium">Type</Label>
              <Select onValueChange={v => setValue("type", v)} defaultValue="buy">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">🟢 Buy</SelectItem>
                  <SelectItem value="sell">🔴 Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-700 font-medium">Date *</Label>
              <Input type="date" {...register("date")} className="bg-white border-gray-300 text-gray-900" />
            </div>
          </div>

          {/* Shares + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-gray-700 font-medium">Shares *</Label>
              <Input type="number" step="0.0001" {...register("shares")} placeholder="100" className="bg-white border-gray-300 text-gray-900" />
              {errors.shares && <p className="text-xs text-red-500">{errors.shares.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-700 font-medium">Price / Share ({currency}) *</Label>
              <Input type="number" step="0.01" {...register("price")} placeholder="0.00" className="bg-white border-gray-300 text-gray-900" />
              {errors.price && <p className="text-xs text-red-500">{errors.price.message}</p>}
            </div>
          </div>

          {/* Total preview */}
          {totalValue > 0 && (
            <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
              <span className="text-gray-500">Total: </span>
              <span className="font-semibold text-gray-900">
                {new Intl.NumberFormat("en-CA", { style:"currency", currency }).format(totalValue)}
              </span>
              {watch("account_type") && (
                <span className="text-gray-400 ml-2">· {watch("account_type")}</span>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-gray-700 font-medium">Notes (optional)</Label>
            <Input {...register("notes")} placeholder="e.g. dividend reinvestment" className="bg-white border-gray-300 text-gray-900" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { reset(); onOpenChange(false) }}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : "Add Transaction"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
