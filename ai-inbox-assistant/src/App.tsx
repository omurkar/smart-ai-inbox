import { Navigate, Route, Routes } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { Dashboard } from './pages/Dashboard'
import { useSessionStore } from './store/session'
import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './lib/firebase'

function App() {
  const { authLoading, setAuthLoading, setUser, user } = useSessionStore()

  useEffect(() => {
    setAuthLoading(true)
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setAuthLoading(false)
    })
    return () => unsub()
  }, [setAuthLoading, setUser])

  return (
    <div className="min-h-full bg-slate-950 text-slate-100">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/app"
          element={
            authLoading ? (
              <div className="flex min-h-screen items-center justify-center text-sm text-slate-300">
                Loading…
              </div>
            ) : user ? (
              <Dashboard />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to={user ? '/app' : '/'} replace />} />
      </Routes>
    </div>
  )
}

export default App
