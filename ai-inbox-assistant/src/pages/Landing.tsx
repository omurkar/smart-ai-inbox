import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Logo } from '../components/Logo'
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from '../lib/auth'
import { useSessionStore } from '../store/session'
import { ArrowRight, Sparkles } from 'lucide-react'

function isFirebaseConfigured() {
  const env = import.meta.env
  return Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_AUTH_DOMAIN && env.VITE_FIREBASE_PROJECT_ID)
}

export function Landing() {
  const nav = useNavigate()
  const user = useSessionStore((s) => s.user)

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const firebaseOk = useMemo(() => isFirebaseConfigured(), [])

  useEffect(() => {
    if (user) nav('/app', { replace: true })
  }, [nav, user])

  async function onGoogle() {
    setError(null)
    setLoading(true)
    try {
      // Standard Google Auth—bypasses the unverified warning
      await signInWithGoogle()
      nav('/app')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed.')
    } finally {
      setLoading(false)
    }
  }

  async function onEmailAuth() {
    setError(null)
    setLoading(true)
    try {
      if (!email || !password) throw new Error('Enter email + password.')
      if (mode === 'signup') await signUpWithEmail(email, password)
      else await signInWithEmail(email, password)
      nav('/app')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Auth failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-full max-w-6xl items-center px-6 py-14">
        <div className="grid w-full gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <Logo />
            <div className="mt-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                <Sparkles className="size-4 text-indigo-200" />
                Tame your inbox with AI
              </div>
              <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight lg:text-5xl">
                Focus on what matters.
                <span className="text-indigo-300"> Let AI handle the noise.</span>
              </h1>
              <p className="mt-4 max-w-xl text-pretty text-slate-300">
                Smart AI Inbox Assistant reads your email, prioritizes what needs action, summarizes threads into
                1–2 sentences, and drafts context-aware replies you control.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-slate-100">Smart Prioritization</div>
                <div className="mt-1 text-xs text-slate-300">High / Medium / Low buckets—strict and actionable.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-slate-100">Instant Summaries</div>
                <div className="mt-1 text-xs text-slate-300">Bottom line in 3 seconds.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-slate-100">Auto Replies</div>
                <div className="mt-1 text-xs text-slate-300">Professional, Friendly, or Short tone—edit before send.</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{mode === 'signin' ? 'Sign in' : 'Create account'}</div>
                <div className="text-xs text-slate-400">
                  {firebaseOk ? 'Secure auth via Firebase' : 'Setup required: Firebase env vars missing'}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
              >
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </Button>
            </div>

            {!firebaseOk ? (
              <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
                Add Firebase config to <code className="rounded bg-black/30 px-1 py-0.5">.env</code> then restart dev server.
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {error}
              </div>
            ) : null}

            <div className="mt-5 grid gap-3">
              <Button type="button" variant="primary" onClick={onGoogle} disabled={loading || !firebaseOk}>
                Continue with Google <ArrowRight className="size-4" />
              </Button>

              <div className="my-1 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <div className="text-[11px] text-slate-400">or</div>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <Input
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!firebaseOk || loading}
              />
              <Input
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!firebaseOk || loading}
              />
              <Button type="button" variant="secondary" onClick={onEmailAuth} disabled={loading || !firebaseOk}>
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
            </div>

            <div className="mt-4 text-xs text-slate-400">
              By continuing you agree to keep the final “Send” action under your control (human-in-the-loop).
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}