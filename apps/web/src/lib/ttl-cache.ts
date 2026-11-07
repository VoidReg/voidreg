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

// For expensive documents that crawlers and feed readers poll (feeds, indexes). A fresh entry
// is shared. Once it expires, the old copy is still served while one refresh runs in the
// background, so nobody waits on a rebuild after the first. The old copy is kept for `staleMs`
// at most, and a failed refresh keeps it and retries on the next request.
export class StaleCache<T> {
  #entries = new Map<string, { builtAt: number; value: T; refresh?: Promise<void> }>();
  #pending = new Map<string, Promise<T>>();
  constructor(
    private readonly freshMs: number,
    private readonly staleMs: number,
    private readonly max = 16,
    private readonly now: () => number = Date.now
  ) {}

  async get(key: string, load: () => Promise<T>): Promise<T> {
    const entry = this.#entries.get(key);
    const age = entry ? this.now() - entry.builtAt : Infinity;
    if (entry && age < this.freshMs) return entry.value;
    if (entry && age < this.freshMs + this.staleMs) {
      entry.refresh ??= load().then(
        (value) => {
          this.#store(key, value);
        },
        () => {
          entry.refresh = undefined;
        }
      );
      return entry.value;
    }
    let pending = this.#pending.get(key);
    if (!pending) {
      pending = load()
        .then((value) => {
          this.#store(key, value);
          return value;
        })
        .finally(() => this.#pending.delete(key));
      this.#pending.set(key, pending);
    }
    return pending;
  }

  #store(key: string, value: T) {
    this.#entries.delete(key);
    this.#entries.set(key, { builtAt: this.now(), value });
    if (this.#entries.size > this.max) {
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
  }

  clear() {
    this.#entries.clear();
    this.#pending.clear();
  }
}
