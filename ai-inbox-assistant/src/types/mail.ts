export type EmailPriority = 'high' | 'medium' | 'low'
export type EmailFilter = EmailPriority | 'all'
export type ReplyTone = 'professional' | 'friendly' | 'short'

export type EmailListItem = {
  id: string
  threadId?: string
  from: string
  subject: string
  date: string
  snippet?: string
}

export type EmailDetail = EmailListItem & {
  bodyText: string
}

export type EmailAnalysis = {
  priority: EmailPriority
  summary: string
}

