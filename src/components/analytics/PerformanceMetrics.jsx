import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function PerformanceMetrics({ stocks, prices }) {
  const holdings = stocks.map(s => {
    const livePrice = prices?.[s.symbol];
    const price = livePrice?.price ?? s.current_price ?? 0;
    const value = price * (s.shares || 0);
    const cost = (s.avg_cost || 0) * (s.shares || 0);
    const gain = value - cost;
    const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
    return { ...s, price, value, cost, gain, gainPct };
  });

  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  const totalCost = holdings.reduce((s, h) => s + h.cost, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  const best = holdings.sort((a,b) => b.gainPct - a.gainPct)[0];
  const worst = [...holdings].sort((a,b) => a.gainPct - b.gainPct)[0];

  const fmt = (n) => `$${Math.abs(n).toFixed(2)}`;
  const fmtPct = (n) => `${n >= 0 ? "+" : "-"}${Math.abs(n).toFixed(2)}%`;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Performance Summary</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Total Value</p>
            <p className="font-bold text-lg">${totalValue.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total Cost</p>
            <p className="font-bold text-lg">${totalCost.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total Gain/Loss</p>
            <p className={cn("font-semibold", totalGain >= 0 ? "text-green-600" : "text-red-600")}>
              {totalGain >= 0 ? "+" : "-"}{fmt(totalGain)} ({fmtPct(totalGainPct)})
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Holdings</p>
            <p className="font-semibold">{stocks.length}</p>
          </div>
          {best && (
            <div>
              <p className="text-muted-foreground">Best Performer</p>
              <p className="font-semibold text-green-600">{best.symbol} {fmtPct(best.gainPct)}</p>
            </div>
          )}
          {worst && worst.symbol !== best?.symbol && (
            <div>
              <p className="text-muted-foreground">Worst Performer</p>
              <p className="font-semibold text-red-600">{worst.symbol} {fmtPct(worst.gainPct)}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
