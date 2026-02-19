import { useState } from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { X, Send, FileText } from 'lucide-react'
import { sendEmail, createDraft } from '../lib/gmail'

interface ComposeModalProps {
    gmailAccessToken: string | null
    onClose: () => void
    onSuccess?: (message: string) => void
    onError?: (error: string) => void
}

export function ComposeModal({ gmailAccessToken, onClose, onSuccess, onError }: ComposeModalProps) {
    const [to, setTo] = useState('')
    const [subject, setSubject] = useState('')
    const [body, setBody] = useState('')
    const [sending, setSending] = useState(false)
    const [savingDraft, setSavingDraft] = useState(false)

    async function handleSend() {
        if (!gmailAccessToken) {
            onError?.('Connect your Gmail account first.')
            return
        }
        if (!to.trim()) {
            onError?.('Please enter a recipient email.')
            return
        }
        if (!subject.trim() && !body.trim()) {
            onError?.('Please enter a subject or message body.')
            return
        }

        setSending(true)
        try {
            await sendEmail(gmailAccessToken, to.trim(), subject.trim(), body.trim())
            onSuccess?.('Email sent successfully!')
            onClose()
        } catch (e) {
            onError?.(e instanceof Error ? e.message : 'Failed to send email.')
        } finally {
            setSending(false)
        }
    }

    async function handleSaveDraft() {
        if (!gmailAccessToken) {
            onError?.('Connect your Gmail account first.')
            return
        }

        setSavingDraft(true)
        try {
            await createDraft(gmailAccessToken, to.trim(), subject.trim() || '(No Subject)', body.trim())
            onSuccess?.('Draft saved to Gmail!')
            onClose()
        } catch (e) {
            onError?.(e instanceof Error ? e.message : 'Failed to save draft.')
        } finally {
            setSavingDraft(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/50 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-100">New Email</h2>
                        <p className="text-xs text-slate-400">Compose and send via your Gmail account</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                    >
                        <X className="size-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    <div>
                        <label className="text-xs font-medium text-slate-300 mb-1.5 block">To</label>
                        <Input
                            placeholder="recipient@example.com"
                            type="email"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            disabled={sending || savingDraft}
                        />
                    </div>

                    <div>
                        <label className="text-xs font-medium text-slate-300 mb-1.5 block">Subject</label>
                        <Input
                            placeholder="Email subject"
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            disabled={sending || savingDraft}
                        />
                    </div>

                    <div>
                        <label className="text-xs font-medium text-slate-300 mb-1.5 block">Message</label>
                        <textarea
                            placeholder="Write your message here..."
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            disabled={sending || savingDraft}
                            rows={8}
                            className="h-48 w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
                    <div className="text-xs text-slate-400">
                        {gmailAccessToken ? 'Will send via your Gmail account.' : '⚠ Connect Gmail to send.'}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleSaveDraft}
                            disabled={savingDraft || sending || !gmailAccessToken}
                        >
                            <FileText className="size-4" />
                            {savingDraft ? 'Saving…' : 'Save Draft'}
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSend}
                            disabled={sending || savingDraft || !gmailAccessToken}
                        >
                            <Send className="size-4" />
                            {sending ? 'Sending…' : 'Send'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
