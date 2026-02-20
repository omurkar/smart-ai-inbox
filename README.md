# 📧 Smart AI Inbox Assistant

A modern, React-based web application that connects securely to your **Gmail** and leverages **Artificial Intelligence** to tame your inbox. It automatically categorizes emails, summarizes long threads, extracts calendar events, and generates context-aware draft replies.

## ✨ Key Features

* **🔐 Secure Authentication:** Seamless Google OAuth 2.0 and Firebase Email/Password login.
* **📬 Multi-Mailbox Support:** View and manage your `Inbox`, `Sent`, `Starred`, and `Drafts` directly from the dashboard.
* **🧠 AI-Powered Prioritization:** Automatically flags emails as `High`, `Medium`, or `Low` priority based on sentiment and urgency signals.
* **📝 Instant AI Summaries:** Generates a 1-2 sentence "TL;DR" for every email, saving you reading time.
* **📅 Shadow Calendar:** Automatically detects scheduling requests (e.g., "meeting tomorrow") and saves them to a Local Calendar widget without cluttering your main Google Calendar.
* **✍️ Smart Auto-Replies:** Generate context-aware replies with customizable tones (`Professional`, `Friendly`, or `Short`).
* **⭐ Seamless Interactions:** Star important emails to train the AI, archive processed messages, and save or send drafts seamlessly.

## 🛠️ Tech Stack

* **Frontend:** React 18, TypeScript, Vite
* **Styling:** Tailwind CSS, Lucide React (Icons)
* **State Management:** Zustand
* **Authentication:** Firebase Auth, Google API Client
* **APIs:** Gmail API (`gmail.readonly`, `gmail.modify`, `gmail.compose`, `gmail.send`)
* **AI Engine:** Proxy API integration (OpenAI/Gemini) with robust heuristic fallbacks.

## 🚀 Getting Started

Follow these steps to run the project locally.

### 1. Clone & Install
```bash
git clone [https://github.com/yourusername/ai-email.git](https://github.com/yourusername/ai-email.git)
cd ai-inbox-assistant
npm install
