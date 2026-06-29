import { useState } from "react"
import Dashboard from "@/pages/Dashboard"
import Login, { isAuthenticated } from "@/components/auth/Login"

export default function App() {
  const [authed, setAuthed] = useState(() => isAuthenticated())
  if (!authed) return <Login onLogin={() => setAuthed(true)} />
  return <Dashboard />
}
