export type EmailPriority = 'high' | 'medium' | 'low'
// Added 'archived' to the allowed filters
export type EmailFilter = 'all' | EmailPriority | 'archived'
export type ReplyTone = 'professional' | 'friendly' | 'short'

export interface EmailListItem {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
}

export interface EmailDetail extends EmailListItem {
  bodyText: string
  htmlBody?: string
}

export interface EmailAnalysis {
  priority: EmailPriority
  summary: string
  // NEW: Added suggested event field for Shadow Calendar integration
  suggestedEvent?: {
    title: string
    date: string // ISO string or human-readable format
    startTime?: string
    description: string
  }
}