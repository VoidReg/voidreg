import { request } from '@voidreg/publishing-ui/api';
import type { SessionData } from './session';

export {
  authErrorMessage,
  providerLabel,
  signInUrl,
  type LinkedAccount,
  type Profile,
  type SessionData,
  type SessionIdentity
} from './session';

/**
 * The visitor's commenter session, shared by the header, the discussion and the
 * account page. It loads in the browser only, so no visitor's data can leak
 * between server-rendered requests.
 */
class SessionStore {
  data = $state<SessionData | undefined>(undefined);
  #pending: Promise<void> | undefined;

  get signedIn(): boolean {
    return !!this.data?.authenticated && !!this.data.profile;
  }

  /** Fetches the session once; pass `force` to refresh it. */
  load(force = false): Promise<void> {
    if (this.#pending) return this.#pending;
    if (this.data && !force) return Promise.resolve();
    this.#pending = request<SessionData>('/auth/session')
      .then((next) => {
        this.data = next;
      })
      .catch(() => {
        this.data ??= { authenticated: false, providers: [] };
      })
      .finally(() => {
        this.#pending = undefined;
      });
    return this.#pending;
  }

  /** Sends a change to the API and adopts the session it returns. */
  async send(path: string, init: RequestInit): Promise<SessionData> {
    const next = await request<SessionData>(path, init);
    this.data = next;
    return next;
  }

  signOut(): Promise<SessionData> {
    return this.send('/auth/session', { method: 'DELETE' });
  }
}

export const session = new SessionStore();
