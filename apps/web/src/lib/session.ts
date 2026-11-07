// Plain helpers and types for the commenter session, kept free of runes so tests can import them.
export type LinkedAccount = {
  identity_id: string;
  provider: string;
  name: string;
  email: string;
  has_avatar: boolean;
  current: boolean;
};
export type Profile = {
  id: string;
  display_name: string;
  show_avatar: boolean;
  avatar_url?: string;
  avatar_identity_id?: string;
  linked: LinkedAccount[];
};
export type SessionIdentity = {
  id: string;
  provider: string;
  name: string;
  email: string;
  avatar_url?: string;
};
export type SessionData = {
  authenticated: boolean;
  identity?: SessionIdentity;
  profile?: Profile;
  providers?: string[];
};

const PROVIDER_LABELS: Record<string, string> = { github: 'GitHub', google: 'Google' };

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

const AUTH_ERRORS: Record<string, string> = {
  sign_in_cancelled: 'Sign-in was cancelled. You can try again whenever you like.',
  already_linked:
    'That account already belongs to another profile. Sign in with it and delete that profile first, or connect a different account.',
  not_authorized: 'That account is not allowed to do this.'
};

/** Message for the `auth_error` code the sign-in redirect leaves in the address. */
export function authErrorMessage(code: string | null | undefined): string {
  if (!code) return '';
  return AUTH_ERRORS[code] ?? 'Sign-in did not complete. Please try again.';
}

/** Start URL of a provider sign-in, or of connecting it to the signed-in profile. */
export function signInUrl(provider: string, returnTo: string, link = false): string {
  const query = `return_to=${encodeURIComponent(returnTo)}${link ? '&link=true' : ''}`;
  return `/api/v1/auth/${provider}/start?${query}`;
}
