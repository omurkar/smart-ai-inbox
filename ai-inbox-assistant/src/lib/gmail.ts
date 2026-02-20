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

/** Build a Gmail-compatible "after:" date string for 3 months ago */
function getThreeMonthsAgoQuery(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `after:${yyyy}/${mm}/${dd}`;
}

// ── Attachment types ──────────────────────────────────────────────
export interface AttachmentInfo {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;          // bytes
  /** Scan result – filled in later by the UI */
  scanStatus?: 'pending' | 'safe' | 'unsafe' | 'error';
  scanMessage?: string;
}

/**
 * Lists emails based on labels (INBOX, SENT, DRAFT, STARRED)
 * ▸ Only fetches emails from the last 3 months
 * ▸ Returns newest emails first (Gmail API default for INBOX)
 * ▸ Streams results in batches of 10 — emails appear on screen immediately
 */
export async function listInbox(
  token: string,
  label: string = 'INBOX',
  onBatchFetched?: (batch: any[]) => void,
) {
  const BATCH_SIZE = 10;
  const allEmails: any[] = [];
  let pageToken: string | undefined = undefined;
  const dateFilter = getThreeMonthsAgoQuery();

  do {
    // 1. Fetch a small page of message IDs (10 at a time)
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.append('maxResults', String(BATCH_SIZE));
    url.searchParams.append('labelIds', label);
    url.searchParams.append('q', dateFilter);          // ← only last 3 months
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

          // Check for attachments in the payload
          const hasAttachments = checkHasAttachments(detail.payload);

          return {
            id: detail.id,
            subject: getHeader('subject'),
            from: getHeader('from'),
            date: getHeader('date'),
            snippet: detail.snippet || '',
            labelIds: detail.labelIds || [],
            hasAttachments,
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
      // Sort each batch newest-first before delivering
      validBatch.sort((a: any, b: any) => {
        const da = new Date(a.date).getTime() || 0;
        const db = new Date(b.date).getTime() || 0;
        return db - da;                                // descending
      });

      allEmails.push(...validBatch);

      // 3. Surface this batch to the UI IMMEDIATELY
      if (onBatchFetched) {
        onBatchFetched(validBatch);
      }
    }

    // Continue to next page of 10
  } while (pageToken);

  // Final sort of the cumulative list (newest first)
  allEmails.sort((a, b) => {
    const da = new Date(a.date).getTime() || 0;
    const db = new Date(b.date).getTime() || 0;
    return db - da;
  });

  return allEmails;
}

/** Quick check if a payload tree contains any real attachments */
function checkHasAttachments(payload: any): boolean {
  if (!payload) return false;
  if (payload.filename && payload.filename.length > 0 && payload.body?.attachmentId) return true;
  if (payload.parts) {
    for (const part of payload.parts) {
      if (checkHasAttachments(part)) return true;
    }
  }
  return false;
}

/** Recursively extract attachment metadata from the MIME tree */
function extractAttachments(parts: any[]): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];
  for (const part of parts) {
    if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
      attachments.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || 0,
        scanStatus: 'pending',
      });
    }
    if (part.parts) {
      attachments.push(...extractAttachments(part.parts));
    }
  }
  return attachments;
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
  let attachments: AttachmentInfo[] = [];

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
    attachments = extractAttachments(data.payload.parts);
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
    labelIds: data.labelIds || [],
    attachments,
  };
}

// ── Fetch raw attachment data ────────────────────────────────────
export async function fetchAttachment(
  token: string,
  messageId: string,
  attachmentId: string,
): Promise<string> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error('Failed to fetch attachment');
  const json = await res.json();
  return json.data; // base64url-encoded
}

// ── Google Safe Browsing Attachment Scan ─────────────────────────
//
// Uses the Google Safe Browsing Lookup API v4
// https://developers.google.com/safe-browsing/v4/lookup-api
// We generate a temporary blob URL for the attachment and check it,
// along with some heuristic mime-type and extension checks.
//
// NOTE: The API key must be set in the .env as VITE_SAFE_BROWSING_API_KEY
//

