export type EmailPriority = 'high' | 'medium' | 'low'
export type EmailSentiment = 'positive' | 'neutral' | 'negative'
export type EmailCategory = 'urgent' | 'promotional' | 'social' | 'updates' | 'personal' | 'general'
export type SuggestedAction = 'needs_reply' | 'schedule_meeting' | 'review_document' | 'follow_up' | 'archive' | 'unsubscribe'

// Added 'archived' to the allowed filters
export type EmailFilter = 'all' | EmailPriority | 'archived'
export type ReplyTone = 'professional' | 'friendly' | 'short'

// Date range filter
export type DateRangeFilter = 'all' | 'today' | 'week' | 'month' | '3months'

// Sort order
export type SortOrder = 'newest' | 'oldest'

export interface EmailListItem {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
  hasAttachments?: boolean
  labelIds?: string[]
}

export interface AttachmentMeta {
  attachmentId: string
  filename: string
  mimeType: string
  size: number
  scanStatus?: 'pending' | 'safe' | 'unsafe' | 'warning' | 'error'
  scanMessage?: string
  scanDetails?: string
}

export interface EmailDetail extends EmailListItem {
  bodyText: string
  htmlBody?: string
  attachments?: AttachmentMeta[]
}

export interface EmailAnalysis {
  priority: EmailPriority
  summary: string
  sentiment: EmailSentiment
  category: EmailCategory
  suggestedActions: SuggestedAction[]
  // Shadow Calendar integration
  suggestedEvent?: {
    title: string
    date: string // ISO string or human-readable format
    startTime?: string
    description: string
    emailId?: string
  }
}