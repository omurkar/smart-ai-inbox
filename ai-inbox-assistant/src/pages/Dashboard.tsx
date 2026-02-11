import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom' 
import { Button } from '../components/Button'
import { Logo } from '../components/Logo'
import { PriorityBadge } from '../components/Badge'
import { useMailStore } from '../store/mail'
import { useSessionStore } from '../store/session'
import { connectGmail, signOutUser } from '../lib/auth'
import { analyzeEmail, generateReply } from '../lib/ai'
import { getEmailDetail, listInbox, sendReply, archiveEmail } from '../lib/gmail'
import type { EmailFilter, ReplyTone, EmailListItem } from '../types/mail'
import { cn } from '../lib/utils'
import { Inbox, LogOut, RefreshCw, Send, Sparkles, Reply, X, Search, Archive, PieChart } from 'lucide-react' 

function extractEmailAddress(from: string) {
  const m = from.match(/<([^>]+)>/)
  if (m?.[1]) return m[1]
  if (from.includes('@')) return from.trim()
  return ''
}

export function Dashboard() {
  const nav = useNavigate() 
  const { user, gmailAccessToken, setGmailAccessToken, clearGmailAccessToken } = useSessionStore()
  const {
    filter,
    emails,
    selectedId,
    detailsById,
    analysisById,
    replyDraftById,
    archivedIds,
    syncing,
    error,
    setFilter,
    setEmails,
    appendEmails, // NEW: Grab the append function
    select,
    upsertDetail,
    upsertAnalysis,
    setReplyDraft,
    setSyncing,
    setError,
    archiveLocalEmail,
  } = useMailStore()

  const [tone, setTone] = useState<ReplyTone>('professional')
  const [sending, setSending] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [isAutoReplyOpen, setIsAutoReplyOpen] = useState(false)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [archiving, setArchiving] = useState(false)

  useEffect(() => {
    if (gmailAccessToken && emails.length === 0 && !syncing) {
      onSyncInbox(gmailAccessToken)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmailAccessToken])

  const filteredEmails = useMemo(() => {
    let list = emails

    if (filter === 'archived') {
      list = list.filter((e) => archivedIds.includes(e.id))
    } else {
      list = list.filter((e) => !archivedIds.includes(e.id))
      
      if (filter !== 'all') {
        list = list.filter((e) => analysisById[e.id]?.priority === filter)
      }
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase()
      list = list.filter((e) => 
        e.subject.toLowerCase().includes(q) || 
        e.from.toLowerCase().includes(q)
      )
    }
    return list
  }, [analysisById, emails, filter, searchQuery, archivedIds])

  const selectedDetail = selectedId ? detailsById[selectedId] : undefined
  const selectedAnalysis = selectedId ? analysisById[selectedId] : undefined
  const selectedDraft = selectedId ? replyDraftById[selectedId] : undefined

  const counts = useMemo(() => {
    let high = 0, medium = 0, low = 0, archived = 0, totalActive = 0
    for (const e of emails) {
      if (archivedIds.includes(e.id)) {
        archived++
      } else {
        totalActive++
        const p = analysisById[e.id]?.priority
        if (p === 'high') high++
        else if (p === 'medium') medium++
        else if (p === 'low') low++
      }
    }
    return { high, medium, low, archived, totalActive }
  }, [analysisById, emails, archivedIds])

  async function performAutoAnalysis(list: EmailListItem[], token: string) {
    for (const e of list) {
      const state = useMailStore.getState()
      if (state.analysisById[e.id]) continue

      let detail = state.detailsById[e.id]
      if (!detail) {
        try {
          detail = await getEmailDetail(token, e.id)
          upsertDetail(detail)
        } catch {
          continue 
        }
      }

      try {
        const analysis = await analyzeEmail({
          from: e.from,
          subject: e.subject,
          snippet: e.snippet,
          bodyText: detail?.bodyText,
        })
        upsertAnalysis(e.id, analysis)
      } catch (err) {
        console.error('Auto-analysis failed for', e.id, err)
      }
    }
  }

  async function onConnectGmail() {
    if (!user) return
    setError(null)
    setSyncing(true)
    try {
      const token = await connectGmail(user)
      setGmailAccessToken(token)
      
      // Clear out the old emails before streaming the new ones
      setEmails([])
      
      // Stream batches of 10 in real-time
      await listInbox(token, (batch) => {
        appendEmails(batch)
        performAutoAnalysis(batch, token) // Instantly analyze this batch
      })

    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect Gmail.')
    } finally {
      setSyncing(false)
    }
  }

  async function onSyncInbox(forceToken?: string) {
    setError(null)
    setSyncing(true)
    try {
      const tokenToUse = forceToken || gmailAccessToken
      if (!tokenToUse) {
        throw new Error('Please connect your Gmail account to sync.')
      }
      
      // Clear out the old emails before streaming the new ones
      setEmails([])
      
      // Stream batches of 10 in real-time
      await listInbox(tokenToUse, (batch) => {
        appendEmails(batch)
        performAutoAnalysis(batch, tokenToUse) // Instantly analyze this batch
      })
      
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

  async function onSelect(id: string) {
    select(id)
    setIsAutoReplyOpen(false) 
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

  async function onArchive() {
    if (!selectedId || !gmailAccessToken) return
    setArchiving(true)
    setError(null)
    try {
      await archiveEmail(gmailAccessToken, selectedId)
      archiveLocalEmail(selectedId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to archive email on Gmail.')
    } finally {
      setArchiving(false)
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
      setIsAutoReplyOpen(false) 
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
    { key: 'all', label: 'All', meta: `${counts.totalActive}` },
    { key: 'high', label: 'High', meta: `${counts.high}` },
    { key: 'medium', label: 'Medium', meta: `${counts.medium}` },
    { key: 'low', label: 'Low', meta: `${counts.low}` },
    { key: 'archived', label: 'Archived', meta: `${counts.archived}` },
  ]

  return (
    <div className="flex h-full w-full flex-col">
      <div className="shrink-0 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-2">
            <div className="hidden text-xs text-slate-400 sm:block">{user?.email}</div>
            <Button variant="secondary" size="sm" onClick={() => onSyncInbox()} disabled={syncing}>
              <RefreshCw className={cn('size-4', syncing && 'animate-spin')} />
              Sync
            </Button>
            <Button variant="secondary" size="sm" onClick={() => nav('/stats')}>
              <PieChart className="size-4" />
              Show Statistics
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mx-auto w-full shrink-0 max-w-[1400px] px-6 pt-4">
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            {error}
          </div>
        </div>
      ) : null}

      <div className="mx-auto grid w-full max-w-[1400px] flex-1 min-h-0 grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-[280px_420px_1fr]">
        
        {/* Column 1: Sidebar */}
        <div className="flex flex-col overflow-y-auto rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex shrink-0 items-center justify-between">
            <div className="text-sm font-semibold">Filters</div>
            <Inbox className="size-4 text-slate-400" />
          </div>

          <div className="mt-3 grid shrink-0 gap-2">
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

          <div className="mt-6 shrink-0 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-slate-200">Gmail</div>
            <div className="mt-1 text-xs text-slate-400">
              {gmailAccessToken ? 'Connected securely' : 'Not connected'}
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

          <div className="mt-4 shrink-0 text-xs text-slate-400">
            <div className="font-semibold text-slate-300">Action items</div>
            <div className="mt-1">{counts.high} need action today</div>
          </div>
        </div>

        {/* Column 2: Feed */}
        <div className="flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="shrink-0 border-b border-white/10 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                {filter === 'archived' ? 'Archived Emails' : 'Email Feed'}
              </div>
              <div className="text-xs text-slate-400">
                {filteredEmails.length} email{filteredEmails.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-2.5 size-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search subjects or senders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {filteredEmails.length === 0 && !syncing ? (
              <div className="p-4 text-center text-sm text-slate-400">
                {searchQuery ? 'No matching emails found.' : filter === 'archived' ? 'No emails archived yet.' : 'No emails yet. Click Connect or Sync to fetch your inbox.'}
              </div>
            ) : null}
            {filteredEmails.map((e) => {
              const a = analysisById[e.id]
              const isSelected = e.id === selectedId
              return (
                <button
                  key={e.id}
                  className={cn(
                    'w-full rounded-2xl border p-3 text-left transition mt-1',
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
                      {a?.summary || e.snippet || 'Analyzing...'}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Column 3: Workspace */}
        <div className="flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4">
          {!selectedId ? (
            <div className="grid h-full flex-1 place-items-center text-center">
              <div>
                <div className="text-sm font-semibold text-slate-100">Select an email</div>
                <div className="mt-1 text-xs text-slate-400">AI summary + reply tools appear here.</div>
              </div>
            </div>
          ) : !selectedDetail ? (
            <div className="grid h-full flex-1 place-items-center text-sm text-slate-300">Loading email…</div>
          ) : (
            <div className="flex h-full flex-col gap-4 overflow-hidden">
              <div className="shrink-0 flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-semibold">{selectedDetail.subject}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="truncate">{selectedDetail.from}</span>
                    <span>•</span>
                    <span>{selectedDetail.date}</span>
                    {selectedAnalysis ? <PriorityBadge priority={selectedAnalysis.priority} /> : null}
                  </div>
                </div>
                {filter !== 'archived' && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={onArchive} 
                    disabled={archiving}
                    className="shrink-0 text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10"
                  >
                    <Archive className={cn("size-4", archiving && "animate-pulse")} />
                    <span className="hidden sm:inline">Archive</span>
                  </Button>
                )}
              </div>

              <div className="shrink-0 rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs font-semibold text-slate-200">AI Summary</div>
                <div className="mt-1 text-sm text-slate-200">
                  {selectedAnalysis?.summary || selectedDetail.snippet || 'Analyzing…'}
                </div>
              </div>

              {/* Main reading pane */}
              <div className="flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white">
                {selectedDetail.htmlBody ? (
                  <iframe
                    title="Email content"
                    srcDoc={selectedDetail.htmlBody}
                    className="h-full w-full border-none bg-white"
                    sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
                  />
                ) : (
                  <div className="h-full w-full overflow-y-auto whitespace-pre-wrap p-4 text-sm text-slate-900">
                    {selectedDetail.bodyText}
                  </div>
                )}
              </div>

              {!isAutoReplyOpen ? (
                <div className="shrink-0 flex justify-end">
                  <Button variant="primary" onClick={() => setIsAutoReplyOpen(true)}>
                    <Reply className="size-4" />
                    Write Auto-reply
                  </Button>
                </div>
              ) : (
                <div className="shrink-0 rounded-2xl border border-white/10 bg-black/20 p-3 shadow-lg">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="text-xs font-semibold text-slate-200">Auto-reply</div>
                      <button 
                        onClick={() => setIsAutoReplyOpen(false)} 
                        className="rounded-md bg-white/5 p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
                        title="Close Auto-reply"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
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
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}