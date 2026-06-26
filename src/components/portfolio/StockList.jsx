import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Pencil, Trash2, RefreshCw, TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"
export default function StockList({ stocks = [], prices = {}, onEdit, onDelete, onRefreshPrices, refreshing }) {
  const fmt = (n, currency = "USD") =>
    n == null ? "-" : new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(n)
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Holdings</CardTitle>
        <Button variant="outline" size="sm" onClick={onRefreshPrices} disabled={refreshing}>
          <RefreshCw className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing..." : "Refresh Prices"}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {stocks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No stocks yet. Click Add Stock to get started.</div>
        ) : (
          <div className="divide-y">
            {stocks.map(stock => {
              const q = prices[stock.symbol]
              const marketValue = q?.price ? q.price * stock.shares : stock.avg_cost * stock.shares
              const costBasis = stock.avg_cost * stock.shares
              const gain = marketValue - costBasis
              const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0
              return (
                <div key={stock.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
                      {stock.symbol.replace(".TO","").replace(".V","").slice(0,3)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm flex items-center gap-1.5">
                        {stock.symbol}
                        {stock.currency === "CAD" && <Badge variant="outline" className="text-xs py-0 px-1">CAD</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate max-w-40">{stock.name}</div>
                      <div className="text-xs text-muted-foreground">{stock.shares} sh @ {fmt(stock.avg_cost, stock.currency)}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <div className="font-semibold text-sm">{fmt(marketValue, stock.currency)}</div>
                    {q?.price ? (
                      <div className={cn("text-xs font-medium flex items-center justify-end gap-0.5", gain >= 0 ? "text-green-600" : "text-red-600")}>
                        {gain >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {fmt(gain, stock.currency)} ({gainPct.toFixed(1)}%)
                      </div>
                    ) : <div className="text-xs text-muted-foreground">No price</div>}
                    {q?.price && <div className="text-xs text-muted-foreground">{fmt(q.price, stock.currency)}/sh</div>}
                  </div>
                  <div className="flex gap-1 ml-3">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(stock)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(stock.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}