export type Collection = 'comments' | 'users' | 'sources' | 'blocks' | 'events' | 'audit';
export type Entry = {
  id?: string;
  name?: string;
  email?: string;
  provider?: string;
  kind?: string;
  target?: string;
  status?: string;
  source?: string;
  identity_id?: string;
  article_slug?: string;
  author_name?: string;
  body?: string;
  parent_id?: string;
  parent_author?: string;
  parent_body?: string;
  reason?: string;
  created_at?: string | number;
  last_seen?: number;
  first_seen?: number;
  time?: number;
  expires_at?: number;
  revoked_at?: number;
  active?: number;
  blocked?: number;
  comments?: number;
  spam?: number;
  rejections?: number;
  count?: number;
  accounts?: string[];
  accounts_total?: number;
  action?: string;
  actor?: string;
};
export const COLLECTIONS: { id: Collection; label: string }[] = [
  { id: 'comments', label: 'Comments' },
  { id: 'users', label: 'Users' },
  { id: 'sources', label: 'Sources' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'events', label: 'Spam activity' },
  { id: 'audit', label: 'Moderation history' }
];
const stamp = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
export const date = (value?: number | string | null) =>
  value ? stamp.format(new Date(typeof value === 'number' ? value * 1000 : value)) : 'Not recorded';
