export type DiscussionComment = {
  id: string;
  parent_id: string | null;
  thread_id: string | null;
  replying_to: string | null;
  reply_count: number;
  removed: boolean;
  author_name: string;
  /** Proxied photo path, present only when the author chose to show one. */
  avatar_url: string | null;
  body: string;
  created_at: string;
  verified: boolean;
};

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60]
];

/** "3 days ago" style age. Falls back to the date once a comment is older than a month. */
export function age(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      if (unit === 'year' || unit === 'month')
        return new Date(iso).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      return formatter.format(Math.trunc(seconds / size), unit);
    }
  }
  return 'just now';
}

/** First letter of a name, for the avatar. */
export function initial(name: string): string {
  return (Array.from(name.trim())[0] ?? '?').toUpperCase();
}
