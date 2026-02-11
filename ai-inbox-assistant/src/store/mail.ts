import { create } from 'zustand'
import type { EmailAnalysis, EmailDetail, EmailFilter, EmailListItem, ReplyTone } from '../types/mail'

type MailState = {
  filter: EmailFilter
  emails: Array<EmailListItem>
  selectedId: string | null

  detailsById: Record<string, EmailDetail | undefined>
  analysisById: Record<string, EmailAnalysis | undefined>
  replyDraftById: Record<string, { tone: ReplyTone; draft: string } | undefined>

  syncing: boolean
  error: string | null

  setFilter: (filter: EmailFilter) => void
  setEmails: (emails: Array<EmailListItem>) => void
  select: (id: string | null) => void
  upsertDetail: (detail: EmailDetail) => void
  upsertAnalysis: (id: string, analysis: EmailAnalysis) => void
  setReplyDraft: (id: string, tone: ReplyTone, draft: string) => void
  setSyncing: (syncing: boolean) => void
  setError: (error: string | null) => void
}

export const useMailStore = create<MailState>((set) => ({
  filter: 'all',
  emails: [],
  selectedId: null,

  detailsById: {},
  analysisById: {},
  replyDraftById: {},

  syncing: false,
  error: null,

  setFilter: (filter) => set({ filter }),
  setEmails: (emails) => set({ emails }),
  select: (selectedId) => set({ selectedId }),
  upsertDetail: (detail) =>
    set((s) => ({ detailsById: { ...s.detailsById, [detail.id]: detail } })),
  upsertAnalysis: (id, analysis) =>
    set((s) => ({ analysisById: { ...s.analysisById, [id]: analysis } })),
  setReplyDraft: (id, tone, draft) =>
    set((s) => ({ replyDraftById: { ...s.replyDraftById, [id]: { tone, draft } } })),
  setSyncing: (syncing) => set({ syncing }),
  setError: (error) => set({ error }),
}))

