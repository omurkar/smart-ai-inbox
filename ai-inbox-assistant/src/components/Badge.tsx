import { cn } from '../lib/utils'
import type { EmailCategory, EmailPriority, EmailSentiment, SuggestedAction } from '../types/mail'
import {
  AlertTriangle, Archive, CalendarPlus, FileSearch, Mail, MessageCircle,
  Reply, ShoppingBag, SmilePlus, Frown, Meh, Tag, Users, Bell, User, Briefcase, MailX,
} from 'lucide-react'

/* ── Priority Badge ── */

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

/* ── Sentiment Badge ── */

const sentimentConfig: Record<EmailSentiment, { label: string; style: string; Icon: typeof SmilePlus }> = {
  positive: { label: 'Positive', style: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', Icon: SmilePlus },
  neutral: { label: 'Neutral', style: 'bg-slate-500/15 text-slate-300 border-slate-500/30', Icon: Meh },
  negative: { label: 'Negative', style: 'bg-rose-500/15 text-rose-300 border-rose-500/30', Icon: Frown },
}

export function SentimentBadge({ sentiment, className }: { sentiment: EmailSentiment; className?: string }) {
  const cfg = sentimentConfig[sentiment]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        cfg.style,
        className,
      )}
    >
      <cfg.Icon className="size-3" />
      {cfg.label}
    </span>
  )
}

/* ── Category Badge ── */

const categoryConfig: Record<EmailCategory, { label: string; style: string; Icon: typeof Tag }> = {
  urgent: { label: 'Urgent', style: 'bg-red-500/15 text-red-300 border-red-500/30', Icon: AlertTriangle },
  promotional: { label: 'Promo', style: 'bg-pink-500/15 text-pink-300 border-pink-500/30', Icon: ShoppingBag },
  social: { label: 'Social', style: 'bg-blue-500/15 text-blue-300 border-blue-500/30', Icon: Users },
  updates: { label: 'Update', style: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30', Icon: Bell },
  personal: { label: 'Personal', style: 'bg-violet-500/15 text-violet-300 border-violet-500/30', Icon: User },
  general: { label: 'General', style: 'bg-slate-500/15 text-slate-300 border-slate-500/30', Icon: Briefcase },
}

export function CategoryBadge({ category, className }: { category: EmailCategory; className?: string }) {
  const cfg = categoryConfig[category]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        cfg.style,
        className,
      )}
    >
      <cfg.Icon className="size-3" />
      {cfg.label}
    </span>
  )
}

/* ── Suggested Action Chips ── */

const actionConfig: Record<SuggestedAction, { label: string; style: string; Icon: typeof Reply }> = {
  needs_reply: { label: 'Needs Reply', style: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/25', Icon: Reply },
  schedule_meeting: { label: 'Schedule Meeting', style: 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25', Icon: CalendarPlus },
  review_document: { label: 'Review Document', style: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/25', Icon: FileSearch },
  follow_up: { label: 'Follow Up', style: 'bg-orange-500/15 text-orange-300 border-orange-500/30 hover:bg-orange-500/25', Icon: MessageCircle },
  archive: { label: 'Archive', style: 'bg-slate-500/15 text-slate-300 border-slate-500/30 hover:bg-slate-500/25', Icon: Archive },
  unsubscribe: { label: 'Unsubscribe', style: 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25', Icon: MailX },
}

export function SuggestedActionChips({
  actions,
  onAction,
  className,
}: {
  actions: SuggestedAction[]
  onAction?: (action: SuggestedAction) => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {actions.map((action) => {
        const cfg = actionConfig[action]
        return (
          <button
            key={action}
            type="button"
            onClick={() => onAction?.(action)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer',
              cfg.style,
            )}
          >
            <cfg.Icon className="size-3" />
            {cfg.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── Compose Email Icon ── */

export function ComposeIcon() {
  return <Mail className="size-4" />
}
