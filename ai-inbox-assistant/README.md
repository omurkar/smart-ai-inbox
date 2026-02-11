# Smart AI Inbox Assistant

A **React + Tailwind** single-page app that connects to **Gmail**, uses AI to **prioritize** and **summarize** emails, and generates **context-aware draft replies** (with tone control) that the user edits before sending.

## What’s implemented (MVP)

- **Landing/Login page**: modern SaaS-style landing + Google / Email-Password login (Firebase Auth)
- **Dashboard**: three-column layout (filters → feed → workspace)
- **AI**:
  - **Prioritization** into High/Medium/Low
  - **1–2 sentence summary**
  - **Reply generation** with tone: Professional / Friendly / Short
- **Gmail API**:
  - Connect with scopes (`gmail.readonly`, `gmail.send`)
  - Fetch inbox list + open full email
  - Send replies from the user’s Gmail
- **Safety**:
  - AI key is server-side (local API at `/api/*`)
  - If AI server key is missing, app falls back to a simple heuristic
  - If Gmail isn’t connected, app shows a sample inbox

## Setup

### 1) Install

```bash
npm install
```

### 2) Configure Firebase env

- Copy `env.example` → `.env` (create the file)
- Fill in your Firebase web app config values

### 3) Configure AI server env (optional but recommended)

- Add the following to your project `.env` (create the file) using `env.server.example` as a guide:
  - `OPENAI_API_KEY`
  - (optional) `OPENAI_MODEL`

### 4) Run

```bash
npm run dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:8787` (proxied via Vite at `/api`)

## Notes

- Gmail tokens are stored in `sessionStorage` for the current browser session (so you can “Disconnect” by refreshing/ending the session).
- For production, you’d typically move the Gmail integration to a secure backend with stored refresh tokens and a proper consent flow.
