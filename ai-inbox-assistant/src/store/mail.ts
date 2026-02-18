import { create } from 'zustand'
import type { EmailAnalysis, EmailDetail, EmailFilter, EmailListItem, ReplyTone } from '../types/mail'

// NEW: Definition for the internal Shadow Calendar events
export interface ShadowEvent {
  id: string
  emailId: string
  title: string
  date: string
  description: string
}

type MailState = {
  filter: EmailFilter
  emails: Array<EmailListItem>
  selectedId: string | null

  detailsById: Record<string, EmailDetail | undefined>
  analysisById: Record<string, EmailAnalysis | undefined>
  replyDraftById: Record<string, { tone: ReplyTone; draft: string } | undefined>
  
  archivedIds: string[]
  
  // NEW: State to store locally saved calendar events
  shadowEvents: ShadowEvent[]

  syncing: boolean
  error: string | null

  setFilter: (filter: EmailFilter) => void
  setEmails: (emails: Array<EmailListItem>) => void
  appendEmails: (emails: Array<EmailListItem>) => void
  select: (id: string | null) => void
  upsertDetail: (detail: EmailDetail) => void
  upsertAnalysis: (id: string, analysis: EmailAnalysis) => void
  setReplyDraft: (id: string, tone: ReplyTone, draft: string) => void
  setSyncing: (syncing: boolean) => void
  setError: (error: string | null) => void
  archiveLocalEmail: (id: string) => void
  
  // NEW: Action to save a suggested event to the local calendar
  addShadowEvent: (event: ShadowEvent) => void
}

export const useMailStore = create<MailState>((set) => ({
  filter: 'all',
  emails: [],
  selectedId: null,

  detailsById: {},
  analysisById: {},
  replyDraftById: {},
  archivedIds: [],
  
  // NEW: Initial state for local events
  shadowEvents: [],

  syncing: false,
  error: null,

  setFilter: (filter) => set({ filter }),
  setEmails: (emails) => set({ emails }),
  
  appendEmails: (newEmails) => set((s) => {
    const existingIds = new Set(s.emails.map(e => e.id))
    const uniqueNew = newEmails.filter(e => !existingIds.has(e.id))
    return { emails: [...s.emails, ...uniqueNew] }
  }),

  select: (selectedId) => set({ selectedId }),
  upsertDetail: (detail) =>
    set((s) => ({ detailsById: { ...s.detailsById, [detail.id]: detail } })),
  upsertAnalysis: (id, analysis) =>
    set((s) => ({ analysisById: { ...s.analysisById, [id]: analysis } })),
  setReplyDraft: (id, tone, draft) =>
    set((s) => ({ replyDraftById: { ...s.replyDraftById, [id]: { tone, draft } } })),
  setSyncing: (syncing) => set({ syncing }),
  setError: (error) => set({ error }),
  archiveLocalEmail: (id) =>
    set((s) => ({
      archivedIds: [...s.archivedIds, id],
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),
    
  // NEW: Implementation to append a new event to the internal list
  addShadowEvent: (event) => set((s) => ({ 
    shadowEvents: [...s.shadowEvents, event] 
  })),
}))