import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PriceAlert } from "@/api/localData";
import { Bell, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PriceAlerts({ stocks, prices }) {
  const [alerts, setAlerts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [stockId, setStockId] = useState("");
  const [condition, setCondition] = useState("above");
  const [targetPrice, setTargetPrice] = useState("");

  useEffect(() => { PriceAlert.list().then(setAlerts); }, []);

  async function handleAdd() {
    if (!stockId || !targetPrice) return;
    const stock = stocks.find(s => s.id === stockId);
    await PriceAlert.create({ stock_id: stockId, symbol: stock?.symbol || "", condition, target_price: parseFloat(targetPrice) });
    PriceAlert.list().then(setAlerts);
    setShowForm(false); setStockId(""); setTargetPrice("");
  }

  async function handleDelete(id) {
    await PriceAlert.delete(id);
    PriceAlert.list().then(setAlerts);
  }

  function isTriggered(alert) {
    const live = prices?.[alert.symbol];
    if (!live?.price) return false;
    return alert.condition === "above" ? live.price >= alert.target_price : live.price <= alert.target_price;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg flex items-center gap-2"><Bell className="h-4 w-4" />Price Alerts</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setShowForm(v => !v)}><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Alerts are visual only — no emails are sent (this runs entirely in your browser).</p>
        {showForm && (
          <div className="border rounded-md p-3 space-y-3">
            <div>
              <Label>Stock</Label>
              <Select value={stockId} onValueChange={setStockId}>
                <SelectTrigger><SelectValue placeholder="Select stock" /></SelectTrigger>
                <SelectContent>{stocks.map(s => <SelectItem key={s.id} value={s.id}>{s.symbol}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Condition</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="above">Price above</SelectItem>
                    <SelectItem value="below">Price below</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target Price ($)</Label>
                <Input type="number" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd}>Save Alert</Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {alerts.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-2">No alerts set.</p>
        ) : (
          <div className="space-y-1">
            {alerts.map(alert => {
              const triggered = isTriggered(alert);
              return (
                <div key={alert.id} className={cn("flex items-center justify-between p-2 rounded", triggered && "bg-yellow-50 border border-yellow-200")}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{alert.symbol}</span>
                    <span className="text-xs text-muted-foreground">{alert.condition} ${alert.target_price}</span>
                    {triggered && <Badge className="bg-yellow-500 text-white text-xs">Triggered!</Badge>}
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(alert.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
