import { useState, useRef, useEffect, Component } from "react"
import { X, Plus, ChevronDown, ChevronUp, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Error Boundary ────────────────────────────────────────────────
export class WidgetErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  componentDidCatch(e) { console.error("Widget error:", e) }
  render() {
    if (this.state.error) return (
      <div className="p-4 text-xs text-red-600 bg-red-50 rounded border border-red-200">
        <div className="font-semibold mb-1">⚠️ {this.props.title||"Widget"} error</div>
        <div className="text-red-400 mb-2">{this.state.error?.message}</div>
        <button onClick={()=>this.setState({error:null})} className="text-xs underline">Retry</button>
      </div>
    )
    return this.props.children
  }
}

// ── Widget with resize by dragging edges ──────────────────────────
export function Widget({ id, tabId, title, defaultSize="full", children }) {
  const key          = `wgt_${tabId}_${id}`
  const wrapRef      = useRef(null)
  const isResizing   = useRef(false)

  const [widthPx,   setWidthPx]   = useState(()=>{ try{ const v=localStorage.getItem(key+"_wpx"); return v?+v:null }catch{return null} })
  const [heightPx,  setHeightPx]  = useState(()=>{ try{ const v=localStorage.getItem(key+"_hpx"); return v?+v:null }catch{return null} })
  const [collapsed, setCollapsed] = useState(()=>{ try{ return localStorage.getItem(key+"_col")==="1" }catch{return false} })
  const [hidden,    setHidden]    = useState(()=>{ try{ return localStorage.getItem(key+"_rm")==="1" }catch{return false} })

  function toggleCollapse(){ const v=!collapsed; setCollapsed(v); localStorage.setItem(key+"_col",v?"1":"0") }
  function remove(){ setHidden(true); localStorage.setItem(key+"_rm","1") }
  function resetSize(){ setWidthPx(null); setHeightPx(null); localStorage.removeItem(key+"_wpx"); localStorage.removeItem(key+"_hpx") }

  // RIGHT edge resize
  function onRightMouseDown(e) {
    e.preventDefault(); e.stopPropagation()
    isResizing.current = true
    const startX = e.clientX
    const startW = wrapRef.current?.offsetWidth || 400
    // Disable draggable on parent during resize
    const parent = wrapRef.current?.parentElement
    if (parent) parent.draggable = false

    function onMove(ev) {
      const newW = Math.max(180, startW + (ev.clientX - startX))
      setWidthPx(newW)
    }
    function onUp() {
      isResizing.current = false
      if (parent) parent.draggable = true
      const finalW = wrapRef.current?.offsetWidth
      if (finalW) localStorage.setItem(key+"_wpx", String(finalW))
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  // BOTTOM edge resize
  function onBottomMouseDown(e) {
    e.preventDefault(); e.stopPropagation()
    isResizing.current = true
    const startY = e.clientY
    const startH = wrapRef.current?.offsetHeight || 200
    const parent = wrapRef.current?.parentElement
    if (parent) parent.draggable = false

    function onMove(ev) {
      const newH = Math.max(80, startH + (ev.clientY - startY))
      setHeightPx(newH)
    }
    function onUp() {
      isResizing.current = false
      if (parent) parent.draggable = true
      const finalH = wrapRef.current?.offsetHeight
      if (finalH) localStorage.setItem(key+"_hpx", String(finalH))
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  if (hidden) return null

  const defaultCls = defaultSize==="half"  ? "w-full md:w-[calc(50%-6px)]"
                   : defaultSize==="third" ? "w-full md:w-[calc(33%-8px)]"
                   : "w-full"

  const style = {}
  if (widthPx)  style.width     = widthPx  + "px"
  if (heightPx) style.minHeight = heightPx + "px"

  return (
    <div
      ref={wrapRef}
      className={cn("relative flex-shrink-0", !widthPx && defaultCls)}
      style={style}
    >
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-2 py-1.5 bg-gray-50 border-b border-gray-100 select-none flex-shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0"/>
            <span className="text-[11px] font-semibold text-gray-500 truncate">{title}</span>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-2">
            {(widthPx||heightPx) && (
              <button onClick={resetSize}
                className="text-[9px] text-gray-400 hover:text-blue-500 px-1 py-0.5 rounded hover:bg-blue-50 border border-gray-200 mr-0.5">
                Reset size
              </button>
            )}
            <button onClick={toggleCollapse}
              className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200">
              {collapsed?<ChevronDown className="h-3.5 w-3.5"/>:<ChevronUp className="h-3.5 w-3.5"/>}
            </button>
            <button onClick={remove}
              className="p-0.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50" title="Remove">
              <X className="h-3.5 w-3.5"/>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {collapsed
            ? <div className="px-3 py-2 text-xs text-gray-400 italic cursor-pointer" onClick={toggleCollapse}>Click to expand</div>
            : <WidgetErrorBoundary title={title}>{children}</WidgetErrorBoundary>
          }
        </div>
      </div>

      {/* RIGHT resize handle */}
      <div
        onMouseDown={onRightMouseDown}
        className="absolute top-0 right-0 w-3 h-full cursor-col-resize z-20 flex items-center justify-end"
        style={{touchAction:"none"}}
      >
        <div className="w-1 h-8 rounded-full bg-gray-300 opacity-0 hover:opacity-100 transition-opacity mr-0.5"/>
      </div>

      {/* BOTTOM resize handle */}
      <div
        onMouseDown={onBottomMouseDown}
        className="absolute bottom-0 left-0 w-full h-3 cursor-row-resize z-20 flex items-end justify-center"
        style={{touchAction:"none"}}
      >
        <div className="h-1 w-8 rounded-full bg-gray-300 opacity-0 hover:opacity-100 transition-opacity mb-0.5"/>
      </div>

      {/* BOTTOM-RIGHT corner handle */}
      <div
        onMouseDown={(e)=>{ onRightMouseDown(e); onBottomMouseDown(e) }}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-30"
        style={{touchAction:"none"}}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" className="absolute bottom-1 right-1 text-gray-300">
          <path d="M9 1L1 9M9 5L5 9M9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  )
}

// ── Widget Grid with drag-to-reorder ─────────────────────────────
export function WidgetGrid({ tabId, defaultWidgets, renderWidget, availableWidgets=[] }) {
  const orderKey = `wgt_order_${tabId}`

  const [order, setOrder] = useState(()=>{
    try {
      const saved = JSON.parse(localStorage.getItem(orderKey)||"null")
      if (saved && Array.isArray(saved)) {
        const ids    = defaultWidgets.map(w=>w.id)
        const newOnes = ids.filter(id=>!saved.includes(id))
        return [...saved.filter(id=>ids.includes(id)), ...newOnes]
      }
    } catch {}
    return defaultWidgets.map(w=>w.id)
  })

  const [dragId,   setDragId]   = useState(null)
  const [dropId,   setDropId]   = useState(null)
  const [showAdd,  setShowAdd]  = useState(false)
  const dragCounter              = useRef(0)

  function saveOrder(o){ setOrder(o); localStorage.setItem(orderKey, JSON.stringify(o)) }

  // Use dragId ref so handlers always have current value
  const dragIdRef = useRef(null)

  function handleDragStart(e, id) {
    dragIdRef.current = id
    setDragId(id)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("widgetId", id)
  }
  function handleDragOver(e, id) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (id !== dragIdRef.current) setDropId(id)
  }
  function handleDrop(e, targetId) {
    e.preventDefault()
    const fromId = e.dataTransfer.getData("widgetId") || dragIdRef.current
    if (!fromId || fromId===targetId) { setDragId(null); setDropId(null); dragIdRef.current=null; return }
    const arr = [...order]
    const fi  = arr.indexOf(fromId)
    const ti  = arr.indexOf(targetId)
    if (fi===-1||ti===-1) { setDragId(null); setDropId(null); dragIdRef.current=null; return }
    arr.splice(ti, 0, arr.splice(fi,1)[0])
    saveOrder(arr)
    setDragId(null); setDropId(null); dragIdRef.current=null
  }
  function handleDragEnd() { setDragId(null); setDropId(null); dragIdRef.current=null }

  const removedFromTab = defaultWidgets.filter(w=>{
    try{ return localStorage.getItem(`wgt_${tabId}_${w.id}_rm`)==="1" }catch{return false}
  })
  const addable = [...removedFromTab, ...availableWidgets.filter(w=>!defaultWidgets.find(d=>d.id===w.id))]

  function addWidget(wDef) {
    try{ localStorage.removeItem(`wgt_${tabId}_${wDef.id}_rm`) }catch{}
    if (!order.includes(wDef.id)) saveOrder([...order, wDef.id])
    setShowAdd(false)
    window.location.reload()
  }

  const sorted = order.map(id=>defaultWidgets.find(w=>w.id===id)).filter(Boolean)

  return (
    <div>
      {/* Add Widget button — TOP */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={()=>setShowAdd(s=>!s)}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 border transition-colors",
            showAdd?"bg-blue-600 text-white border-blue-600":"bg-white text-blue-600 border-blue-200 hover:bg-blue-50"
          )}>
          <Plus className="h-3.5 w-3.5"/> Add / Restore Widget
        </button>
      </div>

      {showAdd && (
        <div className="mb-3 bg-white rounded-xl border border-blue-100 shadow-md p-3">
          {addable.length===0
            ? <p className="text-xs text-gray-400">All widgets are on this page.</p>
            : <div className="flex flex-wrap gap-2">
                {addable.map(w=>(
                  <button key={w.id} onClick={()=>addWidget(w)}
                    className="text-xs bg-gray-50 hover:bg-blue-50 hover:text-blue-700 text-gray-700 rounded-lg px-3 py-1.5 border border-gray-200 hover:border-blue-300">
                    + {w.label||w.title||w.id}
                  </button>
                ))}
              </div>
          }
          <button onClick={()=>setShowAdd(false)} className="mt-2 text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-start">
        {sorted.map(w=>(
          <div key={w.id}
            draggable
            onDragStart={e=>handleDragStart(e, w.id)}
            onDragOver={e=>handleDragOver(e, w.id)}
            onDrop={e=>handleDrop(e, w.id)}
            onDragEnd={handleDragEnd}
            className={cn(
              "w-full cursor-move",
              dragId===w.id ? "opacity-30 scale-[0.98] transition-all" : "transition-all",
              dropId===w.id ? "ring-2 ring-blue-400 rounded-xl ring-offset-2" : ""
            )}
          >
            {renderWidget(w)}
          </div>
        ))}
        {sorted.length===0 && (
          <div className="w-full text-center py-16 text-gray-300 text-sm">
            No widgets here. <span className="text-blue-400 cursor-pointer underline" onClick={()=>setShowAdd(true)}>Add one</span>
          </div>
        )}
      </div>
    </div>
  )
}
