import { useState, useRef, useCallback, useEffect } from "react"
import { GripVertical, X, Maximize2, Minimize2, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

const LAYOUT_KEY = "dashboard_layout_v3"
const TABS_KEY   = "dashboard_tab_order_v2"

// ── Default widget definitions per tab ────────────────────────────
export const DEFAULT_TAB_ORDER = [
  { id:"holdings",    label:"Holdings" },
  { id:"watchlist",   label:"Watchlist" },
  { id:"closed",      label:"Closed" },
  { id:"dividends",   label:"Dividends" },
  { id:"transactions",label:"Transactions" },
  { id:"analytics",   label:"Analytics" },
  { id:"summary",     label:"Account Summary" },
  { id:"projection",  label:"Projection at 60" },
]

// ── Persist helpers ───────────────────────────────────────────────
function loadLayout() { try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}") } catch { return {} } }
function saveLayout(l) { localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)) }
function loadTabOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(TABS_KEY) || "null")
    if (!saved) return DEFAULT_TAB_ORDER
    // Merge: keep saved order but add any new tabs
    const savedIds = saved.map(t => t.id)
    const newTabs  = DEFAULT_TAB_ORDER.filter(t => !savedIds.includes(t.id))
    return [...saved, ...newTabs]
  } catch { return DEFAULT_TAB_ORDER }
}
function saveTabOrder(o) { localStorage.setItem(TABS_KEY, JSON.stringify(o)) }

// ── Draggable Tab Bar ─────────────────────────────────────────────
export function DraggableTabBar({ tabOrder, activeTab, onTabChange, onReorder }) {
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  function handleDragStart(e, id) {
    setDragging(id)
    e.dataTransfer.effectAllowed = "move"
  }
  function handleDragOver(e, id) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (id !== dragging) setDragOver(id)
  }
  function handleDrop(e, targetId) {
    e.preventDefault()
    if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return }
    const arr = [...tabOrder]
    const fromIdx = arr.findIndex(t => t.id === dragging)
    const toIdx   = arr.findIndex(t => t.id === targetId)
    arr.splice(toIdx, 0, arr.splice(fromIdx, 1)[0])
    onReorder(arr)
    setDragging(null); setDragOver(null)
  }
  function handleDragEnd() { setDragging(null); setDragOver(null) }

  return (
    <div className="flex gap-0.5 border-b border-gray-200 overflow-x-auto pb-0 items-end">
      {tabOrder.map(tab => (
        <div
          key={tab.id}
          draggable
          onDragStart={e => handleDragStart(e, tab.id)}
          onDragOver={e => handleDragOver(e, tab.id)}
          onDrop={e => handleDrop(e, tab.id)}
          onDragEnd={handleDragEnd}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "relative flex items-center gap-1 px-3 py-2 text-sm font-medium cursor-pointer whitespace-nowrap border-b-2 -mb-px transition-all select-none",
            activeTab === tab.id
              ? "border-blue-600 text-blue-600 bg-blue-50/50"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50",
            dragging === tab.id ? "opacity-40" : "",
            dragOver === tab.id ? "border-b-2 border-blue-400 bg-blue-50" : ""
          )}
        >
          <GripVertical className="h-3 w-3 text-gray-300 cursor-grab" />
          {tab.label}
        </div>
      ))}
    </div>
  )
}

// ── Draggable/Resizable Widget Card ───────────────────────────────
export function Widget({ id, title, children, onRemove, defaultSize = "full", tabId }) {
  const storageKey = `widget_${tabId}_${id}`
  const [size,      setSize]      = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || `"${defaultSize}"`) } catch { return defaultSize }
  })
  const [collapsed, setCollapsed] = useState(false)

  function cycleSize() {
    const sizes = ["full","half","third"]
    const next  = sizes[(sizes.indexOf(size) + 1) % sizes.length]
    setSize(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
  }

  const widthClass = {
    full:  "w-full",
    half:  "w-full md:w-[calc(50%-6px)]",
    third: "w-full md:w-[calc(33.333%-8px)]",
  }[size] || "w-full"

  return (
    <div className={cn("relative group flex-shrink-0", widthClass)}>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Widget toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/60">
          <span className="text-xs font-semibold text-gray-600 truncate">{title}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={cycleSize}
              className="text-gray-400 hover:text-gray-700 p-0.5 rounded hover:bg-gray-200 transition-colors text-[10px] font-medium px-1.5"
              title={`Size: ${size} → click to change`}>
              {size === "full" ? "⬛ Full" : size === "half" ? "▬ Half" : "▪ Third"}
            </button>
            <button onClick={() => setCollapsed(c => !c)}
              className="text-gray-400 hover:text-gray-700 p-0.5 rounded hover:bg-gray-200 transition-colors">
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        {!collapsed && (
          <div className="p-0">
            {children}
          </div>
        )}
        {collapsed && (
          <div className="px-3 py-1.5 text-xs text-gray-400 italic">collapsed — click ▾ to expand</div>
        )}
      </div>
    </div>
  )
}

// ── Draggable Widget Grid ─────────────────────────────────────────
export function WidgetGrid({ tabId, widgets, renderWidget }) {
  const orderKey = `widget_order_${tabId}`
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(orderKey) || "null")
      if (saved) {
        const savedIds = saved
        const allIds   = widgets.map(w => w.id)
        const newOnes  = allIds.filter(id => !savedIds.includes(id))
        return [...savedIds.filter(id => allIds.includes(id)), ...newOnes]
      }
    } catch {}
    return widgets.map(w => w.id)
  })

  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  function saveOrder(o) { localStorage.setItem(orderKey, JSON.stringify(o)); setOrder(o) }

  function handleDragStart(e, id) {
    setDragging(id)
    e.dataTransfer.effectAllowed = "move"
  }
  function handleDragOver(e, id) {
    e.preventDefault()
    if (id !== dragging) setDragOver(id)
  }
  function handleDrop(e, targetId) {
    e.preventDefault()
    if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return }
    const arr = [...order]
    const fi  = arr.indexOf(dragging)
    const ti  = arr.indexOf(targetId)
    arr.splice(ti, 0, arr.splice(fi, 1)[0])
    saveOrder(arr)
    setDragging(null); setDragOver(null)
  }
  function handleDragEnd() { setDragging(null); setDragOver(null) }

  const sortedWidgets = order
    .map(id => widgets.find(w => w.id === id))
    .filter(Boolean)
    .concat(widgets.filter(w => !order.includes(w.id)))

  return (
    <div className="flex flex-wrap gap-3 items-start">
      {sortedWidgets.map(w => (
        <div key={w.id}
          draggable
          onDragStart={e => handleDragStart(e, w.id)}
          onDragOver={e => handleDragOver(e, w.id)}
          onDrop={e => handleDrop(e, w.id)}
          onDragEnd={handleDragEnd}
          className={cn("transition-all", dragging === w.id ? "opacity-40 scale-95" : "",
            dragOver === w.id ? "ring-2 ring-blue-400 ring-offset-1 rounded-xl" : "")}
          style={{ width: "100%" }}
        >
          {renderWidget(w)}
        </div>
      ))}
    </div>
  )
}

export { loadTabOrder, saveTabOrder }
