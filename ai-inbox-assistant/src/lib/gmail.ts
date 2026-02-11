import type { EmailDetail, EmailListItem } from '../types/mail'

function headerValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase())
  return h?.value ?? ''
}

function decodeBase64Url(data: string) {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  try {
    return decodeURIComponent(
      Array.from(atob(padded))
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    )
  } catch {
    return atob(padded)
  }
}

function extractTextPlain(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeBase64Url(payload.body.data)
  const parts: any[] = payload.parts ?? []
  for (const p of parts) {
    const t = extractTextPlain(p)
    if (t) return t
  }
  return ''
}

async function gmailFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) throw new Error(`Gmail API error (${res.status})`)
  return (await res.json()) as T
}

export async function listInbox(accessToken: string, maxResults = 20): Promise<Array<EmailListItem>> {
  const list = await gmailFetch<{ messages?: Array<{ id: string; threadId: string }> }>(
    accessToken,
    `messages?maxResults=${maxResults}&labelIds=INBOX`,
  )

  const messages = list.messages ?? []
  const items: Array<EmailListItem> = []

  // Fetch metadata for each message (simple + reliable for MVP)
  for (const m of messages) {
    const msg = await gmailFetch<any>(
      accessToken,
      `messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    )
    const headers = msg.payload?.headers as Array<{ name?: string; value?: string }> | undefined
    items.push({
      id: msg.id,
      threadId: msg.threadId,
      from: headerValue(headers, 'From') || '(unknown)',
      subject: headerValue(headers, 'Subject') || '(no subject)',
      date: headerValue(headers, 'Date') || '',
      snippet: msg.snippet ?? '',
    })
  }

  return items
}

export async function getEmailDetail(accessToken: string, id: string): Promise<EmailDetail> {
  const msg = await gmailFetch<any>(accessToken, `messages/${id}?format=full`)
  const headers = msg.payload?.headers as Array<{ name?: string; value?: string }> | undefined
  const bodyText = extractTextPlain(msg.payload) || msg.snippet || ''
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: headerValue(headers, 'From') || '(unknown)',
    subject: headerValue(headers, 'Subject') || '(no subject)',
    date: headerValue(headers, 'Date') || '',
    snippet: msg.snippet ?? '',
    bodyText,
  }
}

export async function sendReply(accessToken: string, to: string, subject: string, body: string) {
  const raw = [
    `To: ${to}`,
    `Subject: Re: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].join('\r\n')

  const encoded = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  })

  if (!res.ok) throw new Error(`Send failed (${res.status})`)
}

