import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import OpenAI from 'openai'

type Priority = 'high' | 'medium' | 'low'
type Sentiment = 'positive' | 'neutral' | 'negative'
type Category = 'urgent' | 'promotional' | 'social' | 'updates' | 'personal' | 'general'
type SuggestedAction = 'needs_reply' | 'schedule_meeting' | 'review_document' | 'follow_up' | 'archive' | 'unsubscribe'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const port = Number(process.env.PORT ?? 8787)

/* ── Keyword banks ── */

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
]

const NEGATIVE_SIGNALS = [
  'complaint', 'disappointed', 'frustrated', 'unacceptable',
  'problem', 'issue', 'failed', 'error', 'wrong', 'broken',
  'unhappy', 'concern', 'worried', 'unfortunately', 'regret',
  'sorry', 'bug', 'crash', 'outage', 'denied', 'rejected',
]

const PROMO_SIGNALS = [
  'unsubscribe', 'sale', 'discount', 'offer', 'promo', 'deal',
  'limited time', 'free trial', 'buy now', 'shop', 'coupon',
  'newsletter', 'marketing', 'exclusive offer', '% off',
]

const SOCIAL_SIGNALS = [
  'shared a post', 'mentioned you', 'tagged', 'friend request',
  'liked your', 'commented on', 'new follower', 'community',
]

const UPDATE_SIGNALS = [
  'notification', 'confirmation', 'receipt', 'order',
  'shipping', 'delivery', 'tracking', 'subscription',
  'password reset', 'security', 'verify', 'verification',
]

/* ── Heuristic functions ── */

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k))
}

function heuristicPriority(text: string): Priority {
  const t = text.toLowerCase()
  if (matchesAny(t, HIGH_SIGNALS)) return 'high'
  if (matchesAny(t, MED_SIGNALS)) return 'medium'
  return 'low'
}

function heuristicSentiment(text: string): Sentiment {
  const t = text.toLowerCase()
  const posScore = POSITIVE_SIGNALS.filter((s) => t.includes(s)).length
  const negScore = NEGATIVE_SIGNALS.filter((s) => t.includes(s)).length
  if (negScore > posScore) return 'negative'
  if (posScore > negScore) return 'positive'
  return 'neutral'
}

