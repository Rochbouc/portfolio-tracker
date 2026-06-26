import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
export default function StatsCard({ title, value, subtitle, icon: Icon, trend, className }) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {trend != null && (
          <p className={cn("text-xs font-medium mt-1", trend >= 0 ? "text-green-600" : "text-red-600")}>
            {trend >= 0 ? "+" : ""}{trend.toFixed(2)}%
          </p>
        )}
      </CardContent>
    </Card>
  )
}