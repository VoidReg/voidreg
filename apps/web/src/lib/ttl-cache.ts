// A tiny in-memory cache for slow-changing lookups (type-ahead seeds, vocabularies, categories).
// Paging through a list should only fetch the page itself, not these lists again on every click.
// Concurrent requests for one key share a single fetch, and failures are never cached.
export class TtlCache<T> {
  #entries = new Map<string, { expires: number; value: Promise<T> }>();
  constructor(
    private readonly ttlMs: number,
    private readonly max = 64,
    private readonly now: () => number = Date.now
  ) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.#entries.get(key);
    if (hit && hit.expires > this.now()) return hit.value;
    const value = load();
    this.#entries.set(key, { expires: this.now() + this.ttlMs, value });
    value.catch(() => {
      if (this.#entries.get(key)?.value === value) this.#entries.delete(key);
    });
    if (this.#entries.size > this.max) {
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
    return value;
  }

  clear() {
    this.#entries.clear();
  }
}
