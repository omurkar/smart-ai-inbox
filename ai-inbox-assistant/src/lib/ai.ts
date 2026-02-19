import type { EmailAnalysis, EmailCategory, EmailSentiment, ReplyTone, SuggestedAction } from '../types/mail'

type AnalyzeInput = {
  id: string
  from: string
  subject: string
  snippet?: string
  bodyText?: string
}

/* ── Heuristic keyword banks ── */

const HIGH_SIGNALS = [
  'urgent', 'asap', 'today', 'eod', 'past due', 'overdue',
  'invoice', 'payment', 'action required', 'critical',
  'emergency', 'deadline', 'immediate', 'important',
  'escalation', 'failed', 'error', 'alert', 'attention',
  'blocked', 'issue',
]

const MED_SIGNALS = [
  'meeting', 'schedule', 'calendar', 'update', 'review',
  'follow up', 'proposal', 'feedback', 'question', 'reminder',
  'discuss', 'opportunity', 'invitation', 'status', 'request',
  'sync', 'check-in',
]

const POSITIVE_SIGNALS = [
  'thank', 'thanks', 'congratulations', 'congrats', 'great job',
  'well done', 'appreciate', 'excellent', 'happy', 'pleased',
  'welcome', 'excited', 'love', 'wonderful', 'awesome', 'good news',
  'glad', 'bravo', 'cheers', 'looking forward',
]

const NEGATIVE_SIGNALS = [
  'complaint', 'disappointed', 'frustrated', 'unacceptable',
  'problem', 'issue', 'failed', 'error', 'wrong', 'broken',
  'unhappy', 'concern', 'worried', 'unfortunately', 'regret',
  'sorry', 'bug', 'crash', 'outage', 'denied', 'rejected',
  'cancelled', 'bad news',
]

const PROMO_SIGNALS = [
  'unsubscribe', 'sale', 'discount', 'offer', 'promo', 'deal',
  'limited time', 'free trial', 'buy now', 'shop', 'coupon',
  'advertisement', 'newsletter', 'marketing', 'exclusive offer',
  'don\'t miss', 'act now', '% off', 'save',
]

const SOCIAL_SIGNALS = [
  'shared a post', 'mentioned you', 'tagged', 'friend request',
  'liked your', 'commented on', 'invitation to connect',
  'new follower', 'social', 'community', 'group update',
  'event invitation', 'birthday',
]

const UPDATE_SIGNALS = [
  'notification', 'alert', 'confirmation', 'receipt', 'order',
  'shipping', 'delivery', 'tracking', 'subscription', 'account update',
  'password reset', 'security', 'verify', 'verification',
  'automated', 'no-reply', 'noreply',
]

/* ── Heuristic helpers ── */

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k))
}

function heuristicSentiment(text: string): EmailSentiment {
  const posScore = POSITIVE_SIGNALS.filter((s) => text.includes(s)).length
  const negScore = NEGATIVE_SIGNALS.filter((s) => text.includes(s)).length
  if (negScore > posScore) return 'negative'
  if (posScore > negScore) return 'positive'
  return 'neutral'
}

