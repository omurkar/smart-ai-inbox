import type { EmailAnalysis, ReplyTone } from '../types/mail'

type AnalyzeInput = {
  id: string // Added id to the input for linking
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

  // NEW: Enhanced Shadow Calendar Logic with Email ID linking
  let suggestedEvent: EmailAnalysis['suggestedEvent'] = undefined
  
  if (medSignals.some((s) => text.includes(s)) || text.includes('tomorrow') || text.includes('monday')) {
    
    // Fix: Generate a valid ISO date string
    let eventDate = new Date();
    if (text.includes('tomorrow')) {
      eventDate.setDate(eventDate.getDate() + 1);
    } else if (text.includes('monday')) {
      // Calculate next Monday
      eventDate.setDate(eventDate.getDate() + ((1 + 7 - eventDate.getDay()) % 7 || 7));
    }

    suggestedEvent = {
      title: input.subject.replace(/re:|fwd:/gi, '').trim() || 'Scheduled Meeting',
      date: eventDate.toISOString().split('T')[0], // Use a valid YYYY-MM-DD string
      description: 'AI detected a scheduling request.',
      emailId: input.id // LINK: Attach the email ID to the event
    }
  }

  return { 
    priority, 
    summary: summary || input.subject,
    suggestedEvent 
  }
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
    return json.reply
  } catch {
    const opener = input.tone === 'friendly' ? 'Hey' : 'Hi'
    const close = input.tone === 'short' ? 'Thanks.' : input.tone === 'friendly' ? 'Thanks so much!' : 'Thank you.'
    return `${opener} —\n\nThanks for the note. I’ve reviewed this and will follow up with the next steps shortly.\n\n${close}\n`
  }
}