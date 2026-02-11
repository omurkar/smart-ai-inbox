import type { User } from 'firebase/auth'
import { create } from 'zustand'

const GMAIL_TOKEN_KEY = 'gmail_access_token'

type SessionState = {
  user: User | null
  authLoading: boolean
  gmailAccessToken: string | null

  setUser: (user: User | null) => void
  setAuthLoading: (loading: boolean) => void
  setGmailAccessToken: (token: string | null) => void
  clearGmailAccessToken: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  authLoading: true,
  gmailAccessToken: sessionStorage.getItem(GMAIL_TOKEN_KEY),

  setUser: (user) => set({ user }),
  setAuthLoading: (authLoading) => set({ authLoading }),
  setGmailAccessToken: (token) => {
    if (token) sessionStorage.setItem(GMAIL_TOKEN_KEY, token)
    else sessionStorage.removeItem(GMAIL_TOKEN_KEY)
    set({ gmailAccessToken: token })
  },
  clearGmailAccessToken: () => {
    sessionStorage.removeItem(GMAIL_TOKEN_KEY)
    set({ gmailAccessToken: null })
  },
}))

