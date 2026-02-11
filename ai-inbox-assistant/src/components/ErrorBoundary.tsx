import type { ReactNode } from 'react'
import { Component } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <div className="mx-auto max-w-3xl px-6 py-12">
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
              <div className="text-sm font-semibold">App crashed</div>
              <div className="mt-2 text-xs text-rose-200">{this.state.error?.message}</div>
              <div className="mt-3 text-xs text-slate-300">
                Open DevTools → Console for the stack trace. Common fixes: run the dev server from the correct folder and
                open the correct localhost port.
              </div>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

