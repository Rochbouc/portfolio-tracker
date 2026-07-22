import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getRate } from "@/api/rateContext"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import { StockLogoButton } from "@/components/ui/StockPopup"

export default function DividendCharts({ dividends = [], stocks = [], globalCurrency = "CAD" }) {
  const year = new Date().getFullYear()
  const USD_CAD = getRate()

  // Monthly amounts (only current year)
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(2024, i).toLocaleString("default", { month: "short" }),
    amount: 0,
    cumulative: 0,
  }))

  dividends.forEach(d => {
    if (!d.date?.slice(0,4) === String(year)) return
    if (d.date?.slice(0,4) !== String(year)) return
    const dt = new Date(d.date + "T12:00:00")  // noon to avoid timezone issues
    const m = dt.getMonth()
    const cur = d.currency || stocks.find(s => s.id === d.stock_id)?.currency || "CAD"
    const amt = cur === "USD" && globalCurrency === "CAD" ? (d.amount||0) * USD_CAD
              : cur === "CAD" && globalCurrency === "USD" ? (d.amount||0) / USD_CAD
              : (d.amount||0)
    monthly[m].amount += amt
  })

  // Build cumulative
  let running = 0
  monthly.forEach(m => { running += m.amount; m.cumulative = running })

  // By stock (all years)
  const byStock = {}
  dividends.forEach(d => {
    if (!d.stock_id) return
    const sym = stocks.find(s => s.id === d.stock_id)?.symbol || ""
    if (!sym) return
    const cur = d.currency || stocks.find(s => s.id === d.stock_id)?.currency || "CAD"
    const amt = cur === "USD" && globalCurrency === "CAD" ? (d.amount||0) * USD_CAD
              : cur === "CAD" && globalCurrency === "USD" ? (d.amount||0) / USD_CAD
              : (d.amount||0)
    byStock[sym] = (byStock[sym] || 0) + amt
  })
  const stockData = Object.entries(byStock).map(([symbol, amount]) => ({ symbol, amount })).sort((a,b) => b.amount - a.amount)
  const cur = globalCurrency

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Cumulative monthly chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Monthly Dividends {year} — Cumulative ({cur})</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthly} margin={{top:4,right:4,left:0,bottom:0}}>
              <defs>
                <linearGradient id="divGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false}/>
              <XAxis dataKey="month" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} width={50}
                tickFormatter={v=>"$"+v.toFixed(0)}/>
              <Tooltip formatter={v=>["$"+v.toFixed(2), "Cumulative"]}/>
              <Area type="monotone" dataKey="cumulative" stroke="#3b82f6" strokeWidth={2}
                fill="url(#divGrad)" dot={{r:3,fill:"#3b82f6"}}/>
            </AreaChart>
          </ResponsiveContainer>
          <div className="text-right text-xs text-gray-400 mt-1">
            Total: {cur}${monthly[monthly.length-1].cumulative.toFixed(2)}
          </div>
        </CardContent>
      </Card>

      {/* By stock */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">By Stock (All time, {cur})</CardTitle>
        </CardHeader>
        <CardContent>
          {stockData.length === 0
            ? <div className="text-center py-8 text-muted-foreground text-sm">No data</div>
            : <div className="space-y-2 pt-1 overflow-y-auto max-h-[180px]">
                {stockData.map(s => {
                  const stk = stocks.find(st => st.symbol === s.symbol)
                  return (
                    <div key={s.symbol} className="flex items-center gap-2">
                      <StockLogoButton symbol={s.symbol} name={stk?.name||s.symbol} size={22} stock={stk}/>
                      <span className="text-xs font-medium w-14 truncate">{s.symbol}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full"
                          style={{width:`${(s.amount/stockData[0].amount)*100}%`}}/>
                      </div>
                      <span className="text-xs font-semibold text-gray-700">${s.amount.toFixed(0)}</span>
                    </div>
                  )
                })}
              </div>
          }
        </CardContent>
      </Card>
    </div>
  )
}
