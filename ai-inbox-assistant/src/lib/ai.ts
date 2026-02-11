import type { EmailAnalysis, ReplyTone } from '../types/mail'

type AnalyzeInput = {
  from: string
  subject: string
  snippet?: string
  bodyText?: string
}

function heuristicAnalyze(input: AnalyzeInput): EmailAnalysis {
  const text = `${input.subject}\n${input.snippet ?? ''}\n${input.bodyText ?? ''}`.toLowerCase()
  const highSignals = ['urgent', 'asap', 'today', 'eod', 'past due', 'overdue', 'invoice', 'payment', 'action required']
  const medSignals = ['meeting', 'schedule', 'calendar', 'update', 'review', 'follow up', 'proposal']

  const priority: EmailAnalysis['priority'] = highSignals.some((s) => text.includes(s))
    ? 'high'
    : medSignals.some((s) => text.includes(s))
      ? 'medium'
      : 'low'

  const summarySource = input.snippet ?? input.bodyText ?? input.subject
  const summary = summarySource.length > 160 ? `${summarySource.slice(0, 157)}…` : summarySource
  return { priority, summary: summary || input.subject }
}

export async function analyzeEmail(input: AnalyzeInput): Promise<EmailAnalysis> {
  try {
    const res = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`AI analyze failed (${res.status})`)
    const json = (await res.json()) as EmailAnalysis
    if (!json?.priority || !json?.summary) throw new Error('Invalid AI response')
    return json
  } catch {
    return heuristicAnalyze(input)
  }
}

export async function generateReply(input: { tone: ReplyTone; email: AnalyzeInput }): Promise<string> {
  try {
    const res = await fetch('/api/ai/reply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`AI reply failed (${res.status})`)
    const json = (await res.json()) as { reply?: string }
    if (!json.reply) throw new Error('Invalid AI response')
    return json.reply
  } catch {
    const opener = input.tone === 'friendly' ? 'Hey' : 'Hi'
    const close = input.tone === 'short' ? 'Thanks.' : input.tone === 'friendly' ? 'Thanks so much!' : 'Thank you.'
    return `${opener} —\n\nThanks for the note. I’ve reviewed this and will follow up with the next steps shortly.\n\n${close}\n`
  }
}

