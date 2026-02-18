import { useEffect, useMemo, useState, useRef } from 'react'
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
import { Inbox, LogOut, RefreshCw, Send, Sparkles, Reply, X, Search, Archive, PieChart, Calendar, Plus, ExternalLink } from 'lucide-react' 

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
    appendEmails,
    select,
    upsertDetail,
    upsertAnalysis,
    setReplyDraft,
    setSyncing,
    setError,
    archiveLocalEmail,
    addShadowEvent,
    shadowEvents,
  } = useMailStore()

  const [tone, setTone] = useState<ReplyTone>('professional')
  const [sending, setSending] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [isAutoReplyOpen, setIsAutoReplyOpen] = useState(false)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [archiving, setArchiving] = useState(false)

  // NEW: Ref to strictly control cancelling the sync loop
  const abortSyncRef = useRef(false)

  // FIX: Moved these declarations ABOVE the useEffect so they are initialized first
  const selectedDetail = selectedId ? detailsById[selectedId] : undefined
  const selectedAnalysis = selectedId ? analysisById[selectedId] : undefined
  const selectedDraft = selectedId ? replyDraftById[selectedId] : undefined

  // STOP SYNC LOGIC
  const stopSync = () => {
    if (window.confirm("Do you want to stop the sync process?")) {
      abortSyncRef.current = true;
      setSyncing(false);
    }
  }

  // AUTO-MARKING LOGIC (Fallback): Save event as soon as it's analyzed and selected
  useEffect(() => {
    if (selectedAnalysis?.suggestedEvent && selectedId) {
      const alreadyExists = shadowEvents.some(e => e.emailId === selectedId)
      if (!alreadyExists) {
        addShadowEvent({
          id: Math.random().toString(36).substr(2, 9),
          emailId: selectedId,
          title: selectedAnalysis.suggestedEvent.title,
          date: selectedAnalysis.suggestedEvent.date,
          description: selectedAnalysis.suggestedEvent.description,
        })
      }
    }
  }, [selectedAnalysis, selectedId, addShadowEvent, shadowEvents])

  // REDIRECT LOGIC: Jump to email from calendar
  const handleCalendarClick = (emailId: string) => {
    setFilter('all') // Ensure we aren't filtered out
    onSelect(emailId)
  }

  // REMOVED AUTO-SYNC ON LOGIN to prevent immediate fetching
  // useEffect(() => {
  //   if (gmailAccessToken && emails.length === 0 && !syncing) {
  //     onSyncInbox(gmailAccessToken)
  //   }
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [gmailAccessToken])

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

  // NEW BACKGROUND AUTO-MARKING: Analyzes list silently and extracts calendar events immediately
  async function performAutoAnalysis(list: EmailListItem[], token: string) {
    for (const e of list) {
      if (abortSyncRef.current) break; // Break out immediately if user clicked Stop

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
          id: e.id,
          from: e.from,
          subject: e.subject,
          snippet: e.snippet,
          bodyText: detail?.bodyText,
        })
        upsertAnalysis(e.id, analysis)

        // BACKGROUND CALENDAR TAGGING: Save to calendar automatically without clicking
        if (analysis.suggestedEvent) {
          const currentEvents = useMailStore.getState().shadowEvents
          if (!currentEvents.some(evt => evt.emailId === e.id)) {
            useMailStore.getState().addShadowEvent({
              id: Math.random().toString(36).substr(2, 9),
              emailId: e.id,
              title: analysis.suggestedEvent.title,
              date: analysis.suggestedEvent.date,
              description: analysis.suggestedEvent.description,
            })
          }
        }
      } catch (err) {
        console.error('Auto-analysis failed for', e.id, err)
      }
    }
  }

  async function onConnectGmail() {
    if (!user) return
    setError(null)
    setSyncing(true)
    abortSyncRef.current = false // Reset abort flag
    try {
      const token = await connectGmail(user)
      setGmailAccessToken(token)
      setEmails([])
      await listInbox(token, (batch) => {
        if (abortSyncRef.current) throw new Error('SYNC_ABORTED') // Throw custom error to break loop
        appendEmails(batch)
        performAutoAnalysis(batch, token)
      })
    } catch (e) {
      if (e instanceof Error && e.message === 'SYNC_ABORTED') return; // Ignore silent aborts
      setError(e instanceof Error ? e.message : 'Failed to connect Gmail.')
    } finally {
      if (!abortSyncRef.current) setSyncing(false)
    }
  }

  async function onSyncInbox(forceToken?: string) {
    setError(null)
    setSyncing(true)
    abortSyncRef.current = false // Reset abort flag
    try {
      const tokenToUse = forceToken || gmailAccessToken
      if (!tokenToUse) {
        throw new Error('Please connect your Gmail account to sync.')
      }
      setEmails([])
      await listInbox(tokenToUse, (batch) => {
        if (abortSyncRef.current) throw new Error('SYNC_ABORTED') // Throw custom error to break loop
        appendEmails(batch)
        performAutoAnalysis(batch, tokenToUse)
      })
    } catch (e) {
      if (e instanceof Error && e.message === 'SYNC_ABORTED') return; // Ignore silent aborts
      setError(e instanceof Error ? e.message : 'Sync failed.')
    } finally {
      if (!abortSyncRef.current) setSyncing(false)
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
          id: base.id,
          from: base.from,
          subject: base.subject,
          snippet: base.snippet,
          bodyText: detail?.bodyText,
        })
        upsertAnalysis(id, analysis)
        
        // CALENDAR TAGGING (Fallback): If an email was missed during sync, tag it when clicked
        if (analysis.suggestedEvent) {
          const currentEvents = useMailStore.getState().shadowEvents
          if (!currentEvents.some(evt => evt.emailId === id)) {
            useMailStore.getState().addShadowEvent({
              id: Math.random().toString(36).substr(2, 9),
              emailId: id,
              title: analysis.suggestedEvent.title,
              date: analysis.suggestedEvent.date,
              description: analysis.suggestedEvent.description,
            })
          }
        }
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
          id: base.id,
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
            
            {/* NEW: Dynamic Sync / Stop Button */}
            {syncing ? (
              <Button variant="secondary" size="sm" onClick={stopSync} className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border-rose-500/30">
                <X className="size-4" />
                Stop Sync
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => onSyncInbox()}>
                <RefreshCw className="size-4" />
                Sync
              </Button>
            )}

            <Button variant="secondary" size="sm" onClick={() => nav('/stats')} disabled={syncing}>
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
                <Button variant="ghost" size="sm" onClick={() => setGmailAccessToken(null)} disabled={syncing}>
                  Disconnect
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 shrink-0 text-xs text-slate-400">
            <div className="font-semibold text-slate-300">Action items</div>
            <div className="mt-1">{counts.high} need action today</div>
          </div>

          {/* NEW: Local Calendar Widget in Sidebar */}
          <div className="mt-8 shrink-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400 mb-3 uppercase tracking-wider">
              <Calendar size={14} /> Local Calendar
            </div>
            <div className="space-y-2">
              {shadowEvents.length === 0 ? (
                <div className="text-[11px] text-slate-500 italic">No meetings detected yet.</div>
              ) : (
                shadowEvents.map(evt => (
                  <button 
                    key={evt.id}
                    onClick={() => handleCalendarClick(evt.emailId)}
                    className="w-full text-left p-2 rounded-xl bg-white/5 border border-white/5 hover:border-indigo-500/30 transition group"
                  >
                    <div className="text-xs font-medium text-slate-200 truncate">{evt.title}</div>
                    <div className="flex items-center justify-between mt-1">
                       <span className="text-[10px] text-slate-500">{evt.date}</span>
                       <ExternalLink size={10} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
                    </div>
                  </button>
                ))
              )}
            </div>
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

              {/* NEW: Suggested Event Card (Shadow Calendar Integration - Auto-Saved) */}
              {selectedAnalysis?.suggestedEvent && (
                <div className="shrink-0 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="size-4 text-indigo-400" />
                      <div className="text-xs font-semibold text-indigo-100">Suggested Event</div>
                    </div>
                    <div className="h-6 px-2 text-[10px] font-bold flex items-center text-indigo-300 bg-indigo-500/20 rounded">
                      Auto-Saved
                    </div>
                  </div>
                  <div className="mt-2 text-[13px] text-indigo-200/90 leading-snug">
                    <span className="font-semibold text-white">{selectedAnalysis.suggestedEvent.title}</span>
                    <span className="mx-2 opacity-50">•</span>
                    <span>{selectedAnalysis.suggestedEvent.date}</span>
                  </div>
                </div>
              )}

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