function heuristicCategory(text: string, from: string): EmailCategory {
  if (matchesAny(text, HIGH_SIGNALS)) return 'urgent'
  if (matchesAny(text, PROMO_SIGNALS) || matchesAny(from, ['noreply', 'marketing', 'promo', 'newsletter', 'news@'])) return 'promotional'
  if (matchesAny(text, SOCIAL_SIGNALS) || matchesAny(from, ['facebook', 'linkedin', 'twitter', 'instagram'])) return 'social'
  if (matchesAny(text, UPDATE_SIGNALS) || matchesAny(from, ['no-reply', 'noreply', 'notifications', 'alert'])) return 'updates'
  if (matchesAny(from, ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'])) return 'personal'
  return 'general'
}

function heuristicActions(text: string, priority: EmailAnalysis['priority']): SuggestedAction[] {
  const actions: SuggestedAction[] = []

  // Check if the email asks a question or expects a reply
  if (text.includes('?') || matchesAny(text, ['please reply', 'let me know', 'get back', 'respond', 'your thoughts', 'rsvp', 'confirm'])) {
    actions.push('needs_reply')
  }

  // Check for meeting/scheduling intent
  if (matchesAny(text, ['meeting', 'schedule', 'calendar', 'call', 'zoom', 'teams', 'google meet', 'invite'])) {
    actions.push('schedule_meeting')
  }

  // Check for documents/things to review
  if (matchesAny(text, ['attached', 'attachment', 'document', 'review', 'please see', 'take a look', 'pdf', 'spreadsheet', 'report'])) {
    actions.push('review_document')
  }

  // Check for follow-up
  if (matchesAny(text, ['follow up', 'following up', 'checking in', 'touching base', 'just a reminder', 'circle back'])) {
    actions.push('follow_up')
  }

  // Low-priority or promotional → suggest archive/unsubscribe
  if (priority === 'low' && matchesAny(text, PROMO_SIGNALS)) {
    actions.push('unsubscribe')
  }
  if (priority === 'low') {
    actions.push('archive')
  }

  return actions.length > 0 ? actions : ['archive']
}

/* ── Main heuristic analysis ── */

function heuristicAnalyze(input: AnalyzeInput): EmailAnalysis {
  const text = `${input.subject}\n${input.snippet ?? ''}\n${input.bodyText ?? ''}`.toLowerCase()
  const fromLower = input.from.toLowerCase()

  const priority: EmailAnalysis['priority'] = matchesAny(text, HIGH_SIGNALS)
    ? 'high'
    : matchesAny(text, MED_SIGNALS)
      ? 'medium'
      : 'low'

  const summarySource = input.snippet ?? input.bodyText ?? input.subject
  const summary = summarySource.length > 160 ? `${summarySource.slice(0, 157)}…` : summarySource

  const sentiment = heuristicSentiment(text)
  const category = heuristicCategory(text, fromLower)
  const suggestedActions = heuristicActions(text, priority)

  // Shadow Calendar Logic
  let suggestedEvent: EmailAnalysis['suggestedEvent'] = undefined

  if (matchesAny(text, MED_SIGNALS) || text.includes('tomorrow') || text.includes('monday')) {
    const eventDate = new Date()
    if (text.includes('tomorrow')) {
      eventDate.setDate(eventDate.getDate() + 1)
    } else if (text.includes('monday')) {
      eventDate.setDate(eventDate.getDate() + ((1 + 7 - eventDate.getDay()) % 7 || 7))
    }

    suggestedEvent = {
      title: input.subject.replace(/re:|fwd:/gi, '').trim() || 'Scheduled Meeting',
      date: eventDate.toISOString().split('T')[0],
      description: 'AI detected a scheduling request.',
      emailId: input.id,
    }
  }

  return {
    priority,
    summary: summary || input.subject,
    sentiment,
    category,
    suggestedActions,
    suggestedEvent,
  }
}

/* ── Server-backed analysis with heuristic fallback ── */

export async function analyzeEmail(input: AnalyzeInput): Promise<EmailAnalysis> {
  try {
    const res = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`AI analyze failed (${res.status})`)
    const json = (await res.json()) as EmailAnalysis

    // Ensure all new fields have fallback values
    return {
      priority: json.priority || 'low',
      summary: json.summary || input.snippet || input.subject,
      sentiment: json.sentiment || 'neutral',
      category: json.category || 'general',
      suggestedActions: json.suggestedActions?.length ? json.suggestedActions : ['archive'],
      suggestedEvent: json.suggestedEvent,
    }
  } catch {
    return heuristicAnalyze(input)
  }
}

/* ── Reply generation ── */

export async function generateReply(input: { tone: ReplyTone; email: AnalyzeInput }): Promise<string> {
  const REQUIRED_SIGNATURE = "all the best"

  try {
    const res = await fetch('/api/ai/reply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`AI reply failed (${res.status})`)
    const json = (await res.json()) as { reply?: string }

    let reply = json.reply || ""
    if (reply && !reply.toLowerCase().includes(REQUIRED_SIGNATURE)) {
      reply = reply.trim() + `\n\n${REQUIRED_SIGNATURE}`
    }
    return reply
  } catch {
    const opener = input.tone === 'friendly' ? 'Hey' : 'Hi'
    const close = input.tone === 'short' ? 'Thanks.' : input.tone === 'friendly' ? 'Thanks so much!' : 'Thank you.'

    return `${opener} —\n\nThanks for the note. I've reviewed this and will follow up with the next steps shortly.\n\n${close}\n\n${REQUIRED_SIGNATURE}\n`
  }
}