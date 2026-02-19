// Helper to decode Base64 data from Gmail API
function decodeBase64(data: string) {
  try {
    return decodeURIComponent(escape(atob(data.replace(/-/g, '+').replace(/_/g, '/'))));
  } catch {
    return '';
  }
}

// NEW: Helper to encode messages for Drafts/Sending to handle UTF-8 and Base64 requirements
function encodeMessage(to: string, subject: string, body: string) {
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const messageParts = [
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    body
  ];
  const message = messageParts.join('\n');
  return btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Lists emails based on labels (INBOX, SENT, DRAFT, STARRED)
 * Streams results in batches of 10 — emails appear on screen immediately
 * as each batch is fetched rather than waiting for all IDs first.
 */
export async function listInbox(token: string, label: string = 'INBOX', onBatchFetched?: (batch: any[]) => void) {
  const BATCH_SIZE = 10;
  const allEmails: any[] = [];
  let pageToken: string | undefined = undefined;

  // Stream pages of 10 message IDs, fetch details for each page immediately
  do {
    // 1. Fetch a small page of message IDs (10 at a time)
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.append('maxResults', String(BATCH_SIZE));
    url.searchParams.append('labelIds', label);
    if (pageToken) {
      url.searchParams.append('pageToken', pageToken);
    }

    const listRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!listRes.ok) throw new Error(`Failed to fetch ${label} (${listRes.status})`);
    const listData = await listRes.json();

    const messageStubs: Array<{ id: string }> = listData.messages || [];
    pageToken = listData.nextPageToken;

    if (messageStubs.length === 0) break;

    // 2. Immediately fetch details for THIS page of IDs (parallel)
    const detailPromises = messageStubs.map(async (m) => {
      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (detailRes.ok) {
          const detail = await detailRes.json();
          const getHeader = (name: string) =>
            detail.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

          return {
            id: detail.id,
            subject: getHeader('subject'),
            from: getHeader('from'),
            date: getHeader('date'),
            snippet: detail.snippet || '',
            labelIds: detail.labelIds || [],
          };
        }
      } catch (err) {
        console.error('Failed to fetch detail for email', m.id, err);
      }
      return null;
    });

    const results = await Promise.all(detailPromises);
    const validBatch = results.filter(Boolean);

    if (validBatch.length > 0) {
      allEmails.push(...validBatch);

      // 3. Surface this batch to the UI IMMEDIATELY
      if (onBatchFetched) {
        onBatchFetched(validBatch);
      }
    }

    // Continue to next page of 10
  } while (pageToken);

  return allEmails;
}

export async function getEmailDetail(token: string, id: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch email details');
  const data = await res.json();

  let bodyText = '';
  let htmlBody = '';
  const inlineImages: { cid: string; mimeType: string; attachmentId: string; data?: string }[] = [];

  function parseParts(parts: any[]) {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        bodyText += decodeBase64(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        htmlBody += decodeBase64(part.body.data);
      } else if (part.mimeType?.startsWith('image/') && part.headers) {
        const cidHeader = part.headers.find((h: any) => h.name.toLowerCase() === 'content-id');

        if (cidHeader && part.body?.attachmentId) {
          const cid = cidHeader.value.replace(/[<>]/g, '');
          inlineImages.push({
            cid,
            mimeType: part.mimeType,
            attachmentId: part.body.attachmentId
          });
        } else if (cidHeader && part.body?.data) {
          const cid = cidHeader.value.replace(/[<>]/g, '');
          inlineImages.push({
            cid,
            mimeType: part.mimeType,
            attachmentId: '',
            data: part.body.data
          });
        }
      }

      if (part.parts) {
        parseParts(part.parts);
      }
    }
  }

  if (data.payload?.parts) {
    parseParts(data.payload.parts);
  } else if (data.payload?.body?.data) {
    if (data.payload.mimeType === 'text/html') htmlBody = decodeBase64(data.payload.body.data);
    else bodyText = decodeBase64(data.payload.body.data);
  }

  for (const img of inlineImages) {
    if (img.attachmentId && !img.data) {
      try {
        const attachRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/attachments/${img.attachmentId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (attachRes.ok) {
          const attachData = await attachRes.json();
          img.data = attachData.data;
        }
      } catch (err) {
        console.error('Failed to fetch inline image', err);
      }
    }

    if (img.data && htmlBody) {
      const cleanData = img.data.replace(/-/g, '+').replace(/_/g, '/');
      const dataUrl = `data:${img.mimeType};base64,${cleanData}`;
      htmlBody = htmlBody.split(`cid:${img.cid}`).join(dataUrl);
    }
  }

  const getHeader = (name: string) => data.payload.headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  return {
    id: data.id,
    subject: getHeader('subject'),
    from: getHeader('from'),
    date: getHeader('date'),
    snippet: data.snippet,
    bodyText: bodyText || htmlBody.replace(/<[^>]+>/g, '') || '',
    htmlBody: htmlBody,
    labelIds: data.labelIds || []
  };
}

// Updated to handle standard email sending (Compose)
export async function sendEmail(token: string, to: string, subject: string, bodyText: string) {
  const encodedMessage = encodeMessage(to, subject, bodyText);

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encodedMessage })
  });

  if (!res.ok) throw new Error('Failed to send email');
  return res.json();
}

// Alias for sendEmail — used by Dashboard to reply to emails
export async function sendReply(token: string, to: string, subject: string, bodyText: string) {
  return sendEmail(token, to, `Re: ${subject.replace(/^Re:\s*/i, '')}`, bodyText);
}

// NEW: Function to create a Draft
export async function createDraft(token: string, to: string, subject: string, bodyText: string) {
  const encodedMessage = encodeMessage(to, subject, bodyText);

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        raw: encodedMessage
      }
    })
  });

  if (!res.ok) throw new Error('Failed to create draft');
  return res.json();
}

// NEW: Function to toggle Star (Important for AI Priority training)
export async function toggleStar(token: string, id: string, shouldStar: boolean) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      addLabelIds: shouldStar ? ['STARRED'] : [],
      removeLabelIds: shouldStar ? [] : ['STARRED']
    })
  });

  if (!res.ok) throw new Error('Failed to update star status');
  return res.json();
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
  });

  if (!res.ok) throw new Error('Failed to archive email');
  return res.json();
}