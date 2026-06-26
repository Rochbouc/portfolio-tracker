import * as React from "react"
import { cn } from "@/lib/utils"
import { X, Bell, CheckCircle, AlertCircle, Info } from "lucide-react"

const ToastContext = React.createContext(null)

const ICONS = {
  default:     <Info     className="h-4 w-4 text-blue-500 flex-shrink-0" />,
  success:     <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />,
  destructive: <AlertCircle  className="h-4 w-4 text-red-500 flex-shrink-0" />,
  alert:       <Bell     className="h-5 w-5 text-yellow-500 flex-shrink-0 animate-pulse" />,
}

const STYLES = {
  default:     "bg-white border-gray-200 text-gray-900",
  success:     "bg-white border-green-300 text-gray-900",
  destructive: "bg-red-50 border-red-300 text-red-900",
  alert:       "bg-yellow-50 border-yellow-400 text-yellow-900 shadow-yellow-100",
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([])

  const toast = React.useCallback(({ title, description, variant = "default", duration = 4000, persistent = false }) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, title, description, variant, persistent }])
    if (!persistent && duration > 0) {
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration)
    }
    return id
  }, [])

  const dismiss = React.useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-80 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto rounded-xl border shadow-lg px-4 py-3 flex items-start gap-3 transition-all duration-300",
              "animate-in slide-in-from-bottom-2",
              STYLES[t.variant] || STYLES.default,
              t.variant === "alert" && "shadow-xl ring-1 ring-yellow-300"
            )}
          >
            <div className="mt-0.5">{ICONS[t.variant] || ICONS.default}</div>
            <div className="flex-1 min-w-0">
              {t.title && <div className="font-semibold text-sm leading-tight">{t.title}</div>}
              {t.description && <div className="text-xs mt-0.5 opacity-80 leading-snug">{t.description}</div>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-gray-400 hover:text-gray-700 flex-shrink-0 mt-0.5 p-0.5 rounded hover:bg-black/10 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return { toast: ctx.toast, dismiss: ctx.dismiss }
}
