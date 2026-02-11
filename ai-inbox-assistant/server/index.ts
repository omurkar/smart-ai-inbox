import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import OpenAI from 'openai'

type Priority = 'high' | 'medium' | 'low'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const port = Number(process.env.PORT ?? 8787)

function heuristicPriority(text: string): Priority {
  const t = text.toLowerCase()
  
  // Expanded with modern high-priority and critical business keywords
  const highSignals = [
    'urgent', 'asap', 'today', 'eod', 'past due', 'overdue', 
    'invoice', 'payment', 'action required', 'critical', 
    'emergency', 'deadline', 'immediate', 'important', 
    'escalation', 'failed', 'error', 'alert', 'attention',
    'blocked', 'issue'
  ]
  
  // Expanded with standard collaboration and workflow keywords
  const medSignals = [
    'meeting', 'schedule', 'calendar', 'update', 'review', 
    'follow up', 'proposal', 'feedback', 'question', 'reminder', 
    'discuss', 'opportunity', 'invitation', 'status', 'request',
    'sync', 'check-in'
  ]
  
  if (highSignals.some((s) => t.includes(s))) return 'high'
  if (medSignals.some((s) => t.includes(s))) return 'medium'
  
  // If no high or medium keywords are found, it defaults to low
  return 'low'
}

function safeString(v: unknown, max = 20_000) {
  if (typeof v !== 'string') return ''
  return v.length > max ? v.slice(0, max) : v
}

function parseJsonObject(text: string): any | null {
  try {
    return JSON.parse(text)
  } catch {
    // Try to extract the first {...} block (common when models wrap output)
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

  if (!client) {
    res.json({
      priority: heuristicPriority(combined),
      summary: (snippet || bodyText || subject || '').slice(0, 220) || '(no content)',
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
          content:
            'You are an email triage engine. Return ONLY valid JSON with keys: priority ("high"|"medium"|"low") and summary (1-2 sentences). No extra keys.',
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
    const summary = typeof obj?.summary === 'string' ? obj.summary : ''

    res.json({
      priority: priority === 'high' || priority === 'medium' || priority === 'low' ? priority : heuristicPriority(combined),
      summary: summary || (snippet || bodyText || subject || '').slice(0, 220) || '(no content)',
    })
  } catch (e) {
    res.json({
      priority: heuristicPriority(combined),
      summary: (snippet || bodyText || subject || '').slice(0, 220) || '(no content)',
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
      reply: `${opener} —\n\nThanks for reaching out. I’ve reviewed this and will get back to you shortly with next steps.\n\n${close}\n`,
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
    res.json({ reply: reply || 'Hi —\n\nThanks for the note. I’ll follow up shortly.\n\nThank you.\n' })
  } catch {
    res.json({ reply: 'Hi —\n\nThanks for the note. I’ll follow up shortly.\n\nThank you.\n' })
  }
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`)
})