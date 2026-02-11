import type { EmailDetail, EmailListItem } from '../types/mail'

export const SAMPLE_EMAILS: Array<EmailDetail> = [
  {
    id: 'sample-1',
    from: 'Aisha (Client) <aisha@clientco.com>',
    subject: 'Invoice approval needed today (Project Orion)',
    date: 'Today, 9:12 AM',
    snippet: 'Hi — can you approve invoice #1842 by EOD so we can close this out?',
    bodyText:
      'Hi — can you approve invoice #1842 by EOD so we can close this out?\n\nIf you have any questions, I can jump on a quick call.\n\nThanks,\nAisha',
  },
  {
    id: 'sample-2',
    from: 'Calendar <calendar@company.com>',
    subject: 'Meeting request: Sprint Planning (Thu 10:00 AM)',
    date: 'Yesterday, 4:38 PM',
    snippet: 'You have been invited to Sprint Planning. Please respond.',
    bodyText:
      'You have been invited to Sprint Planning (Thu 10:00 AM).\n\nAgenda:\n- Review goals\n- Capacity planning\n- Risks\n\nPlease accept/decline.',
  },
  {
    id: 'sample-3',
    from: 'Dev Weekly <newsletter@devweekly.io>',
    subject: 'This week in AI: 12 links you’ll actually read',
    date: 'Mon, 8:01 AM',
    snippet: 'Top stories: agents, retrieval, evals, and practical prompts…',
    bodyText:
      'Welcome to Dev Weekly.\n\nTop stories:\n1) Agents in production\n2) Retrieval tips\n3) Evals that work\n\nSee you next week.',
  },
]

export const SAMPLE_LIST: Array<EmailListItem> = SAMPLE_EMAILS.map((e) => ({
  id: e.id,
  from: e.from,
  subject: e.subject,
  date: e.date,
  snippet: e.snippet,
}))

