import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function PortfolioValueChart({ stocks, prices }) {
  // Build a simple allocation bar since we don't have historical portfolio snapshots
  const holdings = stocks.map(s => {
    const livePrice = prices?.[s.symbol];
    const price = livePrice?.price ?? s.current_price ?? 0;
    return { symbol: s.symbol, value: price * (s.shares || 0) };
  }).filter(h => h.value > 0).sort((a,b) => b.value - a.value);

  const total = holdings.reduce((s, h) => s + h.value, 0);

  if (holdings.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Portfolio Allocation</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-2">
          {holdings.map(h => {
            const pct = total > 0 ? (h.value / total) * 100 : 0;
            return (
              <div key={h.symbol}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{h.symbol}</span>
                  <span className="text-muted-foreground">${h.value.toFixed(0)} ({pct.toFixed(1)}%)</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
