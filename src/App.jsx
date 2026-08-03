import { useState, useEffect } from "react"
import Dashboard from "@/pages/Dashboard"
import Login, { isAuthenticated } from "@/components/auth/Login"
import { auth, firebaseConfigured } from "@/api/firebase"
import { onAuthStateChanged } from "firebase/auth"
import { setSyncUser, downloadCloudDataToLocal } from "@/api/localData"

export default function App() {
  const [authed, setAuthed]   = useState(() => (firebaseConfigured ? null : isAuthenticated()))
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!firebaseConfigured) return
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setSyncUser(user.uid)
        setSyncing(true)
        await downloadCloudDataToLocal()
        setSyncing(false)
        setAuthed(true)
      } else {
        setSyncUser(null)
        setAuthed(false)
      }
    })
    return unsub
  }, [])

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    )
  }
  if (!authed) return <Login onLogin={() => { if (!firebaseConfigured) setAuthed(true) }} />
  if (syncing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white text-sm">Syncing your data from the cloud…</p>
        </div>
      </div>
    )
  }
  return <Dashboard />
}
