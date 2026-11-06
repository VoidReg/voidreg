import { adminRequest } from '$lib/api';
import type { Article, Page } from '@voidreg/publishing-ui/api';

const TTL_MS = 60_000;

/** Every project, paged in once and reused by the editors until it is invalidated. */
class ProjectCatalog {
  items = $state<Article[]>([]);
  loading = $state(false);
  error = $state('');
  private loadedAt = 0;
  private inflight: Promise<void> | null = null;

  ensure(force = false): Promise<void> {
    if (!force && this.items.length && Date.now() - this.loadedAt < TTL_MS)
      return Promise.resolve();
    this.inflight ??= this.fetchAll().finally(() => (this.inflight = null));
    return this.inflight;
  }
  /** Call after anything that creates, renames, archives or deletes a project. */
  invalidate() {
    this.loadedAt = 0;
  }
  private async fetchAll() {
    this.loading = true;
    this.error = '';
    try {
      const all: Article[] = [];
      for (let page = 1; ; page++) {
        const result = await adminRequest<Page<Article>>(`/projects?per_page=100&page=${page}`);
        all.push(...result.items);
        if (page * result.per_page >= result.total) break;
      }
      this.items = all;
      this.loadedAt = Date.now();
    } catch (cause) {
      this.error = (cause as Error).message;
    } finally {
      this.loading = false;
    }
  }
}
export const catalog = new ProjectCatalog();
