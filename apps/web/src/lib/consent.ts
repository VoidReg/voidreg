import { CONSENT_MAX_AGE_SECONDS, COOKIE_CONSENT, getCookie, setCookie } from './cookies';

export const CONSENT_VERSION = 1;
export const OPEN_COOKIE_SETTINGS = 'voidreg:open-cookie-settings';

export type OptionalConsent = {
  analytics: boolean;
  marketing: boolean;
};

export type ConsentPreferences = OptionalConsent & {
  v: number;
  necessary: true;
  ts: number;
};

function isConsentPreferences(value: unknown): value is ConsentPreferences {
  if (!value || typeof value !== 'object') return false;
  const parsed = value as Record<string, unknown>;
  return (
    parsed.v === CONSENT_VERSION &&
    parsed.necessary === true &&
    typeof parsed.analytics === 'boolean' &&
    typeof parsed.marketing === 'boolean' &&
    typeof parsed.ts === 'number'
  );
}

export function parseConsent(raw: string | null): ConsentPreferences | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isConsentPreferences(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isConsentValid(consent: ConsentPreferences | null): consent is ConsentPreferences {
  if (!consent) return false;
  return Date.now() - consent.ts < CONSENT_MAX_AGE_SECONDS * 1000;
}

export function readConsent(): ConsentPreferences | null {
  return parseConsent(getCookie(COOKIE_CONSENT));
}

export function hasValidConsent(): boolean {
  return isConsentValid(readConsent());
}

export function writeConsent(optional: OptionalConsent): ConsentPreferences {
  const consent: ConsentPreferences = {
    v: CONSENT_VERSION,
    necessary: true,
    analytics: optional.analytics,
    marketing: optional.marketing,
    ts: Date.now()
  };
  setCookie(COOKIE_CONSENT, JSON.stringify(consent), CONSENT_MAX_AGE_SECONDS);
  return consent;
}

export function hasConsent(category: keyof OptionalConsent): boolean {
  const consent = readConsent();
  return isConsentValid(consent) && consent[category];
}

export function openCookieSettings(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS));
}
