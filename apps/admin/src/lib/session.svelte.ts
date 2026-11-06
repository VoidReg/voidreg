import { ApiError, adminRequest, setUnauthorizedHandler } from './api';

export interface LoginOptions {
  providers: string[];
  password_enabled: boolean;
}

class Session {
  restoring = $state(true);
  loggedIn = $state(false);
  options = $state<LoginOptions | null>(null);
  optionsError = $state('');
  rejectedAccount = $state('');
  /** Shown on the sign-in screen: auth callback failures and expired sessions. */
  notice = $state('');
  busy = $state(false);
  loginError = $state('');

  constructor() {
    setUnauthorizedHandler(() => this.expire());
  }

  async restore(): Promise<boolean> {
    try {
      await adminRequest('/session');
      this.loggedIn = true;
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.status === 401)) {
        this.notice = (cause as Error).message;
      }
    } finally {
      this.restoring = false;
    }
    return this.loggedIn;
  }

  async loadOptions() {
    this.optionsError = '';
    try {
      this.options = await adminRequest<LoginOptions>('/login-options');
    } catch {
      this.optionsError = 'Could not load sign-in options. Please try again.';
    }
  }

  async login(password: string): Promise<boolean> {
    this.busy = true;
    this.loginError = '';
    try {
      await adminRequest('/session', 'POST', { password });
      this.loggedIn = true;
      this.notice = '';
      return true;
    } catch (cause) {
      this.loginError = (cause as Error).message;
      return false;
    } finally {
      this.busy = false;
    }
  }

  async logout() {
    this.busy = true;
    try {
      await adminRequest('/session', 'DELETE');
      this.loggedIn = false;
    } finally {
      this.busy = false;
    }
  }

  expire() {
    if (!this.loggedIn) return;
    this.loggedIn = false;
    this.notice = 'Your session expired. Sign in to keep editing. Unsaved edits stay on this page.';
  }
}
export const session = new Session();