function heuristicCategory(text: string, from: string): Category {
  const t = text.toLowerCase()
  const f = from.toLowerCase()
  if (matchesAny(t, HIGH_SIGNALS)) return 'urgent'
  if (matchesAny(t, PROMO_SIGNALS) || matchesAny(f, ['noreply', 'marketing', 'promo', 'newsletter'])) return 'promotional'
  if (matchesAny(t, SOCIAL_SIGNALS) || matchesAny(f, ['facebook', 'linkedin', 'twitter', 'instagram'])) return 'social'
  if (matchesAny(t, UPDATE_SIGNALS) || matchesAny(f, ['no-reply', 'noreply', 'notifications'])) return 'updates'
  if (matchesAny(f, ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'])) return 'personal'
  return 'general'
}

function heuristicActions(text: string, priority: Priority): SuggestedAction[] {
  const t = text.toLowerCase()
  const actions: SuggestedAction[] = []
  if (t.includes('?') || matchesAny(t, ['please reply', 'let me know', 'get back', 'respond', 'rsvp', 'confirm'])) actions.push('needs_reply')
  if (matchesAny(t, ['meeting', 'schedule', 'calendar', 'call', 'zoom', 'teams', 'invite'])) actions.push('schedule_meeting')
  if (matchesAny(t, ['attached', 'attachment', 'document', 'review', 'please see', 'report'])) actions.push('review_document')
  if (matchesAny(t, ['follow up', 'following up', 'checking in', 'touching base', 'reminder'])) actions.push('follow_up')
  if (priority === 'low' && matchesAny(t, PROMO_SIGNALS)) actions.push('unsubscribe')
  if (priority === 'low') actions.push('archive')
  return actions.length > 0 ? actions : ['archive']
}

/* ── Utilities ── */

function safeString(v: unknown, max = 20_000) {
  if (typeof v !== 'string') return ''
  return v.length > max ? v.slice(0, max) : v
}

function parseJsonObject(text: string): any | null {
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

/* ── Routes ── */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/ai/analyze', async (req, res) => {
  const from = safeString(req.body?.from, 400)
  const subject = safeString(req.body?.subject, 500)
  const snippet = safeString(req.body?.snippet, 5000)
  const bodyText = safeString(req.body?.bodyText, 20_000)

  if (!subject && !snippet && !bodyText) {
    res.status(400).json({ error: 'Missing email content.' })
    return
  }

  const combined = `From: ${from}\nSubject: ${subject}\n\n${snippet}\n\n${bodyText}`
  const client = getClient()

  // Heuristic fallback
  if (!client) {
    const priority = heuristicPriority(combined)
    res.json({
      priority,
      summary: (snippet || bodyText || subject || '').slice(0, 220) || '(no content)',
      sentiment: heuristicSentiment(combined),
      category: heuristicCategory(combined, from),
      suggestedActions: heuristicActions(combined, priority),
    })
    return
  }

  try {
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an email triage engine. Return ONLY valid JSON with these keys:
- priority: "high" | "medium" | "low"
- summary: 1-2 sentence summary
- sentiment: "positive" | "neutral" | "negative"
- category: "urgent" | "promotional" | "social" | "updates" | "personal" | "general"
- suggestedActions: array of actions from ["needs_reply", "schedule_meeting", "review_document", "follow_up", "archive", "unsubscribe"]
No extra keys.`,
        },
        {
          role: 'user',
          content: `Analyze this email and classify strictly.\n\n${combined}`,
        },
      ],
    })

    const content = completion.choices[0]?.message?.content ?? ''
    const obj = parseJsonObject(content)

    const priority = obj?.priority as Priority | undefined
    const validPriority = priority === 'high' || priority === 'medium' || priority === 'low' ? priority : heuristicPriority(combined)

    const sentiment = obj?.sentiment as Sentiment | undefined
    const validSentiment = sentiment === 'positive' || sentiment === 'neutral' || sentiment === 'negative' ? sentiment : heuristicSentiment(combined)

    const category = obj?.category as Category | undefined
    const validCategories: Category[] = ['urgent', 'promotional', 'social', 'updates', 'personal', 'general']
    const validCategory = category && validCategories.includes(category) ? category : heuristicCategory(combined, from)

    const validActionSet = new Set(['needs_reply', 'schedule_meeting', 'review_document', 'follow_up', 'archive', 'unsubscribe'])
    const suggestedActions = Array.isArray(obj?.suggestedActions)
      ? (obj.suggestedActions as string[]).filter((a) => validActionSet.has(a)) as SuggestedAction[]
      : heuristicActions(combined, validPriority)

    res.json({
      priority: validPriority,
      summary: (typeof obj?.summary === 'string' ? obj.summary : '') || (snippet || bodyText || subject || '').slice(0, 220) || '(no content)',
      sentiment: validSentiment,
      category: validCategory,
      suggestedActions: suggestedActions.length > 0 ? suggestedActions : ['archive'],
    })
  } catch (e) {
    const priority = heuristicPriority(combined)
    res.json({
      priority,
      summary: (snippet || bodyText || subject || '').slice(0, 220) || '(no content)',
      sentiment: heuristicSentiment(combined),
      category: heuristicCategory(combined, from),
      suggestedActions: heuristicActions(combined, priority),
    })
  }
})

app.post('/api/ai/reply', async (req, res) => {
  const tone = safeString(req.body?.tone, 30)
  const email = req.body?.email ?? {}
  const from = safeString(email?.from, 400)
  const subject = safeString(email?.subject, 500)
  const snippet = safeString(email?.snippet, 5000)
  const bodyText = safeString(email?.bodyText, 20_000)

  const combined = `From: ${from}\nSubject: ${subject}\n\n${snippet}\n\n${bodyText}`

  const client = getClient()
  if (!client) {
    const opener = tone === 'friendly' ? 'Hey' : 'Hi'
    const close = tone === 'short' ? 'Thanks.' : tone === 'friendly' ? 'Thanks so much!' : 'Thank you.'
    res.json({
      reply: `${opener} —\n\nThanks for reaching out. I've reviewed this and will get back to you shortly with next steps.\n\n${close}\n`,
    })
    return
  }

  const toneInstruction =
    tone === 'friendly'
      ? 'friendly, warm, casual'
      : tone === 'short'
        ? 'very concise, direct, minimal'
        : 'professional, clear, formal'

  try {
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You draft email replies. Return ONLY valid JSON with key "reply" (a complete email reply body). No extra keys. Do not claim you performed actions you did not do.',
        },
        {
          role: 'user',
          content: `Write a reply in a ${toneInstruction} tone. Keep it human and helpful.\n\nEMAIL:\n${combined}`,
        },
      ],
    })
    const content = completion.choices[0]?.message?.content ?? ''
    const obj = parseJsonObject(content)
    const reply = typeof obj?.reply === 'string' ? obj.reply : ''
    res.json({ reply: reply || 'Hi —\n\nThanks for the note. I\'ll follow up shortly.\n\nThank you.\n' })
  } catch {
    res.json({ reply: 'Hi —\n\nThanks for the note. I\'ll follow up shortly.\n\nThank you.\n' })
  }
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`)
})