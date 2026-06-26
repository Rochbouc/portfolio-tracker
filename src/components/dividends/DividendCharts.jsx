import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { StockLogoButton } from "@/components/ui/StockPopup"

export default function DividendCharts({ dividends = [], stocks = [] }) {
  const year = new Date().getFullYear()
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(2024, i).toLocaleString("default", { month:"short" }),
    amount: 0
  }))
  dividends.forEach(d => {
    const dt = new Date(d.date)
    if (dt.getFullYear() === year) monthly[dt.getMonth()].amount += d.amount || 0
  })
  const byStock = {}
  dividends.forEach(d => {
    const sym = stocks.find(s => s.id === d.stock_id)?.symbol || d.stock_id
    byStock[sym] = (byStock[sym] || 0) + (d.amount || 0)
  })
  const stockData = Object.entries(byStock).map(([symbol, amount]) => ({ symbol, amount })).sort((a,b) => b.amount - a.amount)
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Monthly Dividends ({year})</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthly}>
              <XAxis dataKey="month" tick={{ fontSize:11 }} />
              <YAxis tick={{ fontSize:11 }} />
              <Tooltip formatter={v => ["$" + v.toFixed(2), "Amount"]} />
              <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">By Stock</CardTitle></CardHeader>
        <CardContent>
          {stockData.length === 0 ? <div className="text-center py-8 text-muted-foreground text-sm">No data</div> : (
            <div className="space-y-2 pt-2">
              {stockData.map(s => {
                const stk = stocks.find(st => st.symbol === s.symbol)
                return (
                  <div key={s.symbol} className="flex items-center gap-2">
                    <StockLogoButton symbol={s.symbol} name={stk?.name || s.symbol} size={24} stock={stk} />
                    <span className="text-sm font-medium w-16 truncate">{s.symbol}</span>
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full" style={{ width: `${(s.amount/stockData[0].amount)*100}%` }} />
                    </div>
                    <span className="text-sm font-semibold">${s.amount.toFixed(2)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
