// NEW: Added the onBatchFetched callback parameter
export async function listInbox(token: string, onBatchFetched?: (batch: any[]) => void) {
  let allMessages: any[] = []
  let pageToken: string | undefined = undefined

  // 1. Loop through all pages to get every single message ID (This is very fast)
  do {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    url.searchParams.append('maxResults', '500') 
    url.searchParams.append('q', 'in:inbox')
    if (pageToken) {
      url.searchParams.append('pageToken', pageToken)
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!res.ok) throw new Error('Failed to fetch inbox')
    const data = await res.json()
    
    if (data.messages) {
      allMessages = allMessages.concat(data.messages)
    }
    pageToken = data.nextPageToken 
  } while (pageToken)

  // 2. Fetch the subject/sender details in safe batches of 10
  const emails = []
  const batchSize = 10
  
  for (let i = 0; i < allMessages.length; i += batchSize) {
    const batch = allMessages.slice(i, i + batchSize)
    
    const promises = batch.map(async (m) => {
      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (detailRes.ok) {
          const detail = await detailRes.json()
          const getHeader = (name: string) => detail.payload.headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
          return {
            id: detail.id,
            subject: getHeader('subject'),
            from: getHeader('from'),
            date: getHeader('date'),
            snippet: detail.snippet
          }
        }
      } catch (err) {
        console.error('Failed to fetch detail for email', m.id, err)
      }
      return null
    })
    
    const results = await Promise.all(promises)
    const validBatch = []
    
    for (const r of results) {
      if (r) {
        emails.push(r)
        validBatch.push(r)
      }
    }
    
    // NEW: Yield the batch back to the UI immediately!
    if (onBatchFetched && validBatch.length > 0) {
      onBatchFetched(validBatch)
    }
  }

  return emails
}

export async function getEmailDetail(token: string, id: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error('Failed to fetch email details')
  const data = await res.json()

  let bodyText = ''
  let htmlBody = ''
  const inlineImages: { cid: string; mimeType: string; attachmentId: string; data?: string }[] = []

  function parseParts(parts: any[]) {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        bodyText += decodeBase64(part.body.data)
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        htmlBody += decodeBase64(part.body.data)
      } else if (part.mimeType?.startsWith('image/') && part.headers) {
        const cidHeader = part.headers.find((h: any) => h.name.toLowerCase() === 'content-id')
        
        if (cidHeader && part.body?.attachmentId) {
          const cid = cidHeader.value.replace(/[<>]/g, '')
          inlineImages.push({
            cid,
            mimeType: part.mimeType,
            attachmentId: part.body.attachmentId
          })
        } else if (cidHeader && part.body?.data) {
          const cid = cidHeader.value.replace(/[<>]/g, '')
          inlineImages.push({
            cid,
            mimeType: part.mimeType,
            attachmentId: '',
            data: part.body.data
          })
        }
      }
      
      if (part.parts) {
        parseParts(part.parts)
      }
    }
  }

  if (data.payload?.parts) {
    parseParts(data.payload.parts)
  } else if (data.payload?.body?.data) {
    if (data.payload.mimeType === 'text/html') htmlBody = decodeBase64(data.payload.body.data)
    else bodyText = decodeBase64(data.payload.body.data)
  }

  for (const img of inlineImages) {
    if (img.attachmentId && !img.data) {
      try {
        const attachRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/attachments/${img.attachmentId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (attachRes.ok) {
          const attachData = await attachRes.json()
          img.data = attachData.data
        }
      } catch (err) {
        console.error('Failed to fetch inline image', err)
      }
    }
    
    if (img.data && htmlBody) {
      const cleanData = img.data.replace(/-/g, '+').replace(/_/g, '/')
      const dataUrl = `data:${img.mimeType};base64,${cleanData}`
      htmlBody = htmlBody.split(`cid:${img.cid}`).join(dataUrl)
    }
  }

  const getHeader = (name: string) => data.payload.headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

  return {
    id: data.id,
    subject: getHeader('subject'),
    from: getHeader('from'),
    date: getHeader('date'),
    snippet: data.snippet,
    bodyText: bodyText || htmlBody.replace(/<[^>]+>/g, '') || '',
    htmlBody: htmlBody
  }
}

export async function sendReply(token: string, to: string, subject: string, draftText: string) {
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`
  const messageParts = [
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    draftText
  ]
  const message = messageParts.join('\n')
  const encodedMessage = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encodedMessage })
  })

  if (!res.ok) throw new Error('Failed to send reply')
  return res.json()
}

export async function archiveEmail(token: string, id: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      removeLabelIds: ['INBOX']
    })
  })

  if (!res.ok) throw new Error('Failed to archive email')
  return res.json()
}

function decodeBase64(data: string) {
  try {
    return decodeURIComponent(escape(atob(data.replace(/-/g, '+').replace(/_/g, '/'))))
  } catch {
    return ''
  }
}