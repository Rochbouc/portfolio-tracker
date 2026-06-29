import { useState } from "react"
import { Eye, EyeOff, Lock, TrendingUp } from "lucide-react"

const CREDENTIALS = {
  email:    "boucher.roch@gmail.com",
  password: "Rb123polpma!",
}
const SESSION_KEY = "portfolio_auth_v1"

export function isAuthenticated() {
  try { return localStorage.getItem(SESSION_KEY) === "true" } catch { return false }
}
export function logout() {
  localStorage.removeItem(SESSION_KEY)
  window.location.reload()
}

export default function Login({ onLogin }) {
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState("")
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setLoading(true)
    await new Promise(r => setTimeout(r, 600))
    if (email.trim().toLowerCase() === CREDENTIALS.email && password === CREDENTIALS.password) {
      localStorage.setItem(SESSION_KEY, "true")
      onLogin()
    } else {
      setError("Invalid email or password.")
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg">
            <TrendingUp className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Portfolio Tracker</h1>
          <p className="text-blue-300 text-sm mt-1">Sign in to your account</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                autoComplete="email" required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="your@email.com" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password" required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••••" />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 flex-shrink-0" />{error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Signing in…</>
                : "Sign In"}
            </button>
          </form>
        </div>
        <p className="text-center text-blue-400/60 text-xs mt-6">Private — authorized access only</p>
      </div>
    </div>
  )
}
