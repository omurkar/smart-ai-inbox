import { cn } from '../lib/utils'
import type { EmailPriority } from '../types/mail'

export function PriorityBadge({ priority, className }: { priority: EmailPriority; className?: string }) {
  const styles =
    priority === 'high'
      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
      : priority === 'medium'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : 'bg-slate-500/15 text-slate-300 border-slate-500/30'

  const label = priority === 'high' ? 'High' : priority === 'medium' ? 'Medium' : 'Low'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        styles,
        className,
      )}
    >
      {label} Priority
    </span>
  )
}

