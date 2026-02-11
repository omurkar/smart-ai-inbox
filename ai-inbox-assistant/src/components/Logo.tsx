import { MailCheck } from 'lucide-react'

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid size-9 place-items-center rounded-xl bg-indigo-500/20 ring-1 ring-indigo-500/30">
        <MailCheck className="size-5 text-indigo-200" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">Smart AI Inbox</div>
        <div className="text-xs text-slate-400">Assistant</div>
      </div>
    </div>
  )
}

