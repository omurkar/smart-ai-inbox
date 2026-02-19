import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { Logo } from '../components/Logo'
import { useMailStore } from '../store/mail'
import type { EmailCategory, EmailSentiment } from '../types/mail'
import {
  ArrowLeft, PieChart, TrendingUp, Inbox, CheckCircle2, Info, X, Zap, Clock, Coffee,
  Archive, SmilePlus, Meh, Frown, ShoppingBag, Users, Bell, User, Briefcase, AlertTriangle, Tag,
} from 'lucide-react'

export function Statistics() {
  const nav = useNavigate()
  const { emails, analysisById, archivedIds } = useMailStore()
  const [showInfo, setShowInfo] = useState(false)

  const stats = useMemo(() => {
    let high = 0, medium = 0, low = 0, archived = 0, unanalyzed = 0
    const sentimentCounts: Record<EmailSentiment, number> = { positive: 0, neutral: 0, negative: 0 }
    const categoryCounts: Record<EmailCategory, number> = { urgent: 0, promotional: 0, social: 0, updates: 0, personal: 0, general: 0 }

    for (const e of emails) {
      const analysis = analysisById[e.id]
      if (archivedIds.includes(e.id)) {
        archived++
      } else {
        const p = analysis?.priority
        if (p === 'high') high++
        else if (p === 'medium') medium++
        else if (p === 'low') low++
        else unanalyzed++
      }

      // Count sentiment and category for ALL analyzed emails (including archived)
      if (analysis) {
        if (analysis.sentiment) sentimentCounts[analysis.sentiment]++
        if (analysis.category) categoryCounts[analysis.category]++
      }
    }
    const total = emails.length
    return { high, medium, low, archived, unanalyzed, total, sentimentCounts, categoryCounts }
  }, [emails, analysisById, archivedIds])

  const totalAnalyzed = stats.high + stats.medium + stats.low + stats.archived
  const pHigh = totalAnalyzed ? (stats.high / totalAnalyzed) * 100 : 0
  const pMed = totalAnalyzed ? (stats.medium / totalAnalyzed) * 100 : 0
  const pLow = totalAnalyzed ? (stats.low / totalAnalyzed) * 100 : 0

  const pieGradient = `conic-gradient(
    #6366f1 0% ${pHigh}%,
    #f59e0b ${pHigh}% ${pHigh + pMed}%,
    #10b981 ${pHigh + pMed}% ${pHigh + pMed + pLow}%,
    #64748b ${pHigh + pMed + pLow}% 100%
  )`

  // Sentiment pie
  const totalSentiment = stats.sentimentCounts.positive + stats.sentimentCounts.neutral + stats.sentimentCounts.negative
  const sPos = totalSentiment ? (stats.sentimentCounts.positive / totalSentiment) * 100 : 0
  const sNeu = totalSentiment ? (stats.sentimentCounts.neutral / totalSentiment) * 100 : 0
  const sentimentGradient = `conic-gradient(
    #10b981 0% ${sPos}%,
    #64748b ${sPos}% ${sPos + sNeu}%,
    #f43f5e ${sPos + sNeu}% 100%
  )`

  let insightTitle = "Inbox Insights"
  let insightText = "Your inbox is looking balanced. Keep up the great work!"
  if (stats.high > stats.medium && stats.high > stats.low) {
    insightTitle = "High Alert!"
    insightText = "A large portion of your emails are marked as High Priority. You might be dealing with an urgent project or a backlog. Focus on clearing these out first before tackling the rest."
  } else if (stats.low > stats.high && stats.low > stats.medium) {
    insightTitle = "Noise Reduction Working"
    insightText = "Most of your emails are Low Priority. The AI Assistant is successfully catching the noise. Consider unsubscribing from some of those newsletters to reduce future clutter."
  } else if (stats.archived > stats.total / 2 && stats.total > 0) {
    insightTitle = "Inbox Zero Hero"
    insightText = "You have archived more than half of your fetched emails! Great job keeping your active workspace clean and organized."
  }

  // Category bar chart data
  const categoryData: Array<{ key: EmailCategory; label: string; count: number; color: string; Icon: typeof Tag }> = [
    { key: 'urgent', label: 'Urgent', count: stats.categoryCounts.urgent, color: '#ef4444', Icon: AlertTriangle },
    { key: 'promotional', label: 'Promo', count: stats.categoryCounts.promotional, color: '#ec4899', Icon: ShoppingBag },
    { key: 'social', label: 'Social', count: stats.categoryCounts.social, color: '#3b82f6', Icon: Users },
    { key: 'updates', label: 'Updates', count: stats.categoryCounts.updates, color: '#06b6d4', Icon: Bell },
    { key: 'personal', label: 'Personal', count: stats.categoryCounts.personal, color: '#8b5cf6', Icon: User },
    { key: 'general', label: 'General', count: stats.categoryCounts.general, color: '#64748b', Icon: Briefcase },
  ]
  const maxCategoryCount = Math.max(...categoryData.map(c => c.count), 1)

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 overflow-y-auto relative">
      {/* Top bar */}
      <div className="shrink-0 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <Logo />
          <Button variant="ghost" size="sm" onClick={() => nav('/app')}>
            <ArrowLeft className="size-4" />
            Back to Dashboard
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <PieChart className="size-8 text-indigo-400" />
              Inbox Statistics
            </h1>
            <p className="mt-2 text-slate-400">A breakdown of your email categories, sentiment, and productivity metrics.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowInfo(true)} className="shrink-0">
            <Info className="size-4" />
            Learn how AI works
          </Button>
        </div>

        {/* Row 1: Priority Pie + Insights + Counters */}
        <div className="grid gap-8 md:grid-cols-[1fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 flex flex-col items-center justify-center">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Priority Distribution</div>
            {totalAnalyzed === 0 ? (
              <div className="text-slate-400 text-sm">Not enough analyzed emails to show chart. Sync your inbox first.</div>
            ) : (
              <>
                <div
                  className="h-56 w-56 rounded-full shadow-2xl shadow-black/50 transition-transform hover:scale-105"
                  style={{ background: pieGradient }}
                />
                <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm font-medium">
                  <div className="flex items-center gap-2"><div className="size-3 rounded-full bg-[#6366f1]" /> High ({stats.high})</div>
                  <div className="flex items-center gap-2"><div className="size-3 rounded-full bg-[#f59e0b]" /> Medium ({stats.medium})</div>
                  <div className="flex items-center gap-2"><div className="size-3 rounded-full bg-[#10b981]" /> Low ({stats.low})</div>
                  <div className="flex items-center gap-2"><div className="size-3 rounded-full bg-[#64748b]" /> Archived ({stats.archived})</div>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-indigo-500/30 bg-indigo-500/10 p-6 shadow-lg shadow-indigo-900/20">
              <h2 className="text-lg font-semibold text-indigo-100 flex items-center gap-2">
                <TrendingUp className="size-5 text-indigo-400" />
                {insightTitle}
              </h2>
              <p className="mt-3 text-sm text-indigo-200/90 leading-relaxed">
                {insightText}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 flex-1">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 flex flex-col justify-center">
                <div className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  <Inbox className="size-4 text-slate-300" /> Total Fetched
                </div>
                <div className="mt-2 text-4xl font-bold">{stats.total}</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 flex flex-col justify-center">
                <div className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-400" /> Needs Action
                </div>
                <div className="mt-2 text-4xl font-bold text-indigo-400">{stats.high + stats.medium}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Sentiment Pie + Category Bars */}
        <div className="grid gap-8 md:grid-cols-[1fr_1fr] mt-8">
          {/* Sentiment */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 flex flex-col items-center justify-center">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Sentiment Analysis</div>
            {totalSentiment === 0 ? (
              <div className="text-slate-400 text-sm">Sync and analyze emails to see sentiment distribution.</div>
            ) : (
              <>
                <div
                  className="h-48 w-48 rounded-full shadow-2xl shadow-black/50 transition-transform hover:scale-105"
                  style={{ background: sentimentGradient }}
                />
                <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <SmilePlus className="size-4 text-emerald-400" /> Positive ({stats.sentimentCounts.positive})
                  </div>
                  <div className="flex items-center gap-2">
                    <Meh className="size-4 text-slate-400" /> Neutral ({stats.sentimentCounts.neutral})
                  </div>
                  <div className="flex items-center gap-2">
                    <Frown className="size-4 text-rose-400" /> Negative ({stats.sentimentCounts.negative})
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Category Breakdown */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Email Categories</div>
            <div className="space-y-4">
              {categoryData.map((cat) => (
                <div key={cat.key} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-24 shrink-0">
                    <cat.Icon className="size-4" style={{ color: cat.color }} />
                    <span className="text-xs font-medium text-slate-300">{cat.label}</span>
                  </div>
                  <div className="flex-1 h-6 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.max((cat.count / maxCategoryCount) * 100, cat.count > 0 ? 8 : 0)}%`,
                        backgroundColor: cat.color,
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <span className="text-sm font-bold text-slate-200 w-8 text-right">{cat.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Info Modal */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Zap className="size-5 text-indigo-400" />
                How the AI Analyzes Your Emails
              </h2>
              <button
                onClick={() => setShowInfo(false)}
                className="rounded-full bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-6 space-y-6 max-h-[60vh] overflow-y-auto pr-2">
              <p className="text-sm text-slate-300">
                The SmartInbox AI uses advanced language models to read the context of your emails. If the AI is temporarily unavailable, it falls back to a strict keyword-scanning heuristic to instantly classify your mail:
              </p>

              {/* Priority */}
              <div className="flex gap-4">
                <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400">
                  <Zap className="size-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-indigo-300">Priority Detection</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Emails are classified as High, Medium, or Low priority based on urgency signals, business keywords, and content context.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {['urgent', 'asap', 'deadline', 'invoice', 'meeting', 'schedule', 'review'].map(k => (
                      <span key={k} className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-200 border border-indigo-500/20">{k}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sentiment */}
              <div className="flex gap-4">
                <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <SmilePlus className="size-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-emerald-300">Sentiment Detection</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    The AI detects whether an email tone is Positive, Neutral, or Negative by analyzing emotional keywords and context.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {['thanks', 'appreciate', 'great job', 'disappointed', 'frustrated', 'sorry'].map(k => (
                      <span key={k} className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200 border border-emerald-500/20">{k}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Categorization */}
              <div className="flex gap-4">
                <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400">
                  <Tag className="size-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-cyan-300">Smart Categorization</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Emails are categorized into Urgent, Promotional, Social, Updates, Personal, or General based on sender, content, and structural signals.
                  </p>
                </div>
              </div>

              {/* Suggested Actions */}
              <div className="flex gap-4">
                <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
                  <Clock className="size-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-amber-300">Suggested Actions</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    The AI suggests actionable next steps like "Needs Reply", "Schedule Meeting", "Review Document", or "Follow Up" based on email intent.
                  </p>
                </div>
              </div>

              {/* Archive */}
              <div className="flex gap-4">
                <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-500/20 text-slate-400">
                  <Archive className="size-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-300">Archived</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Emails you have manually processed and moved out of your active feed by clicking the "Archive" button.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}