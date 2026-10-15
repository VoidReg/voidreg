export type DiscussionComment = {
  id: string;
  parent_id: string | null;
  thread_id: string | null;
  replying_to: string | null;
  reply_count: number;
  removed: boolean;
  author_name: string;
  body: string;
  created_at: string;
  verified: boolean;
};
