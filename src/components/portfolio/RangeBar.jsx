import { cn } from "@/lib/utils"

// Small horizontal range bar — used for both the 52-week price range and
// the analyst 12-month price forecast range, with a marker showing where
// the current price sits within that range.
export default function RangeBar({ low, high, current, label, gradientClass, markerClass }) {
  if (low == null || high == null || high <= low || current == null) return null
  const pct = Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100))
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
        <span>${low.toFixed(2)}</span>
        <span className="text-gray-400">{label}</span>
        <span>${high.toFixed(2)}</span>
      </div>
      <div className="relative h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={cn("absolute inset-0 rounded-full opacity-50", gradientClass)} />
        <div className={cn("absolute top-0 bottom-0 w-1.5 rounded-full shadow-sm", markerClass)}
          style={{ left: `calc(${pct}% - 3px)` }} />
      </div>
    </div>
  )
}
