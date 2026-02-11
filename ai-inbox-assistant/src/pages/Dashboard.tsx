import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/Button'
import { Logo } from '../components/Logo'
import { PriorityBadge } from '../components/Badge'
import { useMailStore } from '../store/mail'
import { useSessionStore } from '../store/session'
import { connectGmail, signOutUser } from '../lib/auth'
import { SAMPLE_EMAILS, SAMPLE_LIST } from '../lib/sampleEmails'
import { analyzeEmail, generateReply } from '../lib/ai'
import { getEmailDetail, listInbox, sendReply } from '../lib/gmail'
import type { EmailFilter, ReplyTone } from '../types/mail'
import { cn } from '../lib/utils'
import { Inbox, LogOut, RefreshCw, Send, Sparkles } from 'lucide-react'

function extractEmailAddress(from: string) {
  const m = from.match(/<([^>]+)>/)
  if (m?.[1]) return m[1]
  if (from.includes('@')) return from.trim()
  return ''
}

export function Dashboard() {
  const { user, gmailAccessToken, setGmailAccessToken, clearGmailAccessToken } = useSessionStore()
  const {
    filter,
    emails,
    selectedId,
    detailsById,
    analysisById,
    replyDraftById,
    syncing,
    error,
    setFilter,
    setEmails,
    select,
    upsertDetail,
    upsertAnalysis,
    setReplyDraft,
    setSyncing,
    setError,
  } = useMailStore()

  const [tone, setTone] = useState<ReplyTone>('professional')
  const [sending, setSending] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (emails.length === 0) {
      setEmails(SAMPLE_LIST)
      for (const d of SAMPLE_EMAILS) upsertDetail(d)
    }
  }, [emails.length, setEmails, upsertDetail])

  const filteredEmails = useMemo(() => {
    if (filter === 'all') return emails
    return emails.filter((e) => analysisById[e.id]?.priority === filter)
  }, [analysisById, emails, filter])

  const selectedDetail = selectedId ? detailsById[selectedId] : undefined
  const selectedAnalysis = selectedId ? analysisById[selectedId] : undefined
  const selectedDraft = selectedId ? replyDraftById[selectedId] : undefined

  const counts = useMemo(() => {
    let high = 0
    let medium = 0
    let low = 0
    for (const e of emails) {
      const p = analysisById[e.id]?.priority
      if (p === 'high') high++
      else if (p === 'medium') medium++
      else if (p === 'low') low++
    }
    return { high, medium, low, total: emails.length }
  }, [analysisById, emails])

  async function onConnectGmail() {
    if (!user) return
    setError(null)
    setSyncing(true)
    try {
      const token = await connectGmail(user)
      setGmailAccessToken(token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect Gmail.')
    } finally {
      setSyncing(false)
    }
  }

  async function onSyncInbox() {
    setError(null)
    setSyncing(true)
    try {
      if (!gmailAccessToken) {
        setEmails(SAMPLE_LIST)
        return
      }
      const list = await listInbox(gmailAccessToken, 20)
      setEmails(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  async function ensureDetail(id: string) {
    if (detailsById[id]) return detailsById[id]
    if (!gmailAccessToken) return undefined
    const detail = await getEmailDetail(gmailAccessToken, id)
    upsertDetail(detail)
    return detail
  }

  async function onAnalyzeAll() {
    setError(null)
    setSyncing(true)
    try {
      for (const e of emails) {
        if (analysisById[e.id]) continue
        const detail = detailsById[e.id] ?? (await ensureDetail(e.id))
        const analysis = await analyzeEmail({
          from: e.from,
          subject: e.subject,
          snippet: e.snippet,
          bodyText: detail?.bodyText,
        })
        upsertAnalysis(e.id, analysis)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analyze failed.')
    } finally {
      setSyncing(false)
    }
  }

  async function onSelect(id: string) {
    select(id)
    setError(null)
    try {
      const detail = await ensureDetail(id)
      const base = emails.find((x) => x.id === id)
      if (!analysisById[id] && base) {
        const analysis = await analyzeEmail({
          from: base.from,
          subject: base.subject,
          snippet: base.snippet,
          bodyText: detail?.bodyText,
        })
        upsertAnalysis(id, analysis)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load email.')
    }
  }

  async function onGenerateReply() {
    if (!selectedId) return
    const base = emails.find((x) => x.id === selectedId)
    if (!base) return
    const detail = detailsById[selectedId]

    setGenerating(true)
    setError(null)
    try {
      const reply = await generateReply({
        tone,
        email: {
          from: base.from,
          subject: base.subject,
          snippet: base.snippet,
          bodyText: detail?.bodyText,
        },
      })
      setReplyDraft(selectedId, tone, reply)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate reply.')
    } finally {
      setGenerating(false)
    }
  }

  async function onSend() {
    if (!selectedId) return
    const base = emails.find((x) => x.id === selectedId)
    if (!base) return
    const draft = replyDraftById[selectedId]?.draft?.trim()
    if (!draft) {
      setError('Generate (or type) a reply first.')
      return
    }

    setSending(true)
    setError(null)
    try {
      if (!gmailAccessToken) throw new Error('Connect Gmail to send real replies.')
      const to = extractEmailAddress(base.from)
      if (!to) throw new Error('Could not detect recipient email address.')
      await sendReply(gmailAccessToken, to, base.subject, draft)
      setReplyDraft(selectedId, tone, '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed.')
    } finally {
      setSending(false)
    }
  }

  async function onLogout() {
    await signOutUser()
    clearGmailAccessToken()
  }

  const filterButtons: Array<{ key: EmailFilter; label: string; meta: string }> = [
    { key: 'all', label: 'All', meta: `${counts.total}` },
    { key: 'high', label: 'High', meta: `${counts.high}` },
    { key: 'medium', label: 'Medium', meta: `${counts.medium}` },
    { key: 'low', label: 'Low', meta: `${counts.low}` },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-2">
            <div className="hidden text-xs text-slate-400 sm:block">{user?.email}</div>
            <Button variant="secondary" size="sm" onClick={onSyncInbox} disabled={syncing}>
              <RefreshCw className={cn('size-4', syncing && 'animate-spin')} />
              Sync
            </Button>
            <Button variant="secondary" size="sm" onClick={onAnalyzeAll} disabled={syncing || emails.length === 0}>
              <Sparkles className="size-4" />
              Analyze
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mx-auto w-full max-w-[1400px] px-6 pt-4">
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            {error}
          </div>
        </div>
      ) : null}

      <div className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-[280px_420px_1fr]">
        {/* Column 1: Sidebar */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Filters</div>
            <Inbox className="size-4 text-slate-400" />
          </div>

          <div className="mt-3 grid gap-2">
            {filterButtons.map((b) => (
              <button
                key={b.key}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition',
                  b.key === filter
                    ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-100'
                    : 'border-white/10 bg-white/0 text-slate-200 hover:bg-white/5',
                )}
                onClick={() => setFilter(b.key)}
              >
                <span>{b.label}</span>
                <span className="text-xs text-slate-400">{b.meta}</span>
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-slate-200">Gmail</div>
            <div className="mt-1 text-xs text-slate-400">
              {gmailAccessToken ? 'Connected (token in session)' : 'Not connected (using sample inbox)'}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant={gmailAccessToken ? 'secondary' : 'primary'}
                size="sm"
                onClick={onConnectGmail}
                disabled={syncing}
              >
                {gmailAccessToken ? 'Reconnect' : 'Connect'}
              </Button>
              {gmailAccessToken ? (
                <Button variant="ghost" size="sm" onClick={() => setGmailAccessToken(null)}>
                  Disconnect
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-400">
            <div className="font-semibold text-slate-300">Action items</div>
            <div className="mt-1">{counts.high} need action today</div>
          </div>
        </div>

        {/* Column 2: Feed */}
        <div className="rounded-3xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="text-sm font-semibold">Email feed</div>
            <div className="text-xs text-slate-400">
              Showing {filteredEmails.length} email{filteredEmails.length === 1 ? '' : 's'}
            </div>
          </div>
          <div className="max-h-[calc(100vh-220px)] overflow-auto p-2">
            {filteredEmails.map((e) => {
              const a = analysisById[e.id]
              const isSelected = e.id === selectedId
              return (
                <button
                  key={e.id}
                  className={cn(
                    'w-full rounded-2xl border p-3 text-left transition',
                    isSelected
                      ? 'border-indigo-500/30 bg-indigo-500/10'
                      : 'border-white/10 bg-black/10 hover:bg-white/5',
                  )}
                  onClick={() => void onSelect(e.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-100">{e.subject}</div>
                      <div className="truncate text-xs text-slate-400">{e.from}</div>
                    </div>
                    <div className="shrink-0 text-[11px] text-slate-400">{e.date}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {a ? <PriorityBadge priority={a.priority} /> : null}
                    <div className="line-clamp-2 text-xs text-slate-300">
                      {a?.summary || e.snippet || 'Click to open…'}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Column 3: Workspace */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          {!selectedId ? (
            <div className="grid min-h-[420px] place-items-center text-center">
              <div>
                <div className="text-sm font-semibold text-slate-100">Select an email</div>
                <div className="mt-1 text-xs text-slate-400">AI summary + reply tools appear here.</div>
              </div>
            </div>
          ) : !selectedDetail ? (
            <div className="grid min-h-[420px] place-items-center text-sm text-slate-300">Loading email…</div>
          ) : (
            <div className="flex h-full flex-col gap-4">
              <div>
                <div className="text-xl font-semibold">{selectedDetail.subject}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="truncate">{selectedDetail.from}</span>
                  <span>•</span>
                  <span>{selectedDetail.date}</span>
                  {selectedAnalysis ? <PriorityBadge priority={selectedAnalysis.priority} /> : null}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs font-semibold text-slate-200">AI Summary</div>
                <div className="mt-1 text-sm text-slate-200">
                  {selectedAnalysis?.summary || selectedDetail.snippet || 'Analyzing…'}
                </div>
              </div>

              <div className="flex-1 overflow-auto rounded-2xl border border-white/10 bg-black/10 p-3">
                <div className="whitespace-pre-wrap text-sm text-slate-200">{selectedDetail.bodyText}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-200">Auto-reply</div>
                  <div className="flex items-center gap-2">
                    <select
                      className="h-9 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-slate-100"
                      value={tone}
                      onChange={(e) => setTone(e.target.value as ReplyTone)}
                    >
                      <option value="professional">Professional</option>
                      <option value="friendly">Friendly</option>
                      <option value="short">Short</option>
                    </select>
                    <Button variant="secondary" size="sm" onClick={onGenerateReply} disabled={generating}>
                      <Sparkles className={cn('size-4', generating && 'animate-pulse')} />
                      Generate
                    </Button>
                  </div>
                </div>

                <textarea
                  className="mt-3 h-32 w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="AI draft reply will appear here. You can edit before sending."
                  value={selectedDraft?.draft ?? ''}
                  onChange={(e) => setReplyDraft(selectedId, tone, e.target.value)}
                />

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    {gmailAccessToken ? 'Will send via your Gmail account.' : 'Connect Gmail to send for real.'}
                  </div>
                  <Button variant="primary" size="sm" onClick={onSend} disabled={sending}>
                    <Send className="size-4" />
                    Send
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

