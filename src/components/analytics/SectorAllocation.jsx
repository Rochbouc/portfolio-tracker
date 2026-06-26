import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#84cc16","#f97316"];

export default function SectorAllocation({ stocks, prices }) {
  const bySector = stocks.reduce((acc, s) => {
    const livePrice = prices?.[s.symbol];
    const price = livePrice?.price ?? s.current_price ?? 0;
    const value = price * (s.shares || 0);
    const sector = s.sector || "Unknown";
    acc[sector] = (acc[sector] || 0) + value;
    return acc;
  }, {});

  const data = Object.entries(bySector).map(([name, value]) => ({ name, value: +value.toFixed(2) })).filter(d => d.value > 0);

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Sector Allocation</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
              label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => [`$${v.toFixed(2)}`, "Value"]} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
