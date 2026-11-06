import type { EntryLike } from '@voidreg/authoring/diff';

export interface RevisionItem {
  revision: number;
  event: string;
  created_at: string;
  title: string;
  blocks: number;
  words: number;
  live: boolean;
}
export interface RevisionList {
  items: RevisionItem[];
  has_more: boolean;
  current: number;
}
export interface RevisionDetail {
  revision: number;
  event: string;
  created_at: string;
  snapshot: EntryLike;
}

export const EVENT_LABELS: Record<string, string> = {
  create: 'Created',
  save: 'Saved',
  publish: 'Published',
  unpublish: 'Unpublished',
  archive: 'Archived',
  'restore-archive': 'Restored from archive',
  revert: 'Reverted to an earlier revision',
  refresh: 'Refreshed compiled output'
};
export const eventLabel = (event: string) => EVENT_LABELS[event] ?? event;

const stamp = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
export function formatStamp(value: string): string {
  // SQLite datetime('now') has no zone and is UTC.
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : value.replace(' ', 'T') + 'Z';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? value : stamp.format(date);
}

export function fieldText(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'None';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  return text.length > 120 ? text.slice(0, 117) + '...' : text;
}