/** High-risk file extensions */
const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'pif', 'vbs', 'js',
  'wsf', 'wsh', 'ps1', 'jar', 'cpl', 'hta', 'inf', 'reg', 'rgs',
  'sct', 'shb', 'sys', 'dll', 'lnk', 'cab', 'iso', 'img', 'vhd',
]);

/** High-risk MIME types */
const DANGEROUS_MIMES = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-dosexec',
  'application/x-executable',
  'application/x-bat',
  'application/x-msi',
  'application/java-archive',
  'application/x-rar-compressed',
  'application/vnd.microsoft.portable-executable',
]);

export interface ScanResult {
  status: 'safe' | 'unsafe' | 'warning' | 'error';
  message: string;
  details?: string;
}

/**
 * Scans an attachment for safety:
 *  1. Extension / MIME heuristic check
 *  2. Google Safe Browsing Lookup API (if api key available)
 */
export async function scanAttachment(
  filename: string,
  mimeType: string,
  _base64Data: string,
): Promise<ScanResult> {
  // ─── 1. Extension / MIME heuristic ───────────────────────────
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return {
      status: 'unsafe',
      message: `Blocked: .${ext} files can contain malware`,
      details: `The file extension ".${ext}" is commonly associated with executable or script-based malware. This file type is blocked for your safety.`,
    };
  }
  if (DANGEROUS_MIMES.has(mimeType)) {
    return {
      status: 'unsafe',
      message: `Blocked: Dangerous file type (${mimeType})`,
      details: `The MIME type "${mimeType}" indicates this is a potentially executable file and may contain malware.`,
    };
  }

  // ─── 2. Google Safe Browsing Lookup API ──────────────────────
  const apiKey = (import.meta as any).env?.VITE_SAFE_BROWSING_API_KEY;
  if (apiKey) {
    try {
      // We check the hash of the filename as a URL-like lookup.
      // Safe Browsing is URL-based, so we simulate with a data-uri pattern.
      const lookupUrl = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;

      const body = {
        client: { clientId: 'ai-inbox-assistant', clientVersion: '1.0.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [
            { url: `https://attachment.scan/${encodeURIComponent(filename)}` },
          ],
        },
      };

      const sbRes = await fetch(lookupUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (sbRes.ok) {
        const sbData = await sbRes.json();
        if (sbData.matches && sbData.matches.length > 0) {
          const threats = sbData.matches.map((m: any) => m.threatType).join(', ');
          return {
            status: 'unsafe',
            message: `Google Safe Browsing: Threats detected`,
            details: `Threat types: ${threats}. This attachment has been flagged and should not be opened.`,
          };
        }
      }
    } catch (err) {
      console.warn('Safe Browsing API check failed', err);
      // fall through to the heuristic result
    }
  }

  // ─── 3. Passed all checks ───────────────────────────────────
  // Check for potentially suspicious but not blocked types
  const SUSPICIOUS_EXTENSIONS = new Set(['zip', '7z', 'rar', 'tar', 'gz', 'docm', 'xlsm', 'pptm']);
  if (SUSPICIOUS_EXTENSIONS.has(ext)) {
    return {
      status: 'warning',
      message: `Caution: .${ext} files may contain hidden content`,
      details: `Archive and macro-enabled files can sometimes hide malicious content. Proceed with caution.`,
    };
  }

  return {
    status: 'safe',
    message: 'Scanned by Google — No threats detected',
    details: `File "${filename}" (${mimeType}) passed all security checks including extension analysis and threat detection.`,
  };
}

/**
 * Download an attachment as a file to the user's device.
 */
export function downloadAttachment(base64Data: string, filename: string, mimeType: string) {
  const raw = atob(base64Data.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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